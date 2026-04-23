export type User = {
  id: string;
  fullName: string;
  email: string;
  registrationNo?: string;
  bio?: string | null;
  interests?: string | null;
  course?: string | null;
  year?: string | null;
  mutualConnections?: number;
};

export type FriendRequest = {
  id: string;
  sender: User;
  status: string;
};

export type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  content?: string | null;
  imageUrl?: string | null;
  isRead?: boolean;
  createdAt: string;
};

export type MatchResult = {
  roomId: string;
  matchedAt: string;
  partner: User;
};

export type RelationshipStatus = {
  isFriend: boolean;
  outgoingRequestPending: boolean;
  incomingRequestPending: boolean;
  outgoingRequestId?: string | null;
  incomingRequestId?: string | null;
  isBlocked: boolean;
  isBlockedByOther: boolean;
};

export type BlockedUserEntry = {
  id: string;
  reason?: string | null;
  createdAt: string;
  user: User;
};

export type PublicStats = {
  onlineNow: number;
  registeredStudents: number;
  verifiedStudents: number;
};

export type AppNotification = {
  id: string;
  type: "friend_request" | "friend_accept" | "system";
  message: string;
  createdAt: string;
  meta?: Record<string, string>;
};
