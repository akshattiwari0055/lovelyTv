import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getConversationRoom } from "./utils.js";

const onlineUsers = new Map<string, string>();
const waitingQueue = new Set<string>();
const activeMatches = new Map<string, string>();
let queueProcessing = false;

async function isBlockedBetween(userAId: string, userBId: string) {
  const existingBlock = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId }
      ]
    },
    select: { id: true }
  });

  return Boolean(existingBlock);
}

export function getOnlineUserCount() {
  return onlineUsers.size;
}

export function getUserSocketId(userId: string) {
  return onlineUsers.get(userId);
}

export function endActiveMatch(userId: string) {
  const partnerId = activeMatches.get(userId);
  if (!partnerId) {
    return null;
  }

  activeMatches.delete(userId);
  activeMatches.delete(partnerId);
  return partnerId;
}

function getPublicUserPayload(user: Awaited<ReturnType<typeof prisma.user.findUnique>>) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    bio: user.bio,
    interests: user.interests
  };
}

async function processWaitingQueue(io: Server) {
  if (queueProcessing) {
    return;
  }

  queueProcessing = true;

  try {
    let pairedInThisPass = true;

    while (pairedInThisPass) {
      pairedInThisPass = false;
      const queueSnapshot = [...waitingQueue].filter((userId) => onlineUsers.has(userId) && !activeMatches.has(userId));

      for (let index = 0; index < queueSnapshot.length; index += 1) {
        const currentUserId = queueSnapshot[index];

        if (!waitingQueue.has(currentUserId) || activeMatches.has(currentUserId) || !onlineUsers.has(currentUserId)) {
          continue;
        }

        let partnerId: string | null = null;

        for (let partnerIndex = index + 1; partnerIndex < queueSnapshot.length; partnerIndex += 1) {
          const candidateId = queueSnapshot[partnerIndex];

          if (
            !waitingQueue.has(candidateId) ||
            activeMatches.has(candidateId) ||
            !onlineUsers.has(candidateId) ||
            candidateId === currentUserId
          ) {
            continue;
          }

          if (await isBlockedBetween(currentUserId, candidateId)) {
            continue;
          }

          partnerId = candidateId;
          break;
        }

        if (!partnerId) {
          continue;
        }

        waitingQueue.delete(currentUserId);
        waitingQueue.delete(partnerId);

        const [currentUser, partner] = await Promise.all([
          prisma.user.findUnique({ where: { id: currentUserId } }),
          prisma.user.findUnique({ where: { id: partnerId } })
        ]);

        if (!currentUser || !partner || !onlineUsers.has(currentUserId) || !onlineUsers.has(partnerId)) {
          if (onlineUsers.has(currentUserId) && !activeMatches.has(currentUserId)) {
            waitingQueue.add(currentUserId);
          }
          if (onlineUsers.has(partnerId) && !activeMatches.has(partnerId)) {
            waitingQueue.add(partnerId);
          }
          continue;
        }

        const currentUserSocketId = onlineUsers.get(currentUserId);
        const partnerSocketId = onlineUsers.get(partnerId);

        if (!currentUserSocketId || !partnerSocketId) {
          if (currentUserSocketId && !activeMatches.has(currentUserId)) {
            waitingQueue.add(currentUserId);
          }
          if (partnerSocketId && !activeMatches.has(partnerId)) {
            waitingQueue.add(partnerId);
          }
          continue;
        }

        const roomId = `lputv-${currentUserId.slice(0, 6)}-${partnerId.slice(0, 6)}-${Date.now()}`;
        const payload = {
          roomId,
          matchedAt: new Date().toISOString()
        };

        activeMatches.set(currentUserId, partnerId);
        activeMatches.set(partnerId, currentUserId);

        io.to(currentUserSocketId).emit("match:found", {
          ...payload,
          partner: getPublicUserPayload(partner)
        });

        io.to(partnerSocketId).emit("match:found", {
          ...payload,
          partner: getPublicUserPayload(currentUser)
        });

        pairedInThisPass = true;
        break;
      }
    }
  } finally {
    queueProcessing = false;
  }
}

export function attachSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;

    if (!token) {
      return next(new Error("Missing token"));
    }

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
    onlineUsers.set(currentUser.id, socket.id);

    socket.on("join:conversation", ({ otherUserId }: { otherUserId: string }) => {
      socket.join(getConversationRoom(currentUser.id, otherUserId));
    });

    socket.on("message:send", async ({ receiverId, content, imageUrl }: { receiverId: string; content?: string; imageUrl?: string }) => {
      const text = content?.trim();

      if (!text && !imageUrl) {
        return;
      }

      if (await isBlockedBetween(currentUser.id, receiverId)) {
        socket.emit("message:error", {
          message: "You cannot message this user."
        });
        return;
      }

      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userAId: currentUser.id, userBId: receiverId },
            { userAId: receiverId, userBId: currentUser.id }
          ]
        }
      });

      if (!friendship) {
        socket.emit("message:error", {
          message: "You can only message accepted friends."
        });
        return;
      }

      const message = await prisma.message.create({
        data: {
          senderId: currentUser.id,
          receiverId,
          content: text || null,
          imageUrl: imageUrl || null
        }
      });

      io.to(getConversationRoom(currentUser.id, receiverId)).emit("message:new", {
        id: message.id,
        senderId: currentUser.id,
        receiverId,
        content: message.content,
        imageUrl: message.imageUrl,
        isRead: message.isRead,
        createdAt: message.createdAt
      });
    });

    socket.on("message:read", async ({ messageIds, senderId }: { messageIds: string[], senderId: string }) => {
      if (!messageIds || messageIds.length === 0) return;
      
      await prisma.message.updateMany({
        where: {
          id: { in: messageIds },
          receiverId: currentUser.id
        },
        data: { isRead: true }
      });

      // Notify the sender that their messages were read
      io.to(getConversationRoom(currentUser.id, senderId)).emit("message:read:update", {
        messageIds,
        readerId: currentUser.id
      });
    });

    socket.on("typing:start", ({ receiverId }: { receiverId: string }) => {
      io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:started", {
        typerId: currentUser.id
      });
    });

    socket.on("typing:stop", ({ receiverId }: { receiverId: string }) => {
      io.to(getConversationRoom(currentUser.id, receiverId)).emit("typing:stopped", {
        typerId: currentUser.id
      });
    });

    socket.on("call:initiate", ({ receiverId, isVideo, roomId }: { receiverId: string, isVideo: boolean, roomId: string }) => {
      const receiverSocketId = getUserSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("call:incoming", {
          callerId: currentUser.id,
          callerName: currentUser.fullName,
          isVideo,
          roomId
        });
      }
    });

    socket.on("call:accept", ({ callerId, roomId }: { callerId: string, roomId: string }) => {
      const callerSocketId = getUserSocketId(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call:accepted", { roomId });
      }
    });

    socket.on("call:decline", ({ callerId }: { callerId: string }) => {
      const callerSocketId = getUserSocketId(callerId);
      if (callerSocketId) {
        io.to(callerSocketId).emit("call:declined");
      }
    });

    socket.on("match:join-queue", async () => {
      const existingPartnerId = endActiveMatch(currentUser.id);
      if (existingPartnerId) {
        waitingQueue.delete(existingPartnerId);
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

      if (!partnerId) {
        return;
      }

      const partnerSocketId = onlineUsers.get(partnerId);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("match:partner-left", {
          message: `${currentUser.fullName} left the chat.`
        });
      }

      void processWaitingQueue(io);
    });

    socket.on("match:reaction", ({ emoji }: { emoji: string }) => {
      const partnerId = activeMatches.get(currentUser.id);
      if (!partnerId || !emoji) {
        return;
      }

      const partnerSocketId = onlineUsers.get(partnerId);
      if (!partnerSocketId) {
        return;
      }

      io.to(partnerSocketId).emit("match:reaction", {
        emoji,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        createdAt: new Date().toISOString()
      });
    });

    socket.on("match:chat", ({ message }: { message: string }) => {
      const partnerId = activeMatches.get(currentUser.id);
      const trimmedMessage = message?.trim();

      if (!partnerId || !trimmedMessage) {
        return;
      }

      const partnerSocketId = onlineUsers.get(partnerId);
      if (!partnerSocketId) {
        return;
      }

      const payload = {
        id: `${currentUser.id}-${Date.now()}`,
        message: trimmedMessage,
        senderId: currentUser.id,
        senderName: currentUser.fullName,
        createdAt: new Date().toISOString()
      };

      socket.emit("match:chat", payload);
      io.to(partnerSocketId).emit("match:chat", payload);
    });

    socket.on("disconnect", () => {
      const partnerId = endActiveMatch(currentUser.id);
      if (partnerId) {
        const partnerSocketId = onlineUsers.get(partnerId);
        if (partnerSocketId) {
          io.to(partnerSocketId).emit("match:partner-left", {
            message: `${currentUser.fullName} disconnected.`
          });
        }
      }

      waitingQueue.delete(currentUser.id);
      onlineUsers.delete(currentUser.id);
      void processWaitingQueue(io);
    });
  });
}
