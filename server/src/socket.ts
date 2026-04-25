import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getConversationRoom } from "./utils.js";

// ─── state ────────────────────────────────────────────────────────────────────
const onlineUsers = new Map();   // userId → Set<socketId>
const waitingQueue = new Set();  // userId
const activeMatches = new Map(); // userId → partnerId
let queueProcessing = false;
let pendingQueueRun = false;     // FIX: tracks if a run was requested while busy

// ─── helpers ──────────────────────────────────────────────────────────────────
function isOnline(userId) {
    const sockets = onlineUsers.get(userId);
    return Boolean(sockets && sockets.size > 0);
}

function getSocketId(userId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets || sockets.size === 0) return undefined;
    // Return the first (oldest/most stable) socket, not the last
    return sockets.values().next().value;
}

function registerSocket(userId, socketId) {
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socketId);
}

function unregisterSocket(userId, socketId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets) return true;
    sockets.delete(socketId);
    if (sockets.size === 0) {
        onlineUsers.delete(userId);
        return true;
    }
    return false;
}

async function isBlockedBetween(userAId, userBId) {
    const block = await prisma.userBlock.findFirst({
        where: {
            OR: [
                { blockerId: userAId, blockedId: userBId },
                { blockerId: userBId, blockedId: userAId },
            ],
        },
        select: { id: true },
    });
    return Boolean(block);
}

function getPublicUserPayload(user) {
    if (!user) return null;
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        bio: user.bio,
        interests: user.interests,
    };
}

// ─── public API ───────────────────────────────────────────────────────────────
export function getOnlineUserCount() {
    return onlineUsers.size;
}

export function getUserSocketId(userId) {
    return getSocketId(userId);
}

export function endActiveMatch(userId) {
    const partnerId = activeMatches.get(userId);
    if (!partnerId) return null;
    activeMatches.delete(userId);
    activeMatches.delete(partnerId);
    return partnerId;
}

// ─── queue processor ──────────────────────────────────────────────────────────
//
// FIX 1: Don't bail on queueProcessing — set a pendingQueueRun flag instead.
//         This ensures no user is permanently stranded after joining during an
//         active processing run.
//
// FIX 2: Match ALL eligible pairs in a single pass (O(n) pairing per sweep)
//         instead of breaking after the first match and restarting from scratch.
//         Under high load the old approach meant late arrivals waited through
//         O(n) full restarts before being matched.
//
// FIX 3: Pre-fetch ALL user records in one batched DB call instead of two
//         individual queries per pair. This eliminates the N×2 Prisma roundtrips
//         that caused visible latency (black screen) with ≥ ~20 queued users.
//
async function processWaitingQueue(io) {
    if (queueProcessing) {
        // FIX 1: signal that another run is needed once the current one finishes
        pendingQueueRun = true;
        return;
    }

    queueProcessing = true;
    pendingQueueRun = false;

    try {
        // Keep sweeping until no new pairs can be formed
        let madeAPair = true;
        while (madeAPair) {
            madeAPair = false;

            // Snapshot eligible users: online, in queue, not already matched
            const eligible = [...waitingQueue].filter(
                (id) => isOnline(id) && !activeMatches.has(id)
            );

            if (eligible.length < 2) break;

            // FIX 3: Batch-fetch all eligible user records in one query
            const userRecords = await prisma.user.findMany({
                where: { id: { in: eligible } },
            });
            const userMap = new Map(userRecords.map((u) => [u.id, u]));

            // Track which users we've already paired this sweep
            const pairedThisSweep = new Set();

            // FIX 2: Inner loop pairs as many as possible without restarting
            for (let i = 0; i < eligible.length; i++) {
                const currentUserId = eligible[i];

                if (
                    pairedThisSweep.has(currentUserId) ||
                    !waitingQueue.has(currentUserId) ||
                    activeMatches.has(currentUserId) ||
                    !isOnline(currentUserId)
                ) continue;

                for (let j = i + 1; j < eligible.length; j++) {
                    const candidateId = eligible[j];

                    if (
                        pairedThisSweep.has(candidateId) ||
                        !waitingQueue.has(candidateId) ||
                        activeMatches.has(candidateId) ||
                        !isOnline(candidateId) ||
                        candidateId === currentUserId
                    ) continue;

                    // Check block status (async — unavoidable)
                    if (await isBlockedBetween(currentUserId, candidateId)) continue;

                    const currentUser = userMap.get(currentUserId);
                    const partner = userMap.get(candidateId);

                    // If either record is missing, skip this pair
                    if (!currentUser || !partner) continue;

                    const currentUserSocketId = getSocketId(currentUserId);
                    const partnerSocketId = getSocketId(candidateId);

                    if (!currentUserSocketId || !partnerSocketId) {
                        // Re-validate online status; one of them disconnected
                        if (!isOnline(currentUserId)) break; // skip rest of j-loop too
                        continue;
                    }

                    // ── Commit the match ──────────────────────────────────────
                    waitingQueue.delete(currentUserId);
                    waitingQueue.delete(candidateId);
                    pairedThisSweep.add(currentUserId);
                    pairedThisSweep.add(candidateId);
                    activeMatches.set(currentUserId, candidateId);
                    activeMatches.set(candidateId, currentUserId);

                    const roomId = `lputv-${currentUserId.slice(0, 6)}-${candidateId.slice(0, 6)}-${Date.now()}`;
                    const basePayload = { roomId, matchedAt: new Date().toISOString() };

                    io.to(currentUserSocketId).emit("match:found", {
                        ...basePayload,
                        partner: getPublicUserPayload(partner),
                    });
                    io.to(partnerSocketId).emit("match:found", {
                        ...basePayload,
                        partner: getPublicUserPayload(currentUser),
                    });

                    madeAPair = true;
                    break; // move on to next i
                }
            }
        }
    } finally {
        queueProcessing = false;

        // FIX 1: if something was queued while we were busy, run again
        if (pendingQueueRun) {
            pendingQueueRun = false;
            void processWaitingQueue(io);
        }
    }
}

// ─── queue retry for stuck users ─────────────────────────────────────────────
//
// FIX 4: Periodically re-trigger queue processing so users who joined while
//         the queue was busy and somehow slipped past the pendingQueueRun flag
//         are not stuck waiting forever (e.g. after a network blip).
//
function startQueueHealthCheck(io) {
    setInterval(() => {
        if (waitingQueue.size >= 2 && !queueProcessing) {
            void processWaitingQueue(io);
        }
    }, 3000); // every 3 s — lightweight since it's a no-op when queue is empty
}

// ─── socket handlers ──────────────────────────────────────────────────────────
export function attachSocketHandlers(io) {
    // Start the health-check ticker
    startQueueHealthCheck(io);

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Missing token"));
        try {
            const payload = jwt.verify(token, config.jwtSecret);
            socket.data.user = payload;
            next();
        } catch {
            next(new Error("Invalid token"));
        }
    });

    io.on("connection", (socket) => {
        const currentUser = socket.data.user;
        registerSocket(currentUser.id, socket.id);

        // ── messaging ─────────────────────────────────────────────────────────
        socket.on("join:conversation", ({ otherUserId }) => {
            socket.join(getConversationRoom(currentUser.id, otherUserId));
        });

        socket.on("message:send", async ({ receiverId, content, imageUrl }) => {
            const text = content?.trim();
            if (!text && !imageUrl) return;

            if (await isBlockedBetween(currentUser.id, receiverId)) {
                socket.emit("message:error", { message: "You cannot message this user." });
                return;
            }

            const friendship = await prisma.friendship.findFirst({
                where: {
                    OR: [
                        { userAId: currentUser.id, userBId: receiverId },
                        { userAId: receiverId, userBId: currentUser.id },
                    ],
                },
            });

            if (!friendship) {
                socket.emit("message:error", { message: "You can only message accepted friends." });
                return;
            }

            const message = await prisma.message.create({
                data: {
                    senderId: currentUser.id,
                    receiverId,
                    content: text || null,
                    imageUrl: imageUrl || null,
                },
            });

            io.to(getConversationRoom(currentUser.id, receiverId)).emit("message:new", {
                id: message.id,
                senderId: currentUser.id,
                receiverId,
                content: message.content,
                imageUrl: message.imageUrl,
                isRead: message.isRead,
                createdAt: message.createdAt,
            });
        });

        socket.on("message:read", async ({ messageIds, senderId }) => {
            if (!messageIds || messageIds.length === 0) return;
            await prisma.message.updateMany({
                where: { id: { in: messageIds }, receiverId: currentUser.id },
                data: { isRead: true },
            });
            io.to(getConversationRoom(currentUser.id, senderId)).emit("message:read:update", {
                messageIds,
                readerId: currentUser.id,
            });
        });

        socket.on("typing:start", ({ receiverId }) => {
            io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:started", {
                typerId: currentUser.id,
            });
        });

        socket.on("typing:stop", ({ receiverId }) => {
            io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:stopped", {
                typerId: currentUser.id,
            });
        });

        // ── p2p calls ─────────────────────────────────────────────────────────
        socket.on("call:initiate", ({ receiverId, isVideo, roomId }) => {
            const receiverSocketId = getSocketId(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit("call:incoming", {
                    callerId: currentUser.id,
                    callerName: currentUser.fullName,
                    isVideo,
                    roomId,
                });
            }
        });

        socket.on("call:accept", ({ callerId, roomId }) => {
            const callerSocketId = getSocketId(callerId);
            if (callerSocketId) io.to(callerSocketId).emit("call:accepted", { roomId });
        });

        socket.on("call:decline", ({ callerId }) => {
            const callerSocketId = getSocketId(callerId);
            if (callerSocketId) io.to(callerSocketId).emit("call:declined");
        });

        // ── random matching ───────────────────────────────────────────────────
        socket.on("match:join-queue", async () => {
            const existingPartnerId = endActiveMatch(currentUser.id);
            if (existingPartnerId) {
                const partnerSocketId = getSocketId(existingPartnerId);
                if (partnerSocketId) {
                    io.to(partnerSocketId).emit("match:partner-left", {
                        message: `${currentUser.fullName} joined a new match.`,
                    });
                }
            }

            waitingQueue.add(currentUser.id);
            socket.emit("match:waiting");
            await processWaitingQueue(io);
        });

        socket.on("match:leave-queue", () => {
            waitingQueue.delete(currentUser.id);
        });

        socket.on("match:leave-room", () => {
            const partnerId = endActiveMatch(currentUser.id);
            if (!partnerId) return;

            const partnerSocketId = getSocketId(partnerId);
            if (partnerSocketId) {
                io.to(partnerSocketId).emit("match:partner-left", {
                    message: `${currentUser.fullName} left the chat.`,
                });
            }

            waitingQueue.delete(currentUser.id);
            void processWaitingQueue(io);
        });

        socket.on("match:reaction", ({ emoji }) => {
            const partnerId = activeMatches.get(currentUser.id);
            if (!partnerId || !emoji) return;
            const partnerSocketId = getSocketId(partnerId);
            if (!partnerSocketId) return;
            io.to(partnerSocketId).emit("match:reaction", {
                emoji,
                senderId: currentUser.id,
                senderName: currentUser.fullName,
                createdAt: new Date().toISOString(),
            });
        });

        socket.on("match:chat", ({ message }) => {
            const partnerId = activeMatches.get(currentUser.id);
            const trimmedMessage = message?.trim();
            if (!partnerId || !trimmedMessage) return;
            const partnerSocketId = getSocketId(partnerId);
            if (!partnerSocketId) return;

            const payload = {
                id: `${currentUser.id}-${Date.now()}`,
                message: trimmedMessage,
                senderId: currentUser.id,
                senderName: currentUser.fullName,
                createdAt: new Date().toISOString(),
            };

            socket.emit("match:chat", payload);
            io.to(partnerSocketId).emit("match:chat", payload);
        });

        // ── disconnect ────────────────────────────────────────────────────────
        socket.on("disconnect", () => {
            const userFullyOffline = unregisterSocket(currentUser.id, socket.id);
            if (!userFullyOffline) return;

            waitingQueue.delete(currentUser.id);
            const partnerId = endActiveMatch(currentUser.id);
            if (partnerId) {
                const partnerSocketId = getSocketId(partnerId);
                if (partnerSocketId) {
                    io.to(partnerSocketId).emit("match:partner-left", {
                        message: `${currentUser.fullName} disconnected.`,
                    });
                }
            }

            void processWaitingQueue(io);
        });
    });
}