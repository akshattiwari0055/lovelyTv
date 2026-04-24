import cors from "cors";
import bcrypt from "bcryptjs";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { requireAuth, signToken } from "./auth.js";
import { attachSocketHandlers, endActiveMatch, getOnlineUserCount, getUserSocketId } from "./socket.js";
import { verifyGoogleCredential } from "./google.js";
import { sendOtpEmail } from "./mail.js";
import { checkOtp, createOtp, verifyOtp } from "./otp.js";
import { areSameUsers, getConversationRoom, isLpuEmail, normalizeFriendPair, normalizeUserPair } from "./utils.js";

const app = express();
const httpServer = createServer(app);

const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
  if (!origin || config.clientUrls.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin} is not allowed by CORS`));
};

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true
  }
});

attachSocketHandlers(io);

async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }]
    },
    select: {
      blockerId: true,
      blockedId: true
    }
  });

  return new Set<string>(
    blocks.map((block: { blockerId: string; blockedId: string }) =>
      block.blockerId === userId ? block.blockedId : block.blockerId
    )
  );
}

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

app.use(
  cors({
    origin: corsOrigin,
    credentials: true
  })
);
app.use(express.json());
app.set("trust proxy", 1);

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "LPU TV backend",
    health: "/api/health"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    allowedOrigins: config.clientUrls
  });
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/api/public/stats", async (_req, res) => {
  const [registeredStudents, verifiedStudents] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        emailVerified: true
      }
    })
  ]);

  res.json({
    onlineNow: getOnlineUserCount(),
    registeredStudents,
    verifiedStudents
  });
});

function createAuthResponse(user: {
  id: string;
  fullName: string;
  email: string;
  registrationNo: string;
  bio: string | null;
  interests: string | null;
}) {
  const token = signToken({
    id: user.id,
    email: user.email,
    fullName: user.fullName
  });

  return {
    token,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      registrationNo: user.registrationNo,
      bio: user.bio,
      interests: user.interests
    }
  };
}

app.post("/api/auth/request-otp", async (req, res) => {
  const { email, purpose } = req.body as { email: string; purpose: "register" | "login" };
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedEmail || !purpose) {
    return res.status(400).json({ message: "Email and purpose are required" });
  }

  if (!isLpuEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Use your official LPU email address" });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (purpose === "register" && user) {
    return res.status(409).json({ message: "Account already exists. Try login instead." });
  }

  if (purpose === "login" && !user) {
    return res.status(404).json({ message: "No student account found for OTP login." });
  }

  try {
    const otp = await createOtp(normalizedEmail, purpose);
    await sendOtpEmail(normalizedEmail, otp);
    return res.json({ success: true, message: "OTP sent to your LPU email." });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Could not send OTP"
    });
  }
});

app.post("/api/auth/check-otp", async (req, res) => {
  const { email, purpose, otp } = req.body as { email: string; purpose: "register" | "login"; otp: string };
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedEmail || !purpose || !otp) {
    return res.status(400).json({ message: "Email, purpose and OTP are required", valid: false });
  }

  const valid = await checkOtp(normalizedEmail, purpose, otp);

  return res.json({
    valid,
    message: valid ? "OTP verified successfully." : "OTP is invalid or expired."
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { fullName, email, password, registrationNo, bio, interests, otp } = req.body as Record<string, string>;
  const normalizedEmail = email?.toLowerCase().trim();

  if (!fullName || !normalizedEmail || !otp) {
    return res.status(400).json({ message: "All required fields must be filled" });
  }

  if (!isLpuEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Use your official LPU email address" });
  }

  const validOtp = await verifyOtp(normalizedEmail, "register", otp);

  if (!validOtp) {
    return res.status(401).json({ message: "Invalid or expired OTP" });
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: normalizedEmail }, { registrationNo }]
    }
  });

  if (existingUser) {
    return res.status(409).json({ message: "Account already exists" });
  }

  const trimmedPassword = password?.trim();
  const passwordHash = trimmedPassword ? await bcrypt.hash(trimmedPassword, 10) : null;
  const user = await prisma.user.create({
    data: {
      fullName,
      email: normalizedEmail,
      passwordHash,
      registrationNo,
      bio,
      interests,
      emailVerified: true,
      authProvider: trimmedPassword ? "email" : "otp"
    }
  });

  return res.status(201).json(createAuthResponse(user));
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body as Record<string, string>;

  const user = await prisma.user.findUnique({
    where: { email: email?.toLowerCase() }
  });

  if (!user) {
    return res.status(404).json({ message: "No student account found" });
  }

  if (!user.passwordHash) {
    return res.status(400).json({ message: "This account uses Google or OTP login. Use that method instead." });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return res.status(401).json({ message: "Incorrect password" });
  }

  return res.json(createAuthResponse(user));
});

app.post("/api/auth/login-otp", async (req, res) => {
  const { email, otp } = req.body as Record<string, string>;
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedEmail || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  const validOtp = await verifyOtp(normalizedEmail, "login", otp);

  if (!validOtp) {
    return res.status(401).json({ message: "Invalid or expired OTP" });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (!user) {
    return res.status(404).json({ message: "No student account found" });
  }

  return res.json(createAuthResponse(user));
});

app.post("/api/auth/google", async (req, res) => {
  const { credential, registrationNo, bio, interests } = req.body as Record<string, string>;

  if (!credential) {
    return res.status(400).json({ message: "Google credential is required" });
  }

  try {
    const googleUser = await verifyGoogleCredential(credential);
    const normalizedEmail = googleUser.email.toLowerCase();

    if (!isLpuEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Only Campus LPU Google accounts are allowed" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      const updatedUser =
        existingUser.googleId === googleUser.googleId
          ? existingUser
          : await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                googleId: googleUser.googleId,
                emailVerified: true,
                authProvider: existingUser.passwordHash ? "email+google" : "google"
              }
            });

      return res.json(createAuthResponse(updatedUser));
    }

    if (!registrationNo) {
      return res.status(400).json({ message: "Registration number is required for first-time Google signup" });
    }

    const duplicateRegistration = await prisma.user.findUnique({
      where: { registrationNo }
    });

    if (duplicateRegistration) {
      return res.status(409).json({ message: "Registration number is already in use" });
    }

    const user = await prisma.user.create({
      data: {
        fullName: googleUser.fullName,
        email: normalizedEmail,
        registrationNo,
        bio,
        interests,
        googleId: googleUser.googleId,
        emailVerified: true,
        authProvider: "google"
      }
    });

    return res.status(201).json(createAuthResponse(user));
  } catch (error) {
    return res.status(401).json({
      message: error instanceof Error ? error.message : "Google sign-in failed"
    });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      registrationNo: true,
      bio: true,
      interests: true
    }
  });

  return res.json(user);
});

app.get("/api/discover", requireAuth, async (req, res) => {
  const { course, year } = req.query as { course?: string; year?: string };
  const blockedUserIds = await getBlockedUserIds(req.user!.id);
  
  const myFriendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: req.user!.id }, { userBId: req.user!.id }]
    }
  });
  const myFriendIds = new Set(
    myFriendships.map(f => (f.userAId === req.user!.id ? f.userBId : f.userAId))
  );
  
  const whereClause: any = {
    id: {
      notIn: [req.user!.id, ...blockedUserIds, ...myFriendIds]
    }
  };

  if (course) {
    whereClause.course = { contains: course };
  }
  
  if (year) {
    whereClause.year = year;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      fullName: true,
      email: true,
      registrationNo: true,
      bio: true,
      interests: true,
      course: true,
      year: true
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 50 // Limit to avoid massive payloads
  });

  // Get friends for all discovered users in one query
  const allFriendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { userAId: { in: users.map(u => u.id) } },
        { userBId: { in: users.map(u => u.id) } }
      ]
    }
  });

  const usersWithMutuals = users.map(user => {
    let mutualCount = 0;
    const theirFriendIds = new Set(
      allFriendships
        .filter(f => f.userAId === user.id || f.userBId === user.id)
        .map(f => (f.userAId === user.id ? f.userBId : f.userAId))
    );
    
    theirFriendIds.forEach(id => {
      if (myFriendIds.has(id)) mutualCount++;
    });

    return {
      ...user,
      mutualConnections: mutualCount
    };
  });

  return res.json(usersWithMutuals);
});

app.get("/api/friends", requireAuth, async (req, res) => {
  const blockedUserIds = await getBlockedUserIds(req.user!.id);
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [{ userAId: req.user!.id }, { userBId: req.user!.id }]
    }
  });

  const friendIds = friendships
    .map((item) => (item.userAId === req.user!.id ? item.userBId : item.userAId))
    .filter((friendId) => !blockedUserIds.has(friendId));
  const friends = friendIds.length
    ? await prisma.user.findMany({
        where: { id: { in: friendIds } },
        select: {
          id: true,
          fullName: true,
          email: true,
          bio: true,
          interests: true
        }
      })
    : [];

  res.json(friends);
});

app.get("/api/friend-requests", requireAuth, async (req, res) => {
  const blockedUserIds = await getBlockedUserIds(req.user!.id);
  const requests = await prisma.friendRequest.findMany({
    where: {
      receiverId: req.user!.id,
      status: "pending",
      senderId: {
        notIn: [...blockedUserIds]
      }
    },
    include: {
      sender: {
        select: {
          id: true,
          fullName: true,
          email: true,
          bio: true,
          interests: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  res.json(requests);
});

app.post("/api/friend-requests", requireAuth, async (req, res) => {
  const { receiverId } = req.body as { receiverId: string };

  if (!receiverId || areSameUsers(receiverId, req.user!.id)) {
    return res.status(400).json({ message: "Invalid receiver" });
  }

  if (await isBlockedBetween(req.user!.id, receiverId)) {
    return res.status(403).json({ message: "You cannot send a friend request to this user." });
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId }
  });

  if (!receiver) {
    return res.status(404).json({ message: "Student not found" });
  }

  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: req.user!.id, userBId: receiverId },
        { userAId: receiverId, userBId: req.user!.id }
      ]
    }
  });

  if (existingFriendship) {
    return res.status(409).json({ message: "Already friends" });
  }

  // Instant friendship creation
  const [userAId, userBId] = normalizeUserPair(req.user!.id, receiverId);
  const friendship = await prisma.friendship.create({
    data: {
      userAId,
      userBId
    }
  });

  const receiverSocketId = getUserSocketId(receiverId);
  if (receiverSocketId) {
    io.to(receiverSocketId).emit("notification:new", {
      id: `new-friend-${friendship.id}`,
      type: "friend_accept",
      message: `${req.user!.fullName} added you as a friend!`,
      createdAt: new Date().toISOString()
    });
  }

  return res.status(201).json({ message: "You are now friends", friendship });
});

app.get("/api/relationships/:otherUserId", requireAuth, async (req, res) => {
  const otherUserId = Array.isArray(req.params.otherUserId) ? req.params.otherUserId[0] : req.params.otherUserId;

  if (!otherUserId || areSameUsers(otherUserId, req.user!.id)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  const [friendship, outgoingRequest, incomingRequest, blockedByMe, blockedByOther] = await Promise.all([
    prisma.friendship.findFirst({
      where: {
        OR: [
          { userAId: req.user!.id, userBId: otherUserId },
          { userAId: otherUserId, userBId: req.user!.id }
        ]
      },
      select: { id: true }
    }),
    prisma.friendRequest.findFirst({
      where: {
        senderId: req.user!.id,
        receiverId: otherUserId,
        status: "pending"
      },
      select: { id: true }
    }),
    prisma.friendRequest.findFirst({
      where: {
        senderId: otherUserId,
        receiverId: req.user!.id,
        status: "pending"
      },
      select: { id: true }
    }),
    prisma.userBlock.findFirst({
      where: {
        blockerId: req.user!.id,
        blockedId: otherUserId
      },
      select: { id: true }
    }),
    prisma.userBlock.findFirst({
      where: {
        blockerId: otherUserId,
        blockedId: req.user!.id
      },
      select: { id: true }
    })
  ]);

  return res.json({
    isFriend: Boolean(friendship),
    outgoingRequestPending: Boolean(outgoingRequest),
    incomingRequestPending: Boolean(incomingRequest),
    outgoingRequestId: outgoingRequest?.id ?? null,
    incomingRequestId: incomingRequest?.id ?? null,
    isBlocked: Boolean(blockedByMe),
    isBlockedByOther: Boolean(blockedByOther)
  });
});

app.get("/api/blocked-users", requireAuth, async (req, res) => {
  const blockedUsers = await prisma.userBlock.findMany({
    where: {
      blockerId: req.user!.id
    },
    include: {
      blocked: {
        select: {
          id: true,
          fullName: true,
          email: true,
          bio: true,
          interests: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return res.json(
    blockedUsers.map((entry) => ({
      id: entry.id,
      reason: entry.reason,
      createdAt: entry.createdAt,
      user: entry.blocked
    }))
  );
});

app.post("/api/friend-requests/:id/accept", requireAuth, async (req, res) => {
  const requestId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId }
  });

  if (!request || request.receiverId !== req.user!.id) {
    return res.status(404).json({ message: "Friend request not found" });
  }

  const [userAId, userBId] = normalizeFriendPair(request.senderId, request.receiverId);

  await prisma.$transaction([
    prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: "accepted" }
    }),
    prisma.friendship.upsert({
      where: {
        userAId_userBId: {
          userAId,
          userBId
        }
      },
      update: {},
      create: {
        userAId,
        userBId
      }
    })
  ]);

  const sender = await prisma.user.findUnique({
    where: { id: request.senderId },
    select: {
      id: true,
      fullName: true
    }
  });

  const senderSocketId = getUserSocketId(request.senderId);
  if (senderSocketId && sender) {
    io.to(senderSocketId).emit("notification:new", {
      id: `friend-accepted-${request.id}`,
      type: "friend_accept",
      message: `${req.user!.fullName} accepted your friend request.`,
      createdAt: new Date().toISOString(),
      meta: {
        friendId: req.user!.id
      }
    });
  }

  return res.json({ success: true });
});

app.post("/api/users/:id/report", requireAuth, async (req, res) => {
  const reportedId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { reason, details } = req.body as { reason?: string; details?: string };

  if (!reportedId || areSameUsers(reportedId, req.user!.id)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  if (!reason?.trim()) {
    return res.status(400).json({ message: "A report reason is required." });
  }

  const reportedUser = await prisma.user.findUnique({
    where: { id: reportedId },
    select: { id: true }
  });

  if (!reportedUser) {
    return res.status(404).json({ message: "User not found" });
  }

  const report = await prisma.userReport.create({
    data: {
      reporterId: req.user!.id,
      reportedId,
      reason: reason.trim(),
      details: details?.trim() || null
    }
  });

  return res.status(201).json({ success: true, reportId: report.id });
});

app.post("/api/users/:id/block", requireAuth, async (req, res) => {
  const blockedId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { reason } = req.body as { reason?: string };

  if (!blockedId || areSameUsers(blockedId, req.user!.id)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  const blockedUser = await prisma.user.findUnique({
    where: { id: blockedId },
    select: { id: true }
  });

  if (!blockedUser) {
    return res.status(404).json({ message: "User not found" });
  }

  const [userAId, userBId] = normalizeUserPair(req.user!.id, blockedId);

  await prisma.$transaction([
    prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: req.user!.id,
          blockedId
        }
      },
      update: {
        reason: reason?.trim() || null
      },
      create: {
        blockerId: req.user!.id,
        blockedId,
        reason: reason?.trim() || null
      }
    }),
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: req.user!.id, receiverId: blockedId },
          { senderId: blockedId, receiverId: req.user!.id }
        ]
      }
    }),
    prisma.friendship.deleteMany({
      where: {
        userAId,
        userBId
      }
    })
  ]);

  endActiveMatch(req.user!.id);

  const blockedSocketId = getUserSocketId(blockedId);
  if (blockedSocketId) {
    io.to(blockedSocketId).emit("match:partner-left", {
      message: `${req.user!.fullName} left the chat.`
    });
  }

  return res.json({ success: true });
});

app.delete("/api/users/:id/block", requireAuth, async (req, res) => {
  const blockedId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!blockedId || areSameUsers(blockedId, req.user!.id)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  await prisma.userBlock.deleteMany({
    where: {
      blockerId: req.user!.id,
      blockedId
    }
  });

  return res.json({ success: true });
});

app.get("/api/messages/:otherUserId", requireAuth, async (req, res) => {
  const otherUserId = Array.isArray(req.params.otherUserId) ? req.params.otherUserId[0] : req.params.otherUserId;

  if (await isBlockedBetween(req.user!.id, otherUserId)) {
    return res.status(403).json({ message: "You cannot access messages with this user." });
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userAId: req.user!.id, userBId: otherUserId },
        { userAId: otherUserId, userBId: req.user!.id }
      ]
    }
  });

  if (!friendship) {
    return res.status(403).json({ message: "You can only chat with accepted friends" });
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: req.user!.id, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: req.user!.id }
      ]
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({
    roomId: getConversationRoom(req.user!.id, otherUserId),
    messages
  });
});

app.get("/api/zego-config", requireAuth, (_req, res) => {
  res.json({
    appId: config.zegoAppId,
    serverSecret: config.zegoServerSecret,
    note: "For development this returns the ZEGO secret to the client so the UI kit can create a test token. For production, generate tokens on the server instead."
  });
});

httpServer.listen(config.port, () => {
  console.log(`LPU TV server running on http://localhost:${config.port}`);
});
