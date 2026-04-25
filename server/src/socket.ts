import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getConversationRoom } from "./utils.js";

// ─── state ────────────────────────────────────────────────────────────────────
const onlineUsers     = new Map<string, Set<string>>(); // userId → Set<socketId>
const waitingQueue    = new Set<string>();               // userId
const activeMatches   = new Map<string, string>();       // userId → partnerId
const recentlySkipped = new Map<string, Set<string>>();  // FIX: userId → Set<skippedUserId>
let   queueProcessing = false;
let   pendingQueueRun = false;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

function getSocketId(userId: string): string | undefined {
  const sockets = onlineUsers.get(userId);
  if (!sockets || sockets.size === 0) return undefined;
  return sockets.values().next().value as string | undefined;
}

function registerSocket(userId: string, socketId: string): void {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId)!.add(socketId);
}

function unregisterSocket(userId: string, socketId: string): boolean {
  const sockets = onlineUsers.get(userId);
  if (!sockets) return true;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineUsers.delete(userId);
    return true;
  }
  return false;
}

// FIX: record a mutual skip between two users, auto-expiring after `ttlMs`
function recordSkip(userAId: string, userBId: string, ttlMs = 60_000): void {
  for (const [self, other] of [
    [userAId, userBId],
    [userBId, userAId],
  ] as const) {
    if (!recentlySkipped.has(self)) recentlySkipped.set(self, new Set());
    recentlySkipped.get(self)!.add(other);
    setTimeout(() => {
      recentlySkipped.get(self)?.delete(other);
    }, ttlMs);
  }
}

// FIX: check if either user has recently skipped the other
function wereRecentlySkipped(userAId: string, userBId: string): boolean {
  return (
    recentlySkipped.get(userAId)?.has(userBId) === true ||
    recentlySkipped.get(userBId)?.has(userAId) === true
  );
}

function getPublicUserPayload(user: Awaited<ReturnType<typeof prisma.user.findUnique>>) {
  if (!user) return null;
  return {
    id:        user.id,
    fullName:  user.fullName,
    email:     user.email,
    bio:       user.bio,
    interests: user.interests,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

export function getOnlineUserCount(): number {
  return onlineUsers.size;
}

export function getUserSocketId(userId: string): string | undefined {
  return getSocketId(userId);
}

export function endActiveMatch(userId: string): string | null {
  const partnerId = activeMatches.get(userId);
  if (!partnerId) return null;
  activeMatches.delete(userId);
  activeMatches.delete(partnerId);
  return partnerId;
}

// ─── queue processor ──────────────────────────────────────────────────────────
//
// FIX 1: pendingQueueRun — don't drop queue calls that arrive while busy.
// FIX 2: Pair ALL eligible users per sweep instead of break+restart each time.
// FIX 3: Single batched block query for the whole eligible set (O(1) lookups).
// FIX 4: Skip recently-skipped pairs to prevent immediate re-match after skip.
// FIX 5: 3-second health-check ticker catches any stragglers.
//
async function processWaitingQueue(io: Server): Promise<void> {
  if (queueProcessing) {
    pendingQueueRun = true;
    return;
  }

  queueProcessing = true;
  pendingQueueRun = false;

  try {
    let madeAPair = true;

    while (madeAPair) {
      madeAPair = false;

      const eligible = [...waitingQueue].filter(
        (id) => isOnline(id) && !activeMatches.has(id)
      );

      if (eligible.length < 2) break;

      // Batch-fetch all user records in one query
      const userRecords = await prisma.user.findMany({
        where: { id: { in: eligible } },
      });
      const userMap = new Map(userRecords.map((u) => [u.id, u]));

      // FIX 3: Batch-fetch ALL block relationships for the eligible set in one query
      const blocks = await prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: { in: eligible } },
            { blockedId: { in: eligible } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      });

      // Build an O(1) blocked-pair lookup set
      const blockedSet = new Set(
        blocks.map((b) => `${b.blockerId}:${b.blockedId}`)
      );
      const isBlocked = (a: string, b: string): boolean =>
        blockedSet.has(`${a}:${b}`) || blockedSet.has(`${b}:${a}`);

      const pairedThisSweep = new Set<string>();

      // FIX 2: pair as many users as possible in a single sweep
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

          // FIX 4: skip pairs that recently skipped each other
          if (wereRecentlySkipped(currentUserId, candidateId)) continue;

          // FIX 3: use in-memory set instead of a DB round-trip per pair
          if (isBlocked(currentUserId, candidateId)) continue;

          const currentUser = userMap.get(currentUserId);
          const partner     = userMap.get(candidateId);
          if (!currentUser || !partner) continue;

          const currentUserSocketId = getSocketId(currentUserId);
          const partnerSocketId     = getSocketId(candidateId);

          if (!currentUserSocketId || !partnerSocketId) {
            if (!isOnline(currentUserId)) break;
            continue;
          }

          // ── Commit the match ──────────────────────────────────────────────
          waitingQueue.delete(currentUserId);
          waitingQueue.delete(candidateId);
          pairedThisSweep.add(currentUserId);
          pairedThisSweep.add(candidateId);
          activeMatches.set(currentUserId, candidateId);
          activeMatches.set(candidateId, currentUserId);

          const roomId      = `lputv-${currentUserId.slice(0, 6)}-${candidateId.slice(0, 6)}-${Date.now()}`;
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
          break; // move to next i
        }
      }
    }
  } finally {
    queueProcessing = false;

    if (pendingQueueRun) {
      pendingQueueRun = false;
      void processWaitingQueue(io);
    }
  }
}

// FIX 5: periodic health-check — re-triggers queue every 3 s if users are waiting
function startQueueHealthCheck(io: Server): void {
  setInterval(() => {
    if (waitingQueue.size >= 2 && !queueProcessing) {
      void processWaitingQueue(io);
    }
  }, 3000);
}

// ─── socket handlers ──────────────────────────────────────────────────────────

export function attachSocketHandlers(io: Server): void {
  startQueueHealthCheck(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error("Missing token"));
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { id: string; fullName: string };
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const currentUser = socket.data.user as { id: string; fullName: string };

    registerSocket(currentUser.id, socket.id);

    // ── messaging ─────────────────────────────────────────────────────────────

    socket.on("join:conversation", ({ otherUserId }: { otherUserId: string }) => {
      socket.join(getConversationRoom(currentUser.id, otherUserId));
    });

    socket.on(
      "message:send",
      async ({ receiverId, content, imageUrl }: { receiverId: string; content?: string; imageUrl?: string }) => {
        const text = content?.trim();
        if (!text && !imageUrl) return;

        const [blocked, friendship] = await Promise.all([
          prisma.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: currentUser.id, blockedId: receiverId },
                { blockerId: receiverId, blockedId: currentUser.id },
              ],
            },
            select: { id: true },
          }),
          prisma.friendship.findFirst({
            where: {
              OR: [
                { userAId: currentUser.id, userBId: receiverId },
                { userAId: receiverId,     userBId: currentUser.id },
              ],
            },
          }),
        ]);

        if (blocked) {
          socket.emit("message:error", { message: "You cannot message this user." });
          return;
        }

        if (!friendship) {
          socket.emit("message:error", { message: "You can only message accepted friends." });
          return;
        }

        const message = await prisma.message.create({
          data: {
            senderId:  currentUser.id,
            receiverId,
            content:  text || null,
            imageUrl: imageUrl || null,
          },
        });

        io.to(getConversationRoom(currentUser.id, receiverId)).emit("message:new", {
          id:        message.id,
          senderId:  currentUser.id,
          receiverId,
          content:   message.content,
          imageUrl:  message.imageUrl,
          isRead:    message.isRead,
          createdAt: message.createdAt,
        });
      }
    );

    socket.on(
      "message:read",
      async ({ messageIds, senderId }: { messageIds: string[]; senderId: string }) => {
        if (!messageIds || messageIds.length === 0) return;

        await prisma.message.updateMany({
          where: { id: { in: messageIds }, receiverId: currentUser.id },
          data:  { isRead: true },
        });

        io.to(getConversationRoom(currentUser.id, senderId)).emit("message:read:update", {
          messageIds,
          readerId: currentUser.id,
        });
      }
    );

    socket.on("typing:start", ({ receiverId }: { receiverId: string }) => {
      io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:started", {
        typerId: currentUser.id,
      });
    });

    socket.on("typing:stop", ({ receiverId }: { receiverId: string }) => {
      io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:stopped", {
        typerId: currentUser.id,
      });
    });

    // ── p2p calls ─────────────────────────────────────────────────────────────

    socket.on(
      "call:initiate",
      ({ receiverId, isVideo, roomId }: { receiverId: string; isVideo: boolean; roomId: string }) => {
        const receiverSocketId = getSocketId(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit("call:incoming", {
            callerId:   currentUser.id,
            callerName: currentUser.fullName,
            isVideo,
            roomId,
          });
        }
      }
    );

    socket.on("call:accept", ({ callerId, roomId }: { callerId: string; roomId: string }) => {
      const callerSocketId = getSocketId(callerId);
      if (callerSocketId) io.to(callerSocketId).emit("call:accepted", { roomId });
    });

    socket.on("call:decline", ({ callerId }: { callerId: string }) => {
      const callerSocketId = getSocketId(callerId);
      if (callerSocketId) io.to(callerSocketId).emit("call:declined");
    });

    // ── random matching ───────────────────────────────────────────────────────

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

      // FIX 4: record the mutual skip BEFORE notifying the partner
      // so that when partner auto-rejoins the queue they won't be
      // immediately re-matched with the user who just skipped them.
      recordSkip(currentUser.id, partnerId);

      const partnerSocketId = getSocketId(partnerId);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("match:partner-left", {
          message: `${currentUser.fullName} left the chat.`,
        });
      }

      waitingQueue.delete(currentUser.id);
      void processWaitingQueue(io);
    });

    socket.on("match:reaction", ({ emoji }: { emoji: string }) => {
      const partnerId = activeMatches.get(currentUser.id);
      if (!partnerId || !emoji) return;

      const partnerSocketId = getSocketId(partnerId);
      if (!partnerSocketId) return;

      io.to(partnerSocketId).emit("match:reaction", {
        emoji,
        senderId:   currentUser.id,
        senderName: currentUser.fullName,
        createdAt:  new Date().toISOString(),
      });
    });

    socket.on("match:chat", ({ message }: { message: string }) => {
      const partnerId      = activeMatches.get(currentUser.id);
      const trimmedMessage = message?.trim();
      if (!partnerId || !trimmedMessage) return;

      const partnerSocketId = getSocketId(partnerId);
      if (!partnerSocketId) return;

      const payload = {
        id:         `${currentUser.id}-${Date.now()}`,
        message:    trimmedMessage,
        senderId:   currentUser.id,
        senderName: currentUser.fullName,
        createdAt:  new Date().toISOString(),
      };

      socket.emit("match:chat", payload);
      io.to(partnerSocketId).emit("match:chat", payload);
    });

    // ── disconnect ────────────────────────────────────────────────────────────

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