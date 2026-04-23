export function normalizeFriendPair(userAId: string, userBId: string) {
  return [userAId, userBId].sort();
}

export function normalizeUserPair(userAId: string, userBId: string) {
  return [userAId, userBId].sort();
}

export function getConversationRoom(userAId: string, userBId: string) {
  return normalizeFriendPair(userAId, userBId).join(":");
}

export function isLpuEmail(email: string) {
  const lower = email.toLowerCase();
  return lower.endsWith("@lpu.in") || lower.endsWith("@gmail.com");
}

export function areSameUsers(userAId: string, userBId: string) {
  return userAId === userBId;
}
