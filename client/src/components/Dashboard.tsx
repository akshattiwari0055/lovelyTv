/**
 * Dashboard.tsx — Campus Connect · Redesigned UI
 * Inspired by CampusTV aesthetic: dark, premium, bold, neon accents
 * Fully responsive: mobile-first + desktop layout
 */

import {
  FormEvent, useEffect, useMemo, useRef, useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, Check, CheckCheck, Flame, Home, ImagePlus,
  Lock, MessageCircle, Phone, Search, Send, ShieldBan,
  UserCircle2, UserPlus, Users, X, Zap, Bell, Grid3x3,
  ChevronRight, Star, TrendingUp, Radio,
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import {
  AppNotification, BlockedUserEntry, FriendRequest, Message, User,
} from "../types";
import { VideoRoom } from "./VideoRoom";

// ─── Types ────────────────────────────────────────────────────────────────────
type DashboardProps = { token: string; user: User; onLogout: () => void };
type AppTab = "home" | "discover" | "messages" | "chat" | "profile";

function getRoomId(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `call-${x}-${y}`;
}

const fmt = (v: string) =>
  new Date(v).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const initials = (name: string) =>
  name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; position: fixed; width: 100%; background: #080b12; }
  ::-webkit-scrollbar { width: 0; background: transparent; }
  input, textarea, select { font-size: 16px !important; font-family: 'DM Sans', sans-serif; }

  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
    70% { box-shadow: 0 0 0 16px rgba(99, 102, 241, 0); }
    100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
  }
  @keyframes tdot {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-5px); }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes glow-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes scan {
    0% { transform: translateY(-100%); }
    100% { transform: translateY(400%); }
  }

  .tab-btn:hover { background: rgba(255,255,255,0.05) !important; }
  .nav-item { transition: all 0.2s ease; }
  .nav-item:hover { color: #a78bfa !important; }
  .chat-item:hover { background: rgba(167,139,250,0.06) !important; }
  .send-btn:not(:disabled):hover { transform: scale(1.05); }
  .action-btn:hover { border-color: rgba(167,139,250,0.5) !important; background: rgba(167,139,250,0.08) !important; }
  .desktop-nav-btn:hover { background: rgba(255,255,255,0.05) !important; }
`;

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#080b12",
  surface: "#0d111d",
  surfaceAlt: "#111827",
  border: "rgba(255,255,255,0.07)",
  borderGlow: "rgba(167,139,250,0.25)",
  accent: "#a78bfa",        // violet
  accentAlt: "#22d3ee",     // cyan
  accentPink: "#f472b6",    // pink
  accentGreen: "#34d399",   // green
  text: "#f1f5f9",
  textMuted: "rgba(241,245,249,0.45)",
  textDim: "rgba(241,245,249,0.25)",
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({
  name, size = 40, color = "violet", online = false,
}: { name: string; size?: number; color?: "violet" | "cyan" | "pink" | "green"; online?: boolean }) {
  const gradients = {
    violet: "linear-gradient(135deg, #7c3aed, #a78bfa)",
    cyan:   "linear-gradient(135deg, #0891b2, #22d3ee)",
    pink:   "linear-gradient(135deg, #be185d, #f472b6)",
    green:  "linear-gradient(135deg, #059669, #34d399)",
  };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: gradients[color],
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.33, fontWeight: 700, color: "#fff",
        fontFamily: "'Syne', sans-serif", letterSpacing: "-0.01em",
      }}>
        {initials(name)}
      </div>
      {online && (
        <span style={{
          position: "absolute", bottom: 1, right: 1,
          width: size * 0.22, height: size * 0.22,
          background: C.accentGreen, borderRadius: "50%",
          border: `2px solid ${C.bg}`,
          animation: "blink 2s infinite",
        }} />
      )}
    </div>
  );
}

// ─── ScreenHeader ─────────────────────────────────────────────────────────────
function ScreenHeader({
  title, subtitle, onBack, right,
}: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", height: 60, flexShrink: 0,
      background: C.bg,
      borderBottom: `1px solid ${C.border}`,
      width: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
        {onBack && (
          <button onClick={onBack} style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textMuted, cursor: "pointer",
          }}>
            <ArrowLeft size={15} />
          </button>
        )}
        <div>
          <div style={{
            fontSize: "0.97rem", fontWeight: 700, color: C.text,
            fontFamily: "'Syne', sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: "0.72rem", color: C.accentGreen, fontWeight: 500, marginTop: 1 }}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {right && (
        <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 8 }}>{right}</div>
      )}
    </header>
  );
}

// ─── LiveBadge ────────────────────────────────────────────────────────────────
function LiveBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: "rgba(244,114,182,0.12)",
      border: "1px solid rgba(244,114,182,0.25)",
      borderRadius: 100, padding: "3px 10px",
      fontSize: "0.63rem", fontWeight: 700,
      letterSpacing: "0.08em", color: C.accentPink,
      fontFamily: "'Syne', sans-serif",
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: C.accentPink, display: "inline-block",
        animation: "blink 1.2s infinite",
      }} />
      {label}
    </span>
  );
}

// ─── StatPill ────────────────────────────────────────────────────────────────
function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "14px 8px",
    }}>
      <div style={{
        fontSize: "1.2rem", fontWeight: 800, color: C.text,
        fontFamily: "'Syne', sans-serif", letterSpacing: "-0.02em",
      }}>{value}</div>
      <div style={{ fontSize: "0.65rem", color: C.textDim, fontWeight: 500, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

// ─── HeroCard ────────────────────────────────────────────────────────────────
function HeroCard({ onStartRandom }: { onStartRandom: () => void }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: C.surfaceAlt,
      border: `1px solid ${C.border}`,
      borderRadius: 20, padding: "28px 24px 24px",
      marginBottom: 24, animation: "slide-up 0.5s ease",
    }}>
      {/* Decorative glow */}
      <div style={{
        position: "absolute", top: -80, right: -80, width: 280, height: 280,
        background: "radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -40, left: -40, width: 200, height: 200,
        background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      {/* Scan line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.6), transparent)",
        animation: "scan 3s linear infinite", pointerEvents: "none",
      }} />

      <div style={{ position: "relative" }}>
        <LiveBadge label="LIVE ON CAMPUS" />

        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(1.6rem, 5vw, 2rem)",
          fontWeight: 800, lineHeight: 1.15,
          color: C.text, margin: "14px 0 6px",
          letterSpacing: "-0.03em",
        }}>
          Connect.<br />
          <span style={{
            background: "linear-gradient(90deg, #a78bfa, #22d3ee)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>Witness. Vibe.</span>
        </h1>

        <p style={{
          fontSize: "0.8rem", color: C.textMuted, lineHeight: 1.65,
          margin: "0 0 22px", maxWidth: 280, fontFamily: "'DM Sans', sans-serif",
        }}>
          The high-frequency social layer of your campus. Real-time chats, instant connections, zero noise.
        </p>

        <button
          onClick={onStartRandom}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            color: "#fff", fontWeight: 700, fontSize: "0.84rem",
            padding: "11px 22px", borderRadius: 100, border: "none",
            cursor: "pointer", boxShadow: "0 4px 24px rgba(124,58,237,0.4)",
            fontFamily: "'Syne', sans-serif", letterSpacing: "0.02em",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.04)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 32px rgba(124,58,237,0.55)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(124,58,237,0.4)";
          }}
        >
          <Zap size={14} /> Start Random Chat
        </button>
      </div>
    </div>
  );
}

// ─── ChatItem ────────────────────────────────────────────────────────────────
function ChatItem({
  friend, unread, lastMsg, active, onClick,
}: { friend: User; unread: number; lastMsg?: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="chat-item"
      style={{
        display: "flex", alignItems: "center", gap: 13,
        padding: "14px 20px", width: "100%", textAlign: "left",
        background: active ? "rgba(167,139,250,0.07)" : "transparent",
        border: "none",
        borderBottom: `1px solid ${C.border}`,
        cursor: "pointer", transition: "background 0.15s",
      }}
    >
      <Avatar name={friend.fullName} size={44} color="cyan" online={unread > 0} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.87rem", fontWeight: unread > 0 ? 700 : 500,
          color: C.text, fontFamily: "'Syne', sans-serif",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {friend.fullName}
        </div>
        <div style={{
          fontSize: "0.74rem", marginTop: 2,
          color: unread > 0 ? C.accent : C.textDim,
          fontWeight: unread > 0 ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {lastMsg ?? (friend.interests || "Tap to chat")}
        </div>
      </div>
      <div style={{ minWidth: 28, display: "flex", justifyContent: "flex-end" }}>
        {unread > 0 ? (
          <span style={{
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            color: "#fff", fontSize: "0.62rem", fontWeight: 800,
            padding: "2px 7px", borderRadius: 100,
            minWidth: 20, textAlign: "center",
            fontFamily: "'Syne', sans-serif",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </div>
    </button>
  );
}

// ─── UserCard ────────────────────────────────────────────────────────────────
function UserCard({ user: u, onAdd }: { user: User; onAdd: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <article style={{
      background: C.surfaceAlt,
      border: `1px solid ${C.border}`,
      borderRadius: 16, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 13,
      transition: "border-color 0.2s",
    }}>
      <Avatar name={u.fullName} size={44} color="violet" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.87rem", fontWeight: 700, color: C.text,
          fontFamily: "'Syne', sans-serif", marginBottom: 2,
        }}>
          {u.fullName}
        </div>
        <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
          {u.course && u.year
            ? `${u.course} · ${u.year} Year`
            : u.interests ?? "Campus student"}
        </div>
        {u.mutualConnections != null && u.mutualConnections > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.69rem", color: C.accentAlt, marginTop: 3 }}>
            <Users size={10} /> {u.mutualConnections} mutual
          </div>
        )}
      </div>
      <button
        onClick={() => { setSent(true); onAdd(); }}
        disabled={sent}
        className="action-btn"
        style={{
          background: sent ? "transparent" : "rgba(167,139,250,0.1)",
          border: `1px solid ${sent ? C.border : "rgba(167,139,250,0.3)"}`,
          borderRadius: 10, padding: "8px 14px",
          fontSize: "0.74rem", fontWeight: 600,
          color: sent ? C.textDim : C.accent,
          cursor: sent ? "default" : "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 5,
          transition: "all 0.2s", fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {sent ? <Check size={13} /> : <UserPlus size={13} />}
        {sent ? "Sent" : "Add"}
      </button>
    </article>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, mine }: { msg: Message; mine: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", padding: "2px 0" }}>
      <div style={{
        maxWidth: "72%", padding: "10px 14px",
        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background: mine
          ? "linear-gradient(135deg, #7c3aed, #a78bfa)"
          : C.surfaceAlt,
        border: mine ? "none" : `1px solid ${C.border}`,
        color: mine ? "#fff" : C.text,
        fontSize: "0.86rem", lineHeight: 1.55,
        wordBreak: "break-word", fontFamily: "'DM Sans', sans-serif",
        animation: "slide-up 0.2s ease",
      }}>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="img" style={{
            width: "100%", maxWidth: "min(260px, 70vw)", height: "auto",
            borderRadius: 10, marginBottom: 8, display: "block",
          }} />
        )}
        {msg.content && <span>{msg.content}</span>}
        <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 5 }}>
          <small style={{ fontSize: "0.6rem", opacity: 0.55 }}>{fmt(msg.createdAt)}</small>
          {mine && (msg.isRead
            ? <CheckCheck size={10} color="rgba(255,255,255,0.7)" />
            : <Check size={10} color="rgba(255,255,255,0.4)" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const compInputRef = useRef<HTMLInputElement>(null);

  const [zegoConfig, setZegoConfig] = useState<{ appId: number; serverSecret: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ roomId: string; isVideo: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string; callerName: string; isVideo: boolean; roomId: string;
  } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    roomId: string; isVideo: boolean; receiverName: string;
  } | null>(null);

  const [discoverUsers, setDiscoverUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, string>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );

  const usersWithUnread = useMemo(
    () => Object.values(unreadCounts).filter((c) => c > 0).length,
    [unreadCounts]
  );

  const conversationIsOpen = activeTab === "chat" && !!selectedFriend;

  const filteredDiscoverUsers = useMemo(
    () => nameFilter.trim()
      ? discoverUsers.filter((u) => u.fullName.toLowerCase().includes(nameFilter.trim().toLowerCase()))
      : discoverUsers,
    [discoverUsers, nameFilter]
  );

  // ─── Socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (msg: Message) => {
      setMessages((c) => (c.some((e) => e.id === msg.id) ? c : [...c, msg]));
      const otherId = msg.senderId === user.id ? (msg as any).receiverId ?? "" : msg.senderId;
      if (msg.content) setLastMessages((c) => ({ ...c, [otherId]: msg.content! }));

      if (selectedFriend?.id === msg.senderId && conversationIsOpen && document.visibilityState === "visible") {
        socket.emit("message:read", { messageIds: [msg.id], senderId: msg.senderId });
        setUnreadCounts((c) => ({ ...c, [msg.senderId]: 0 }));
      } else if (msg.senderId !== user.id) {
        setUnreadCounts((c) => ({ ...c, [msg.senderId]: Math.min((c[msg.senderId] ?? 0) + 1, 99) }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[] }) => {
      setMessages((c) => c.map((m) => messageIds.includes(m.id) ? { ...m, isRead: true } : m));
    });
    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(true);
    });
    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(false);
    });
    socket.on("call:incoming", (p: typeof incomingCall) => setIncomingCall(p));
    socket.on("call:accepted", ({ roomId }: { roomId: string }) => {
      setOutgoingCall((cur) => {
        if (cur?.roomId === roomId) { setActiveCall({ roomId, isVideo: cur.isVideo }); return null; }
        return cur;
      });
    });
    socket.on("call:declined", () => setOutgoingCall(null));
    socket.on("notification:new", (n: AppNotification) => {
      setNotifications((c) => [n, ...c].slice(0, 20));
      void Promise.all([loadFriends(), loadRequests()]);
    });

    return () => {
      ["message:new","message:read:update","typing:started","typing:stopped",
       "call:incoming","call:accepted","call:declined","notification:new"]
        .forEach((e) => socket.off(e));
      disconnectSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedFriend?.id, conversationIsOpen, user.id]);

  useEffect(() => {
    void Promise.all([
      loadDiscover(), loadFriends(), loadRequests(), loadBlockedUsers(),
      api.get("/zego-config").then((r) => setZegoConfig(r.data)),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedFriend) return;
    getSocket()?.emit("join:conversation", { otherUserId: selectedFriend.id });
    void loadConvo(selectedFriend.id, conversationIsOpen && document.visibilityState === "visible");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFriend?.id, conversationIsOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partnerTyping]);

  useEffect(() => {
    if (activeTab === "chat") {
      requestAnimationFrame(() => compInputRef.current?.focus());
    }
  }, [activeTab, selectedFriend?.id]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function loadDiscover() { const r = await api.get("/discover"); setDiscoverUsers(r.data); }
  async function loadFriends() { const r = await api.get("/friends"); setFriends(r.data); }
  async function loadRequests() { const r = await api.get("/friend-requests"); setRequests(r.data); }
  async function loadBlockedUsers() { const r = await api.get("/blocked-users"); setBlockedUsers(r.data); }

  async function loadConvo(otherId: string, markRead = false) {
    const r = await api.get(`/messages/${otherId}`);
    const msgs: Message[] = r.data.messages;
    setMessages(msgs);
    const last = msgs[msgs.length - 1];
    if (last?.content) setLastMessages((c) => ({ ...c, [otherId]: last.content! }));
    const unread = msgs.filter((m) => m.senderId === otherId && !m.isRead).map((m) => m.id);
    if (markRead && unread.length > 0) {
      getSocket()?.emit("message:read", { messageIds: unread, senderId: otherId });
      setMessages((c) => c.map((m) => unread.includes(m.id) ? { ...m, isRead: true } : m));
    }
    setUnreadCounts((c) => ({ ...c, [otherId]: 0 }));
  }

  async function sendFriendRequest(id: string) {
    await api.post("/friend-requests", { receiverId: id });
    void loadDiscover();
  }
  async function acceptRequest(id: string) {
    await api.post(`/friend-requests/${id}/accept`);
    await Promise.all([loadFriends(), loadRequests()]);
  }
  async function unblockUser(uid: string) {
    await api.delete(`/users/${uid}/block`);
    await Promise.all([loadBlockedUsers(), loadDiscover(), loadFriends(), loadRequests()]);
  }

  function openChat(friend: User) {
    setSelectedFriend(friend);
    setMessages([]);
    setActiveTab("chat");
  }
  function goBack() {
    if (activeTab === "chat") { setSelectedFriend(null); setActiveTab("messages"); }
    else setActiveTab("home");
  }

  function startCall(isVideo: boolean) {
    if (!selectedFriend) return;
    const roomId = getRoomId(user.id, selectedFriend.id);
    setOutgoingCall({ roomId, isVideo, receiverName: selectedFriend.fullName });
    getSocket()?.emit("call:initiate", { receiverId: selectedFriend.id, isVideo, roomId });
  }
  function acceptCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:accept", { callerId: incomingCall.callerId, roomId: incomingCall.roomId });
    const f = friends.find((x) => x.id === incomingCall.callerId);
    if (f) openChat(f);
    setActiveCall({ roomId: incomingCall.roomId, isVideo: incomingCall.isVideo });
    setIncomingCall(null);
  }
  function declineCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:decline", { callerId: incomingCall.callerId });
    setIncomingCall(null);
  }

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedFriend || (!messageInput.trim() && !imagePreview)) return;
    getSocket()?.emit("message:send", {
      receiverId: selectedFriend.id,
      content: messageInput,
      imageUrl: imagePreview,
    });
    getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    setMessageInput("");
    setImagePreview(null);
    requestAnimationFrame(() => compInputRef.current?.focus());
  }

  function handleTyping(e: React.ChangeEvent<HTMLInputElement>) {
    setMessageInput(e.target.value);
    if (!selectedFriend) return;
    if (!isTyping) {
      setIsTyping(true);
      getSocket()?.emit("typing:start", { receiverId: selectedFriend.id });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setIsTyping(false);
      getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    }, 2000);
  }

  function handleImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ─── SCREENS ─────────────────────────────────────────────────────────────

  const SectionTitle = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h2 style={{
        fontSize: "0.8rem", fontWeight: 700, color: C.textDim,
        textTransform: "uppercase", letterSpacing: "0.12em",
        fontFamily: "'Syne', sans-serif",
      }}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{
          fontSize: "0.75rem", fontWeight: 600, color: C.accent,
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {action} <ChevronRight size={12} />
        </button>
      )}
    </div>
  );

  const HomeScreen = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 60, flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #7c3aed, #22d3ee)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Radio size={14} color="#fff" />
          </div>
          <span style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 800,
            fontSize: "1.1rem", color: C.text,
          }}>
            CAMPUS<span style={{ color: C.accent }}>·</span>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={{
            width: 34, height: 34, borderRadius: 9,
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textMuted, cursor: "pointer", position: "relative",
          }}>
            <Bell size={15} />
            {notifications.length > 0 && (
              <span style={{
                position: "absolute", top: 4, right: 4,
                width: 8, height: 8, borderRadius: "50%",
                background: C.accentPink, border: `2px solid ${C.bg}`,
              }} />
            )}
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Avatar name={user.fullName} size={34} color="pink" />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isDesktop ? 28 : 20, minHeight: 0 }}>
        <HeroCard onStartRandom={() => navigate("/app/random")} />

        <div style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? "minmax(0, 1fr) minmax(0, 1fr)" : "1fr",
          gap: 20,
          alignItems: "start",
          marginBottom: 28,
        }}>
          <div>
            <SectionTitle title="Curated For You" action="Discover all" onAction={() => setActiveTab("discover")} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {discoverUsers.slice(0, 4).length === 0
                ? (
                  <div style={{
                    background: C.surfaceAlt, border: `1px dashed ${C.border}`, borderRadius: 14,
                    padding: 20, textAlign: "center", color: C.textDim, fontSize: "0.82rem",
                    fontFamily: "'DM Sans', sans-serif",
                  }}>No suggestions yet.</div>
                )
                : discoverUsers.slice(0, 4).map((u) => (
                    <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
                  ))
              }
            </div>
          </div>

          <div>
            <SectionTitle title="Active Dialogue" action="See all" onAction={() => setActiveTab("messages")} />
            {friends.length > 0 && (
              <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: C.accentGreen,
                  display: "inline-block", animation: "blink 1.5s infinite",
                }} />
                <span style={{ fontSize: "0.72rem", color: C.accentGreen, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
                  {friends.length} Online
                </span>
              </div>
            )}
            <div style={{
              background: C.surfaceAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 16, overflow: "hidden",
            }}>
              {friends.length === 0
                ? (
                  <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.82rem", fontFamily: "'DM Sans', sans-serif" }}>
                    Add friends to start chatting
                  </div>
                )
                : friends.slice(0, 5).map((f) => (
                    <ChatItem key={f.id} friend={f}
                      unread={unreadCounts[f.id] ?? 0}
                      lastMsg={lastMessages[f.id]}
                      onClick={() => openChat(f)}
                    />
                  ))
              }
            </div>
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );

  const MessagesScreen = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <ScreenHeader title="Inbox" subtitle={`${friends.length} conversations`} onBack={() => setActiveTab("home")} />

      {requests.length > 0 && (
        <button onClick={() => setActiveTab("profile")} style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "12px 20px",
          background: "rgba(167,139,250,0.06)",
          border: "none", borderBottom: `1px solid rgba(167,139,250,0.15)`,
          cursor: "pointer",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(167,139,250,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <UserPlus size={15} color={C.accent} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: "0.83rem", fontWeight: 700, color: C.accent, fontFamily: "'Syne', sans-serif" }}>
              {requests.length} Friend Request{requests.length > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>Tap to review</div>
          </div>
          <ChevronRight size={14} color={C.textDim} />
        </button>
      )}

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {friends.length === 0
          ? (
            <div style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: "0.84rem", fontFamily: "'DM Sans', sans-serif" }}>
              No conversations yet. Discover and add friends!
            </div>
          )
          : friends.map((f) => (
              <ChatItem key={f.id} friend={f} active={selectedFriend?.id === f.id}
                unread={unreadCounts[f.id] ?? 0}
                lastMsg={lastMessages[f.id]}
                onClick={() => openChat(f)}
              />
            ))
        }
      </div>
    </div>
  );

  const ChatScreen = () => {
    if (!selectedFriend) return null;

    if (activeCall && zegoConfig) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <ScreenHeader title={selectedFriend.fullName} onBack={() => setActiveCall(null)} />
          <div style={{ flex: 1, background: "#000", position: "relative", minHeight: 0 }}>
            <VideoRoom
              appId={zegoConfig.appId} serverSecret={zegoConfig.serverSecret}
              roomId={activeCall.roomId} userId={user.id} userName={user.fullName}
              isAudioOnly={!activeCall.isVideo} onJoined={() => {}}
            />
            <button onClick={() => setActiveCall(null)} style={{
              position: "absolute", top: 14, right: 14, zIndex: 9999,
              background: "#ef4444", padding: "8px 18px",
              borderRadius: 100, border: "none", color: "#fff", cursor: "pointer",
              fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'Syne', sans-serif",
            }}>
              <Phone size={13} style={{ transform: "rotate(135deg)" }} /> End
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        <ScreenHeader
          title={selectedFriend.fullName}
          subtitle="Online"
          onBack={goBack}
          right={
            <>
              <button style={{
                width: 34, height: 34, borderRadius: 9,
                background: C.surfaceAlt, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.textMuted, cursor: "pointer",
              }} onClick={() => startCall(false)}>
                <Phone size={14} />
              </button>
              <button style={{
                width: 34, height: 34, borderRadius: 9,
                background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
                border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", cursor: "pointer",
              }} onClick={() => startCall(true)}>
                <Camera size={14} />
              </button>
            </>
          }
        />

        <div style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: "16px 16px", display: "flex", flexDirection: "column",
          gap: 4, minHeight: 0, background: C.bg,
        }}>
          {messages.length === 0
            ? (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: C.textDim, fontSize: "0.84rem", textAlign: "center",
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Say hello to {selectedFriend.fullName} 👋
              </div>
            )
            : messages.map((m) => (
                <MessageBubble key={m.id} msg={m} mine={m.senderId === user.id} />
              ))
          }
          {partnerTyping && (
            <div style={{ display: "flex", padding: "4px 0" }}>
              <div style={{
                padding: "10px 14px", borderRadius: "18px 18px 18px 4px",
                background: C.surfaceAlt, border: `1px solid ${C.border}`,
                display: "flex", gap: 4, alignItems: "center",
              }}>
                {[0, 180, 360].map((delay, i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: C.accent, display: "inline-block",
                    animation: `tdot 1.2s ${delay}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {imagePreview && (
          <div style={{
            padding: "8px 16px", flexShrink: 0,
            borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", gap: 10,
            background: C.surfaceAlt,
          }}>
            <img src={imagePreview} alt="preview" style={{ height: 52, borderRadius: 8, objectFit: "cover" }} />
            <button onClick={() => setImagePreview(null)} style={{
              width: 22, height: 22, borderRadius: "50%", background: "#ef4444",
              border: "none", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><X size={11} /></button>
          </div>
        )}

        <form onSubmit={handleSend} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          flexShrink: 0,
          borderTop: `1px solid ${C.border}`,
          background: C.bg,
        }}>
          <input type="file" accept="image/*" style={{ display: "none" }} ref={fileRef} onChange={handleImgUpload} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textMuted, cursor: "pointer",
          }}>
            <ImagePlus size={15} />
          </button>
          <input
            ref={compInputRef}
            style={{
              flex: 1, background: C.surfaceAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "10px 14px",
              color: C.text, outline: "none", minWidth: 0,
              fontFamily: "'DM Sans', sans-serif",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = C.borderGlow}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
            placeholder="Message…"
            value={messageInput}
            onChange={handleTyping}
            autoComplete="off" autoCorrect="off" spellCheck={false}
            enterKeyHint="send"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!messageInput.trim() && !imagePreview}
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: (messageInput.trim() || imagePreview)
                ? "linear-gradient(135deg, #7c3aed, #a78bfa)"
                : C.surfaceAlt,
              border: (messageInput.trim() || imagePreview) ? "none" : `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: (messageInput.trim() || imagePreview) ? "#fff" : C.textDim,
              cursor: (messageInput.trim() || imagePreview) ? "pointer" : "default",
              transition: "all 0.2s",
            }}
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    );
  };

  const DiscoverScreen = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <ScreenHeader title="Discover" subtitle="Verified Members" onBack={() => setActiveTab("home")} />
      <div style={{ padding: "14px 20px", flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: C.textDim, pointerEvents: "none",
          }} />
          <input
            style={{
              width: "100%", padding: "10px 13px 10px 34px", borderRadius: 11,
              border: `1px solid ${C.border}`, background: C.surfaceAlt,
              color: C.text, outline: "none", boxSizing: "border-box" as const,
              fontFamily: "'DM Sans', sans-serif", transition: "border-color 0.2s",
            }}
            onFocus={e => e.currentTarget.style.borderColor = C.borderGlow}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
            placeholder="Search by name or major…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            autoComplete="off" autoCorrect="off" spellCheck={false}
          />
          {nameFilter && (
            <button onClick={() => setNameFilter("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%",
              width: 20, height: 20, cursor: "pointer", color: C.textMuted,
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>
              <X size={11} />
            </button>
          )}
        </div>
        <div style={{ fontSize: "0.71rem", color: C.textDim, marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>
          <span style={{ color: C.accentGreen, fontWeight: 600 }}>● </span>
          {filteredDiscoverUsers.length} student{filteredDiscoverUsers.length !== 1 ? "s" : ""} found
          {nameFilter.trim() && <span style={{ color: C.accent, marginLeft: 4 }}>for "{nameFilter.trim()}"</span>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 20px", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredDiscoverUsers.map((u) => (
            <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
          ))}
          {filteredDiscoverUsers.length === 0 && (
            <div style={{
              background: C.surfaceAlt, border: `1px dashed ${C.border}`, borderRadius: 14,
              padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.82rem",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {nameFilter.trim() ? `No students found for "${nameFilter.trim()}".` : "No students to discover."}
            </div>
          )}
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );

  const ProfileScreen = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <ScreenHeader title="Profile" onBack={() => setActiveTab("home")} />
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 20, minHeight: 0 }}>
        {/* Profile card */}
        <div style={{
          background: C.surfaceAlt, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: "28px 20px", marginBottom: 16,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14, textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 80,
            background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(34,211,238,0.1))",
            pointerEvents: "none",
          }} />
          <div style={{ position: "relative" }}>
            <Avatar name={user.fullName} size={80} color="violet" online />
          </div>
          <div>
            <div style={{
              fontSize: "1.3rem", fontWeight: 800, color: C.text,
              fontFamily: "'Syne', sans-serif", letterSpacing: "-0.02em",
            }}>{user.fullName}</div>
            <div style={{ fontSize: "0.78rem", color: C.accent, fontWeight: 600, marginTop: 4 }}>
              @{user.fullName.toLowerCase().replace(/\s+/g, ".")}
            </div>
            {(user as any).course && (user as any).year && (
              <div style={{ fontSize: "0.75rem", color: C.textDim, marginTop: 3, fontFamily: "'DM Sans', sans-serif" }}>
                {(user as any).course} · {(user as any).year} Year
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", width: "100%",
            background: "rgba(255,255,255,0.03)", borderRadius: 12,
            border: `1px solid ${C.border}`,
          }}>
            {[
              ["Friends", friends.length],
              ["Requests", requests.length],
              ["Discover", discoverUsers.length],
            ].map(([label, val], i, arr) => (
              <div key={label as string} style={{
                flex: 1, borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <StatPill value={val as number} label={label as string} />
              </div>
            ))}
          </div>

          {/* Elite badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(167,139,250,0.1)",
            border: "1px solid rgba(167,139,250,0.25)",
            borderRadius: 100, padding: "6px 16px",
          }}>
            <Star size={12} color={C.accent} fill={C.accent} />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.accent, fontFamily: "'Syne', sans-serif" }}>
              ELITE STATUS
            </span>
          </div>

          <button onClick={onLogout} style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#f87171", borderRadius: 11, padding: "10px 28px",
            fontSize: "0.85rem", fontWeight: 600, cursor: "pointer",
            fontFamily: "'Syne', sans-serif",
          }}>Sign Out</button>
        </div>

        {/* Friend Requests */}
        {requests.length > 0 && (
          <div style={{
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: "hidden", marginBottom: 14,
          }}>
            <div style={{
              padding: "14px 18px 12px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif" }}>
                Friend Requests
              </span>
              <span style={{
                background: "rgba(167,139,250,0.12)", borderRadius: 100,
                padding: "2px 8px", fontSize: "0.7rem", color: C.accent, fontWeight: 700,
              }}>{requests.length}</span>
            </div>
            {requests.map((req) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <Avatar name={req.sender.fullName} size={40} color="cyan" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif" }}>
                    {req.sender.fullName}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
                    {(req.sender as any).course ? `${(req.sender as any).course} · ${(req.sender as any).year} Year` : "Campus student"}
                  </div>
                </div>
                <button onClick={() => void acceptRequest(req.id)} style={{
                  background: "linear-gradient(135deg, #059669, #34d399)",
                  border: "none", borderRadius: 9, padding: "8px 16px",
                  fontSize: "0.75rem", fontWeight: 700, color: "#fff", cursor: "pointer",
                  fontFamily: "'Syne', sans-serif",
                }}>Accept</button>
              </div>
            ))}
          </div>
        )}

        {/* Notifications */}
        {notifications.length > 0 && (
          <div style={{
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: "hidden", marginBottom: 14,
          }}>
            <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif" }}>
                Notifications
              </span>
            </div>
            {notifications.map((n) => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: "rgba(167,139,250,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem",
                }}>
                  {n.type === "friend_accept" ? "✓" : n.type === "friend_request" ? "+" : "i"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: C.text, fontFamily: "'Syne', sans-serif" }}>
                    {n.type === "friend_accept" ? "Request accepted" : n.type === "friend_request" ? "New request" : "Update"}
                  </div>
                  <div style={{ fontSize: "0.71rem", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>{n.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Blocked */}
        <div style={{
          background: C.surfaceAlt, border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: "hidden",
        }}>
          <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif" }}>
              Blocked Users
            </span>
          </div>
          {blockedUsers.length === 0
            ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.8rem", fontFamily: "'DM Sans', sans-serif" }}>
                <Lock size={18} style={{ marginBottom: 8, display: "block", margin: "0 auto 10px", opacity: 0.4 }} />
                No blocked users.
              </div>
            )
            : blockedUsers.map((e) => (
                <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: "rgba(239,68,68,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#f87171",
                  }}>
                    <ShieldBan size={15} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.84rem", fontWeight: 700, color: C.text, fontFamily: "'Syne', sans-serif" }}>{e.user.fullName}</div>
                    <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
                      {e.reason ? `Reason: ${e.reason}` : "Blocked user"}
                    </div>
                  </div>
                  <button onClick={() => void unblockUser(e.user.id)} style={{
                    background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 9, padding: "6px 12px",
                    fontSize: "0.73rem", fontWeight: 600, color: C.textMuted,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                    fontFamily: "'DM Sans', sans-serif",
                  }}>
                    <ShieldBan size={12} /> Unblock
                  </button>
                </div>
              ))
          }
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );

  // ─── Bottom Nav ───────────────────────────────────────────────────────────
  const tabs: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "home",     label: "Club",    icon: <Home size={20} /> },
    { id: "discover", label: "Explore", icon: <Grid3x3 size={20} /> },
    { id: "messages", label: "Inbox",   icon: <MessageCircle size={20} />, badge: usersWithUnread },
    { id: "profile",  label: "Elite",   icon: <Star size={20} /> },
  ];
  const navActive = (id: AppTab) =>
    id === "messages" ? (activeTab === "messages" || activeTab === "chat") : activeTab === id;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        background: C.bg, color: C.text,
        fontFamily: "'DM Sans', sans-serif",
        overflow: "hidden",
        /* Desktop: center and limit max-width for chat-app feel */
      }}>
        {/* Desktop layout wrapper */}
        <div style={{
          flex: 1, overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
          minHeight: 0,
        }}>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {activeTab === "home"     && <HomeScreen />}
            {activeTab === "discover" && <DiscoverScreen />}
            {activeTab === "messages" && <MessagesScreen />}
            {activeTab === "chat"     && <ChatScreen />}
            {activeTab === "profile"  && <ProfileScreen />}
          </div>

          {/* Bottom Nav */}
          {activeTab !== "chat" && (
            <nav style={{
              display: "flex",
              height: "calc(64px + env(safe-area-inset-bottom, 0px))",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              background: "rgba(8,11,18,0.97)",
              borderTop: `1px solid ${C.border}`,
              flexShrink: 0,
              backdropFilter: "blur(20px)",
            }}>
              {tabs.map((tab) => {
                const active = navActive(tab.id);
                return (
                  <button
                    key={tab.id}
                    className="nav-item"
                    onClick={() => {
                      if (tab.id === "messages") setSelectedFriend(null);
                      setActiveTab(tab.id);
                    }}
                    style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 4,
                      background: "none", border: "none", cursor: "pointer",
                      color: active ? C.accent : C.textDim,
                      fontSize: "0.6rem", fontWeight: 700,
                      position: "relative", padding: "8px 0",
                      fontFamily: "'Syne', sans-serif", letterSpacing: "0.06em",
                      transition: "color 0.15s",
                    }}
                  >
                    {/* Active indicator */}
                    {active && (
                      <span style={{
                        position: "absolute", top: 0, left: "50%",
                        transform: "translateX(-50%)",
                        width: 24, height: 2, borderRadius: 1,
                        background: C.accent,
                      }} />
                    )}
                    <span style={{ opacity: active ? 1 : 0.6 }}>{tab.icon}</span>
                    <span style={{ textTransform: "uppercase" }}>{tab.label}</span>
                    {tab.badge && tab.badge > 0 ? (
                      <span style={{
                        position: "absolute", top: 8, right: "calc(50% - 16px)",
                        background: C.accentPink, color: "#fff",
                        fontSize: "0.55rem", fontWeight: 800,
                        padding: "1px 5px", borderRadius: 100, minWidth: 16, textAlign: "center",
                        border: `2px solid ${C.bg}`,
                        fontFamily: "'Syne', sans-serif",
                      }}>{tab.badge > 99 ? "99+" : tab.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </div>

      {/* Outgoing Call Overlay */}
      {outgoingCall && !activeCall && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(8,11,18,0.97)",
          backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fade-in 0.3s ease",
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", fontWeight: 800, color: "#fff",
            fontFamily: "'Syne', sans-serif", marginBottom: 24,
            animation: "pulse-ring 1.5s infinite",
          }}>
            {initials(outgoingCall.receiverName)}
          </div>
          <h3 style={{ color: C.text, fontSize: "1.4rem", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
            {outgoingCall.receiverName}
          </h3>
          <p style={{ color: C.textMuted, marginTop: 8, fontSize: "0.85rem", fontFamily: "'DM Sans', sans-serif" }}>Calling…</p>
          <button onClick={() => setOutgoingCall(null)} style={{
            marginTop: 36, background: "#ef4444",
            padding: "12px 28px", borderRadius: 100, border: "none",
            color: "#fff", cursor: "pointer", fontSize: "0.88rem", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 8, fontFamily: "'Syne', sans-serif",
          }}>
            <Phone size={15} style={{ transform: "rotate(135deg)" }} /> Cancel
          </button>
        </div>
      )}

      {/* Incoming Call Overlay */}
      {incomingCall && !activeCall && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(8,11,18,0.97)",
          backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fade-in 0.3s ease",
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg, #059669, #34d399)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", fontWeight: 800, color: "#fff",
            fontFamily: "'Syne', sans-serif", marginBottom: 24,
          }}>
            {initials(incomingCall.callerName)}
          </div>
          <h3 style={{ color: C.text, fontSize: "1.4rem", fontFamily: "'Syne', sans-serif", fontWeight: 800 }}>
            {incomingCall.callerName}
          </h3>
          <p style={{ color: C.textMuted, marginTop: 8, fontSize: "0.85rem", fontFamily: "'DM Sans', sans-serif" }}>
            Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 40 }}>
            <button onClick={declineCall} style={{
              background: "#ef4444", borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", width: 62, height: 62,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Phone size={22} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={acceptCall} style={{
              background: "linear-gradient(135deg, #059669, #34d399)",
              borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", width: 62, height: 62,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {incomingCall.isVideo ? <Camera size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
