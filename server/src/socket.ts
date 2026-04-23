import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { getConversationRoom } from "./utils.js";

const onlineUsers = new Map<string, string>();
const waitingQueue = new Set<string>();
const activeMatches = new Map<string, string>();

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

      const candidates = [...waitingQueue].filter((id) => id !== currentUser.id && onlineUsers.has(id));
      let partnerId: string | undefined;

      for (const candidateId of candidates) {
        if (!(await isBlockedBetween(currentUser.id, candidateId))) {
          partnerId = candidateId;
          break;
        }
      }

      if (!partnerId) {
        waitingQueue.add(currentUser.id);
        socket.emit("match:waiting");
        return;
      }

      waitingQueue.delete(partnerId);

      const [me, partner] = await Promise.all([
        prisma.user.findUnique({ where: { id: currentUser.id } }),
        prisma.user.findUnique({ where: { id: partnerId } })
      ]);

      if (!me || !partner) {
        waitingQueue.add(currentUser.id);
        socket.emit("match:waiting");
        return;
      }

      const roomId = `lputv-${currentUser.id.slice(0, 6)}-${partnerId.slice(0, 6)}-${Date.now()}`;
      const payload = {
        roomId,
        matchedAt: new Date().toISOString()
      };

      activeMatches.set(currentUser.id, partner.id);
      activeMatches.set(partner.id, currentUser.id);

      socket.emit("match:found", {
        ...payload,
        partner: {
          id: partner.id,
          fullName: partner.fullName,
          email: partner.email,
          bio: partner.bio,
          interests: partner.interests
        }
      });

      const partnerSocketId = onlineUsers.get(partnerId);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("match:found", {
          ...payload,
          partner: {
            id: me.id,
            fullName: me.fullName,
            email: me.email,
            bio: me.bio,
            interests: me.interests
          }
        });
      }
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
    });
  });
}
