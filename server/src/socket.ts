import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getConversationRoom } from "./utils.js";

// ─── state ────────────────────────────────────────────────────────────────────
//
// FIX: onlineUsers maps  userId → Set<socketId>  instead of  userId → socketId
//
// Why: When a socket reconnects the NEW socket registers first, then the OLD
// socket fires "disconnect". With a plain Map<userId, socketId> the disconnect
// handler deleted the NEW (live) socket, making the user appear offline even
// though they were still connected. A Set per user avoids this entirely.
//
const onlineUsers   = new Map<string, Set<string>>(); // userId → Set<socketId>
const waitingQueue  = new Set<string>();              // userId
const activeMatches = new Map<string, string>();      // userId → partnerId
let   queueProcessing = false;

// ─── helpers ──────────────────────────────────────────────────────────────────

function isOnline(userId: string): boolean {
  const sockets = onlineUsers.get(userId);
  return Boolean(sockets && sockets.size > 0);
}

/** Returns the most-recently registered socketId for a user. */
function getSocketId(userId: string): string | undefined {
  const sockets = onlineUsers.get(userId);
  if (!sockets || sockets.size === 0) return undefined;
  let last: string | undefined;
  for (const id of sockets) last = id;
  return last;
}

function registerSocket(userId: string, socketId: string): void {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId)!.add(socketId);
}

/**
 * Removes a specific socketId for a user.
 * Returns true when the user has NO sockets left (fully offline).
 */
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

async function isBlockedBetween(userAId: string, userBId: string): Promise<boolean> {
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

function getPublicUserPayload(user: Awaited<ReturnType<typeof prisma.user.findUnique>>) {
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

async function processWaitingQueue(io: Server): Promise<void> {
  if (queueProcessing) return;
  queueProcessing = true;

  try {
    let pairedInThisPass = true;

    while (pairedInThisPass) {
      pairedInThisPass = false;

      // Only consider users who are online and not already matched
      const queueSnapshot = [...waitingQueue].filter(
        (id) => isOnline(id) && !activeMatches.has(id)
      );

      for (let i = 0; i < queueSnapshot.length; i++) {
        const currentUserId = queueSnapshot[i];

        // Re-validate — state may have changed during async awaits
        if (
          !waitingQueue.has(currentUserId) ||
          activeMatches.has(currentUserId) ||
          !isOnline(currentUserId)
        ) continue;

        let partnerId: string | null = null;

        for (let j = i + 1; j < queueSnapshot.length; j++) {
          const candidateId = queueSnapshot[j];

          if (
            !waitingQueue.has(candidateId) ||
            activeMatches.has(candidateId) ||
            !isOnline(candidateId) ||
            candidateId === currentUserId
          ) continue;

          if (await isBlockedBetween(currentUserId, candidateId)) continue;

          partnerId = candidateId;
          break;
        }

        if (!partnerId) continue;

        // Remove both from queue immediately to prevent double-matching
        waitingQueue.delete(currentUserId);
        waitingQueue.delete(partnerId);

        const [currentUser, partner] = await Promise.all([
          prisma.user.findUnique({ where: { id: currentUserId } }),
          prisma.user.findUnique({ where: { id: partnerId } }),
        ]);

        // If either user vanished while fetching, restore survivors
        if (!currentUser || !partner || !isOnline(currentUserId) || !isOnline(partnerId)) {
          if (isOnline(currentUserId) && !activeMatches.has(currentUserId)) waitingQueue.add(currentUserId);
          if (partnerId && isOnline(partnerId) && !activeMatches.has(partnerId)) waitingQueue.add(partnerId);
          continue;
        }

        const currentUserSocketId = getSocketId(currentUserId);
        const partnerSocketId     = getSocketId(partnerId);

        if (!currentUserSocketId || !partnerSocketId) {
          if (currentUserSocketId && !activeMatches.has(currentUserId)) waitingQueue.add(currentUserId);
          if (partnerSocketId     && !activeMatches.has(partnerId))     waitingQueue.add(partnerId);
          continue;
        }

        activeMatches.set(currentUserId, partnerId);
        activeMatches.set(partnerId, currentUserId);

        const roomId      = `lputv-${currentUserId.slice(0, 6)}-${partnerId.slice(0, 6)}-${Date.now()}`;
        const basePayload = { roomId, matchedAt: new Date().toISOString() };

        io.to(currentUserSocketId).emit("match:found", {
          ...basePayload,
          partner: getPublicUserPayload(partner),
        });

        io.to(partnerSocketId).emit("match:found", {
          ...basePayload,
          partner: getPublicUserPayload(currentUser),
        });

        pairedInThisPass = true;
        break; // restart while loop with a fresh snapshot
      }
    }
  } finally {
    queueProcessing = false;
  }
}

// ─── socket handlers ──────────────────────────────────────────────────────────

export function attachSocketHandlers(io: Server): void {
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

    // FIX: add this socketId to the user's set — do NOT overwrite other active
    // sockets for the same user (handles tab duplication & silent reconnects)
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

        if (await isBlockedBetween(currentUser.id, receiverId)) {
          socket.emit("message:error", { message: "You cannot message this user." });
          return;
        }

        const friendship = await prisma.friendship.findFirst({
          where: {
            OR: [
              { userAId: currentUser.id, userBId: receiverId },
              { userAId: receiverId,     userBId: currentUser.id },
            ],
          },
        });

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
      // FIX: if user was in a match, notify partner before ending it.
      // Old code silently deleted the partner from the queue — they ended up
      // in limbo: not matched, not queued, waiting forever.
      const existingPartnerId = endActiveMatch(currentUser.id);
      if (existingPartnerId) {
        const partnerSocketId = getSocketId(existingPartnerId);
        if (partnerSocketId) {
          io.to(partnerSocketId).emit("match:partner-left", {
            message: `${currentUser.fullName} joined a new match.`,
          });
        }
        // Do NOT force-remove partner from queue — their client decides that.
      }

      // Idempotent add — safe to call even if already in queue
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

      // FIX: remove leaving user from queue — they explicitly left,
      // so they must not be auto-rematched until their client asks again.
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
      // FIX: only treat the user as gone when ALL their sockets have closed.
      //
      // Old code called onlineUsers.delete(userId) on any disconnect, which
      // wiped out the NEW socket registered during a reconnect. The user
      // appeared offline, couldn't be matched, and caused self-matches because
      // their ghost queue entry still referenced them as "online".
      //
      const userFullyOffline = unregisterSocket(currentUser.id, socket.id);

      if (!userFullyOffline) {
        // User still has other active sockets — leave everything intact.
        return;
      }

      // User is fully offline — clean up.
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