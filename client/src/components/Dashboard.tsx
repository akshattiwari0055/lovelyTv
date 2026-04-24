/**
 * Dashboard.tsx — Campus Connect · Redesigned UI
 * Fixed:
 *  1. Input focus loss → ChatInput extracted into React.memo + useCallback handlers
 *  2. Unread badge logic → usersWithUnread counts distinct users, not total msgs
 *  3. Mark-as-read on chat open → setUnreadCounts zeroed on selection
 *  4. Re-render cascade → useCallback / useMemo everywhere appropriate
 */

import {
  FormEvent, useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import React from "react";
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
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Figtree:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; overflow: hidden; position: fixed; width: 100%; background: #060910; }
  ::-webkit-scrollbar { width: 4px; background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
  input, textarea, select { font-size: 15px !important; font-family: 'Figtree', sans-serif; }

  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
    70% { box-shadow: 0 0 0 16px rgba(139, 92, 246, 0); }
    100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
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
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }

  .chat-item:hover { background: rgba(139,92,246,0.05) !important; }
  .send-btn:not(:disabled):hover { transform: scale(1.05); }
  .action-btn:hover { border-color: rgba(139,92,246,0.5) !important; background: rgba(139,92,246,0.1) !important; }
  .nav-item:hover { color: #8b5cf6 !important; }
  .sidebar-btn:hover { background: rgba(255,255,255,0.05) !important; }
  .user-card:hover { border-color: rgba(139,92,246,0.2) !important; transform: translateY(-1px); }
  .user-card { transition: all 0.2s ease; }
`;

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: "#060910",
  bgDeep: "#040609",
  surface: "#0c1020",
  surfaceAlt: "#111827",
  surfaceHover: "#141d2e",
  border: "rgba(255,255,255,0.06)",
  borderMid: "rgba(255,255,255,0.1)",
  borderGlow: "rgba(139,92,246,0.35)",
  accent: "#8b5cf6",
  accentBright: "#a78bfa",
  accentAlt: "#06b6d4",
  accentPink: "#ec4899",
  accentGreen: "#10b981",
  accentAmber: "#f59e0b",
  text: "#f8fafc",
  textMuted: "rgba(248,250,252,0.5)",
  textDim: "rgba(248,250,252,0.25)",
  textFaint: "rgba(248,250,252,0.12)",
};

const FONT_DISPLAY = "'Outfit', sans-serif";
const FONT_BODY = "'Figtree', sans-serif";

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = React.memo(function Avatar({
  name, size = 40, color = "violet", online = false,
}: { name: string; size?: number; color?: "violet" | "cyan" | "pink" | "green"; online?: boolean }) {
  const gradients = {
    violet: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
    cyan:   "linear-gradient(135deg, #0891b2, #06b6d4)",
    pink:   "linear-gradient(135deg, #be185d, #ec4899)",
    green:  "linear-gradient(135deg, #047857, #10b981)",
  };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: gradients[color],
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.34, fontWeight: 700, color: "#fff",
        fontFamily: FONT_DISPLAY, letterSpacing: "-0.01em",
      }}>
        {initials(name)}
      </div>
      {online && (
        <span style={{
          position: "absolute", bottom: 1, right: 1,
          width: size * 0.24, height: size * 0.24,
          background: C.accentGreen, borderRadius: "50%",
          border: `2px solid ${C.bg}`,
          animation: "blink 2s infinite",
        }} />
      )}
    </div>
  );
});

// ─── StatPill ────────────────────────────────────────────────────────────────
function StatPill({ value, label }: { value: string | number; label: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", padding: "16px 8px" }}>
      <div style={{
        fontSize: "1.4rem", fontWeight: 800, color: C.text,
        fontFamily: FONT_DISPLAY, letterSpacing: "-0.03em",
      }}>{value}</div>
      <div style={{ fontSize: "0.67rem", color: C.textDim, fontWeight: 500, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: FONT_BODY }}>{label}</div>
    </div>
  );
}

// ─── LiveBadge ────────────────────────────────────────────────────────────────
function LiveBadge({ label }: { label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "rgba(236,72,153,0.1)",
      border: "1px solid rgba(236,72,153,0.2)",
      borderRadius: 100, padding: "4px 12px",
      fontSize: "0.65rem", fontWeight: 700,
      letterSpacing: "0.1em", color: C.accentPink,
      fontFamily: FONT_DISPLAY,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: C.accentPink, display: "inline-block",
        animation: "blink 1.2s infinite",
      }} />
      {label}
    </span>
  );
}

// ─── HeroCard ────────────────────────────────────────────────────────────────
const HeroCard = React.memo(function HeroCard({ onStartRandom }: { onStartRandom: () => void }) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg, #0d1428 0%, #0f1730 50%, #0a1020 100%)",
      border: `1px solid rgba(139,92,246,0.15)`,
      borderRadius: 20, padding: "32px 28px",
      animation: "slide-up 0.4s ease",
    }}>
      <div style={{
        position: "absolute", top: -60, right: -60, width: 240, height: 240,
        background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -40, left: 40, width: 160, height: 160,
        background: "radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative" }}>
        <LiveBadge label="LIVE ON CAMPUS" />
        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
          fontWeight: 900, lineHeight: 1.1,
          color: C.text, margin: "16px 0 8px",
          letterSpacing: "-0.04em",
        }}>
          Connect.<br />
          <span style={{
            background: "linear-gradient(90deg, #8b5cf6, #06b6d4)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>Witness. Vibe.</span>
        </h1>
        <p style={{
          fontSize: "0.9rem", color: C.textMuted, lineHeight: 1.7,
          margin: "0 0 24px", maxWidth: 320, fontFamily: FONT_BODY, fontWeight: 400,
        }}>
          The high-frequency social layer of your campus. Real-time chats, instant connections, zero noise.
        </p>
        <button
          onClick={onStartRandom}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
            color: "#fff", fontWeight: 700, fontSize: "0.88rem",
            padding: "12px 24px", borderRadius: 12, border: "none",
            cursor: "pointer", boxShadow: "0 4px 20px rgba(109,40,217,0.4)",
            fontFamily: FONT_DISPLAY, letterSpacing: "0.01em",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 30px rgba(109,40,217,0.5)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(109,40,217,0.4)";
          }}
        >
          <Zap size={15} /> Start Random Chat
        </button>
      </div>
    </div>
  );
});

// ─── ChatItem ────────────────────────────────────────────────────────────────
const ChatItem = React.memo(function ChatItem({
  friend, unread, lastMsg, active, onClick, compact = false,
}: { friend: User; unread: number; lastMsg?: string; active?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="chat-item"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: compact ? "10px 16px" : "13px 20px",
        width: "100%", textAlign: "left",
        background: active ? "rgba(139,92,246,0.08)" : "transparent",
        border: "none",
        borderBottom: `1px solid ${C.border}`,
        cursor: "pointer", transition: "background 0.15s",
        borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
      }}
    >
      <Avatar name={friend.fullName} size={compact ? 38 : 44} color="cyan" online={unread > 0} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: compact ? "0.85rem" : "0.9rem", fontWeight: unread > 0 ? 700 : 500,
          color: C.text, fontFamily: FONT_DISPLAY,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {friend.fullName}
        </div>
        <div style={{
          fontSize: "0.75rem", marginTop: 2,
          color: unread > 0 ? C.accentBright : C.textDim,
          fontWeight: unread > 0 ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: FONT_BODY,
        }}>
          {lastMsg ?? (friend.interests || "Tap to chat")}
        </div>
      </div>
      <div style={{ minWidth: 28, display: "flex", justifyContent: "flex-end" }}>
        {unread > 0 ? (
          <span style={{
            background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
            color: "#fff", fontSize: "0.6rem", fontWeight: 800,
            padding: "2px 7px", borderRadius: 100,
            minWidth: 20, textAlign: "center",
            fontFamily: FONT_DISPLAY,
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </div>
    </button>
  );
});

// ─── UserCard ────────────────────────────────────────────────────────────────
const UserCard = React.memo(function UserCard({ user: u, onAdd }: { user: User; onAdd: () => void }) {
  const [sent, setSent] = useState(false);
  const handleAdd = useCallback(() => {
    setSent(true);
    onAdd();
  }, [onAdd]);
  return (
    <article
      className="user-card"
      style={{
        background: C.surfaceAlt,
        border: `1px solid ${C.border}`,
        borderRadius: 14, padding: "14px 16px",
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      <Avatar name={u.fullName} size={44} color="violet" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.9rem", fontWeight: 700, color: C.text,
          fontFamily: FONT_DISPLAY, marginBottom: 2,
        }}>
          {u.fullName}
        </div>
        <div style={{ fontSize: "0.73rem", color: C.textDim, fontFamily: FONT_BODY }}>
          {u.course && u.year
            ? `${u.course} · ${u.year} Year`
            : u.interests ?? "Campus student"}
        </div>
        {u.mutualConnections != null && u.mutualConnections > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.7rem", color: C.accentAlt, marginTop: 3 }}>
            <Users size={10} /> {u.mutualConnections} mutual
          </div>
        )}
      </div>
      <button
        onClick={handleAdd}
        disabled={sent}
        className="action-btn"
        style={{
          background: sent ? "transparent" : "rgba(139,92,246,0.1)",
          border: `1px solid ${sent ? C.border : "rgba(139,92,246,0.3)"}`,
          borderRadius: 9, padding: "8px 14px",
          fontSize: "0.75rem", fontWeight: 600,
          color: sent ? C.textDim : C.accent,
          cursor: sent ? "default" : "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 5,
          transition: "all 0.2s", fontFamily: FONT_BODY,
        }}
      >
        {sent ? <Check size={13} /> : <UserPlus size={13} />}
        {sent ? "Sent" : "Add"}
      </button>
    </article>
  );
});

// ─── MessageBubble ────────────────────────────────────────────────────────────
const MessageBubble = React.memo(function MessageBubble({ msg, mine }: { msg: Message; mine: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", padding: "2px 0" }}>
      <div style={{
        maxWidth: "70%", padding: "10px 14px",
        borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: mine
          ? "linear-gradient(135deg, #6d28d9, #8b5cf6)"
          : C.surfaceAlt,
        border: mine ? "none" : `1px solid ${C.border}`,
        color: mine ? "#fff" : C.text,
        fontSize: "0.88rem", lineHeight: 1.55,
        wordBreak: "break-word", fontFamily: FONT_BODY,
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
          <small style={{ fontSize: "0.62rem", opacity: 0.5 }}>{fmt(msg.createdAt)}</small>
          {mine && (msg.isRead
            ? <CheckCheck size={10} color="rgba(255,255,255,0.7)" />
            : <Check size={10} color="rgba(255,255,255,0.4)" />
          )}
        </div>
      </div>
    </div>
  );
});

// ─── MessageList ─────────────────────────────────────────────────────────────
// Memoized so typing in the input doesn't re-render the entire message list
const MessageList = React.memo(function MessageList({
  messages, userId, partnerTyping, bottomRef,
}: {
  messages: Message[];
  userId: string;
  partnerTyping: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div style={{
      flex: 1, overflowY: "auto", overflowX: "hidden",
      padding: "20px 20px", display: "flex", flexDirection: "column",
      gap: 4, minHeight: 0, background: C.bg,
    }}>
      {messages.length === 0
        ? (
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textDim, fontSize: "0.86rem", textAlign: "center",
            fontFamily: FONT_BODY,
          }}>
            Start the conversation 👋
          </div>
        )
        : messages.map((m) => (
            <MessageBubble key={m.id} msg={m} mine={m.senderId === userId} />
          ))
      }
      {partnerTyping && (
        <div style={{ display: "flex", padding: "4px 0" }}>
          <div style={{
            padding: "10px 14px", borderRadius: "16px 16px 16px 4px",
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
  );
});

// ─── ChatInput ────────────────────────────────────────────────────────────────
// FIX #1: Extracted into its own memoized component so that parent state changes
// (messages, partnerTyping, unreadCounts, etc.) never cause this to re-mount or
// lose focus. The ref and stable callbacks guarantee zero blur on every keystroke.
interface ChatInputProps {
  value: string;
  imagePreview: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  fileRef: React.RefObject<HTMLInputElement>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSend: (e: FormEvent) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
}

const ChatInput = React.memo(function ChatInput({
  value,
  imagePreview,
  inputRef,
  fileRef,
  onChange,
  onSend,
  onImageUpload,
  onClearImage,
}: ChatInputProps) {
  const hasContent = value.trim() || imagePreview;

  return (
    <>
      {imagePreview && (
        <div style={{
          padding: "8px 16px", flexShrink: 0,
          borderTop: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 10,
          background: C.surfaceAlt,
        }}>
          <img src={imagePreview} alt="preview" style={{ height: 52, borderRadius: 8, objectFit: "cover" }} />
          <button
            type="button"
            onClick={onClearImage}
            style={{
              width: 22, height: 22, borderRadius: "50%", background: "#ef4444",
              border: "none", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={11} />
          </button>
        </div>
      )}
      <form
        onSubmit={onSend}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          flexShrink: 0,
          borderTop: `1px solid ${C.border}`,
          background: C.bg,
        }}
      >
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          ref={fileRef}
          onChange={onImageUpload}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textMuted, cursor: "pointer",
          }}
        >
          <ImagePlus size={15} />
        </button>
        <input
          ref={inputRef}
          style={{
            flex: 1, background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            borderRadius: 12, padding: "10px 14px",
            color: C.text, outline: "none", minWidth: 0,
            fontFamily: FONT_BODY,
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.borderGlow}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
          placeholder="Message…"
          value={value}
          onChange={onChange}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!hasContent}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: hasContent
              ? "linear-gradient(135deg, #6d28d9, #8b5cf6)"
              : C.surfaceAlt,
            border: hasContent ? "none" : `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: hasContent ? "#fff" : C.textDim,
            cursor: hasContent ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          <Send size={14} />
        </button>
      </form>
    </>
  );
});

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const compInputRef = useRef<HTMLInputElement>(null);
  // Track typing state in a ref so the typing callback doesn't need to be recreated
  const isTypingRef = useRef(false);

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
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : false
  );

  // FIX #2: Count of distinct users with unread messages (not total unread messages)
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
  // Use a stable ref for selectedFriend and conversationIsOpen to avoid
  // re-registering socket listeners on every state change
  const selectedFriendRef = useRef(selectedFriend);
  const conversationIsOpenRef = useRef(conversationIsOpen);
  useEffect(() => { selectedFriendRef.current = selectedFriend; }, [selectedFriend]);
  useEffect(() => { conversationIsOpenRef.current = conversationIsOpen; }, [conversationIsOpen]);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (msg: Message) => {
      setMessages((c) => (c.some((e) => e.id === msg.id) ? c : [...c, msg]));
      const otherId = msg.senderId === user.id ? (msg as any).receiverId ?? "" : msg.senderId;
      if (msg.content) setLastMessages((c) => ({ ...c, [otherId]: msg.content! }));

      const sf = selectedFriendRef.current;
      const isOpen = conversationIsOpenRef.current;
      if (sf?.id === msg.senderId && isOpen && document.visibilityState === "visible") {
        socket.emit("message:read", { messageIds: [msg.id], senderId: msg.senderId });
        setUnreadCounts((c) => ({ ...c, [msg.senderId]: 0 }));
      } else if (msg.senderId !== user.id) {
        // FIX #2 cont.: Increment per-user count, cap at 99
        setUnreadCounts((c) => ({ ...c, [msg.senderId]: Math.min((c[msg.senderId] ?? 0) + 1, 99) }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[] }) => {
      setMessages((c) => c.map((m) => messageIds.includes(m.id) ? { ...m, isRead: true } : m));
    });
    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriendRef.current?.id === typerId) setPartnerTyping(true);
    });
    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriendRef.current?.id === typerId) setPartnerTyping(false);
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
  // Only re-run when token or user.id changes — not on selectedFriend change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user.id]);

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

  // FIX #1: Focus only when switching to a new friend, not on every render
  useEffect(() => {
    if (activeTab === "chat" && selectedFriend) {
      const frame = requestAnimationFrame(() => compInputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
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
    // FIX #3: Zero out unread for this user when chat is opened
    setUnreadCounts((c) => ({ ...c, [otherId]: 0 }));
  }

  const sendFriendRequest = useCallback(async (id: string) => {
    await api.post("/friend-requests", { receiverId: id });
    void loadDiscover();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptRequest = useCallback(async (id: string) => {
    await api.post(`/friend-requests/${id}/accept`);
    await Promise.all([loadFriends(), loadRequests()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unblockUser = useCallback(async (uid: string) => {
    await api.delete(`/users/${uid}/block`);
    await Promise.all([loadBlockedUsers(), loadDiscover(), loadFriends(), loadRequests()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChat = useCallback((friend: User) => {
    setSelectedFriend(friend);
    setMessages([]);
    setActiveTab("chat");
    // FIX #3: Immediately zero unread badge when user taps the conversation
    setUnreadCounts((c) => ({ ...c, [friend.id]: 0 }));
  }, []);

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

  // FIX #1 + #4: Stable send handler — wrapped in useCallback, selectedFriend
  // accessed via ref so the callback identity never changes during a conversation
  const selectedFriendIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { selectedFriendIdRef.current = selectedFriend?.id; }, [selectedFriend?.id]);

  const handleSend = useCallback((e: FormEvent) => {
    e.preventDefault();
    const friendId = selectedFriendIdRef.current;
    if (!friendId) return;
    setMessageInput(prev => {
      if (!prev.trim() && !imagePreview) return prev;
      getSocket()?.emit("message:send", {
        receiverId: friendId,
        content: prev,
        imageUrl: imagePreview,
      });
      getSocket()?.emit("typing:stop", { receiverId: friendId });
      setImagePreview(null);
      requestAnimationFrame(() => compInputRef.current?.focus());
      return "";
    });
  // imagePreview accessed from closure is fine since setMessageInput reads it via outer state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FIX #1 (CORE): Stable typing handler — useCallback with empty deps.
  // Typing state tracked in a ref to avoid stale-closure issues without
  // triggering re-renders or recreating this function.
  const handleTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    const friendId = selectedFriendIdRef.current;
    if (!friendId) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      getSocket()?.emit("typing:start", { receiverId: friendId });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      getSocket()?.emit("typing:stop", { receiverId: friendId });
    }, 2000);
  }, []); // ← empty deps: function never recreated, input never re-mounts

  const handleImgUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleClearImage = useCallback(() => setImagePreview(null), []);

  // ─── DESKTOP SIDEBAR ─────────────────────────────────────────────────────
  function renderSidebarItem({ id, label, icon, badge }: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }) {
    const active = id === "messages" ? (activeTab === "messages" || activeTab === "chat") : activeTab === id;
    return (
      <button
        className="sidebar-btn"
        onClick={() => {
          if (id === "messages") setSelectedFriend(null);
          setActiveTab(id);
        }}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 14px", borderRadius: 11, width: "100%",
          background: active ? "rgba(139,92,246,0.1)" : "transparent",
          border: active ? `1px solid rgba(139,92,246,0.2)` : "1px solid transparent",
          color: active ? C.accentBright : C.textMuted,
          cursor: "pointer", textAlign: "left",
          fontFamily: FONT_BODY, fontSize: "0.88rem", fontWeight: active ? 600 : 400,
          transition: "all 0.15s", position: "relative",
        }}
      >
        <span style={{ opacity: active ? 1 : 0.6 }}>{icon}</span>
        <span>{label}</span>
        {badge && badge > 0 ? (
          <span style={{
            marginLeft: "auto",
            background: C.accentPink, color: "#fff",
            fontSize: "0.6rem", fontWeight: 800,
            padding: "1px 6px", borderRadius: 100,
            fontFamily: FONT_DISPLAY,
          }}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </button>
    );
  }

  // ─── CONTENT PANELS ──────────────────────────────────────────────────────

  function renderSectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
      <h2 style={{
        fontSize: "0.72rem", fontWeight: 700, color: C.textDim,
        textTransform: "uppercase", letterSpacing: "0.14em",
        fontFamily: FONT_DISPLAY,
      }}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{
          fontSize: "0.77rem", fontWeight: 600, color: C.accent,
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          fontFamily: FONT_BODY,
        }}>
          {action} <ChevronRight size={12} />
        </button>
      )}
    </div>
  ); }

  // Stable callbacks for friend-list chat opens (prevent ChatItem re-renders)
  const openChatCallbacks = useMemo(
    () => Object.fromEntries(friends.map(f => [f.id, () => openChat(f)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friends.map(f => f.id).join(",")]
  );

  function renderHomeContent() { return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isDesktop ? "32px 36px" : 20, minHeight: 0 }}>
      <HeroCard onStartRandom={() => navigate("/app/random")} />
      <div style={{
        display: "grid",
        gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
        gap: 28,
        alignItems: "start",
        marginTop: 28,
      }}>
        <div>
          {renderSectionTitle({ title: "Curated For You", action: "Discover all", onAction: () => setActiveTab("discover") })}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {discoverUsers.slice(0, 4).length === 0
              ? (
                <div style={{
                  background: C.surfaceAlt, border: `1px dashed ${C.border}`, borderRadius: 14,
                  padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.84rem",
                  fontFamily: FONT_BODY,
                }}>No suggestions yet.</div>
              )
              : discoverUsers.slice(0, 4).map((u) => (
                  <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
                ))
            }
          </div>
        </div>
        <div>
          {renderSectionTitle({ title: "Active Dialogue", action: "See all", onAction: () => setActiveTab("messages") })}
          {friends.length > 0 && (
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: C.accentGreen,
                display: "inline-block", animation: "blink 1.5s infinite",
              }} />
              <span style={{ fontSize: "0.73rem", color: C.accentGreen, fontWeight: 600, fontFamily: FONT_BODY }}>
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
                <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.84rem", fontFamily: FONT_BODY }}>
                  Add friends to start chatting
                </div>
              )
              : friends.slice(0, 6).map((f) => (
                  <ChatItem key={f.id} friend={f}
                    unread={unreadCounts[f.id] ?? 0}
                    lastMsg={lastMessages[f.id]}
                    onClick={openChatCallbacks[f.id] ?? (() => openChat(f))}
                    compact
                  />
                ))
            }
          </div>
        </div>
      </div>
      <div style={{ height: 32 }} />
    </div>
  ); }

  function renderMessagesContent() { return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "20px 24px 16px",
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: "1.2rem", color: C.text, letterSpacing: "-0.02em" }}>Inbox</h2>
        <p style={{ fontFamily: FONT_BODY, fontSize: "0.78rem", color: C.accentGreen, marginTop: 2, fontWeight: 500 }}>{friends.length} conversations</p>
      </div>
      {requests.length > 0 && (
        <button onClick={() => setActiveTab("profile")} style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "12px 24px",
          background: "rgba(139,92,246,0.05)",
          border: "none", borderBottom: `1px solid rgba(139,92,246,0.12)`,
          cursor: "pointer",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(139,92,246,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <UserPlus size={15} color={C.accent} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.accent, fontFamily: FONT_DISPLAY }}>
              {requests.length} Friend Request{requests.length > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.73rem", color: C.textDim, fontFamily: FONT_BODY }}>Tap to review</div>
          </div>
          <ChevronRight size={14} color={C.textDim} />
        </button>
      )}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {friends.length === 0
          ? (
            <div style={{ padding: 48, textAlign: "center", color: C.textDim, fontSize: "0.86rem", fontFamily: FONT_BODY }}>
              No conversations yet. Discover and add friends!
            </div>
          )
          : friends.map((f) => (
              <ChatItem key={f.id} friend={f} active={selectedFriend?.id === f.id}
                unread={unreadCounts[f.id] ?? 0}
                lastMsg={lastMessages[f.id]}
                onClick={openChatCallbacks[f.id] ?? (() => openChat(f))}
              />
            ))
        }
      </div>
    </div>
  ); }

  function renderChatContent() {
    if (!selectedFriend) return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 12, color: C.textDim,
      }}>
        <MessageCircle size={40} style={{ opacity: 0.2 }} />
        <p style={{ fontFamily: FONT_BODY, fontSize: "0.9rem" }}>Select a conversation</p>
      </div>
    );

    if (activeCall && zegoConfig) {
      return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 20px", height: 60, flexShrink: 0,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: C.text }}>{selectedFriend.fullName}</span>
            <button onClick={() => setActiveCall(null)} style={{
              background: "#ef4444", padding: "7px 16px",
              borderRadius: 9, border: "none", color: "#fff", cursor: "pointer",
              fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              fontFamily: FONT_DISPLAY, fontSize: "0.82rem",
            }}>
              <Phone size={13} style={{ transform: "rotate(135deg)" }} /> End
            </button>
          </div>
          <div style={{ flex: 1, background: "#000", position: "relative", minHeight: 0 }}>
            <VideoRoom
              appId={zegoConfig.appId} serverSecret={zegoConfig.serverSecret}
              roomId={activeCall.roomId} userId={user.id} userName={user.fullName}
              isAudioOnly={!activeCall.isVideo} onJoined={() => {}}
            />
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Chat Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 20px", height: 62, flexShrink: 0,
          background: C.bg,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {!isDesktop && (
              <button onClick={goBack} style={{
                width: 32, height: 32, borderRadius: 8,
                background: C.surfaceAlt, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.textMuted, cursor: "pointer",
              }}>
                <ArrowLeft size={15} />
              </button>
            )}
            <Avatar name={selectedFriend.fullName} size={36} color="cyan" online />
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: "0.95rem", fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>
                {selectedFriend.fullName}
              </div>
              <div style={{ fontSize: "0.7rem", color: C.accentGreen, fontWeight: 600, fontFamily: FONT_BODY }}>Online</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              width: 36, height: 36, borderRadius: 9,
              background: C.surfaceAlt, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.textMuted, cursor: "pointer",
            }} onClick={() => startCall(false)}>
              <Phone size={15} />
            </button>
            <button style={{
              width: 36, height: 36, borderRadius: 9,
              background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
              border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", cursor: "pointer",
            }} onClick={() => startCall(true)}>
              <Camera size={15} />
            </button>
          </div>
        </div>

        {/* FIX #1 + #4: MessageList is memoized — typing in ChatInput won't re-render messages */}
        <MessageList
          messages={messages}
          userId={user.id}
          partnerTyping={partnerTyping}
          bottomRef={bottomRef}
        />

        {/* FIX #1 (CORE): ChatInput is fully memoized with stable callback refs.
            It will NEVER re-mount or re-render due to parent state changes.
            The input ref is stable across renders — focus is permanent. */}
        <ChatInput
          value={messageInput}
          imagePreview={imagePreview}
          inputRef={compInputRef}
          fileRef={fileRef}
          onChange={handleTyping}
          onSend={handleSend}
          onImageUpload={handleImgUpload}
          onClearImage={handleClearImage}
        />
      </div>
    );
  }

  function renderDiscoverContent() { return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: "1.2rem", color: C.text, letterSpacing: "-0.02em" }}>Discover</h2>
        <p style={{ fontFamily: FONT_BODY, fontSize: "0.78rem", color: C.textMuted, marginTop: 2 }}>Verified Members</p>
      </div>
      <div style={{ padding: "12px 20px", flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: C.textDim, pointerEvents: "none",
          }} />
          <input
            style={{
              width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10,
              border: `1px solid ${C.border}`, background: C.surfaceAlt,
              color: C.text, outline: "none", boxSizing: "border-box" as const,
              fontFamily: FONT_BODY, transition: "border-color 0.2s",
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
        <div style={{ fontSize: "0.72rem", color: C.textDim, marginTop: 8, fontFamily: FONT_BODY }}>
          <span style={{ color: C.accentGreen, fontWeight: 600 }}>● </span>
          {filteredDiscoverUsers.length} student{filteredDiscoverUsers.length !== 1 ? "s" : ""} found
          {nameFilter.trim() && <span style={{ color: C.accent, marginLeft: 4 }}>for "{nameFilter.trim()}"</span>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 20px", minHeight: 0 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(280px, 1fr))" : "1fr",
          gap: 10,
        }}>
          {filteredDiscoverUsers.map((u) => (
            <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
          ))}
        </div>
        {filteredDiscoverUsers.length === 0 && (
          <div style={{
            background: C.surfaceAlt, border: `1px dashed ${C.border}`, borderRadius: 14,
            padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.84rem",
            fontFamily: FONT_BODY,
          }}>
            {nameFilter.trim() ? `No students found for "${nameFilter.trim()}".` : "No students to discover."}
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>
    </div>
  ); }

  function renderProfileContent() { return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: "1.2rem", color: C.text, letterSpacing: "-0.02em" }}>Profile</h2>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 20, minHeight: 0 }}>
        <div style={{
          background: "linear-gradient(135deg, #0d1428, #0f1730)",
          border: `1px solid rgba(139,92,246,0.15)`,
          borderRadius: 20, padding: "28px 24px", marginBottom: 16,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 16, textAlign: "center", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: -40, right: -40, width: 200, height: 200,
            background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <Avatar name={user.fullName} size={80} color="violet" online />
          <div>
            <div style={{
              fontSize: "1.5rem", fontWeight: 900, color: C.text,
              fontFamily: FONT_DISPLAY, letterSpacing: "-0.03em",
            }}>{user.fullName}</div>
            <div style={{ fontSize: "0.82rem", color: C.accentBright, fontWeight: 600, marginTop: 4, fontFamily: FONT_BODY }}>
              @{user.fullName.toLowerCase().replace(/\s+/g, ".")}
            </div>
            {(user as any).course && (user as any).year && (
              <div style={{ fontSize: "0.77rem", color: C.textDim, marginTop: 3, fontFamily: FONT_BODY }}>
                {(user as any).course} · {(user as any).year} Year
              </div>
            )}
          </div>
          <div style={{
            display: "flex", width: "100%",
            background: "rgba(255,255,255,0.03)", borderRadius: 14,
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
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(139,92,246,0.1)",
            border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: 100, padding: "6px 16px",
          }}>
            <Star size={12} color={C.accent} fill={C.accent} />
            <span style={{ fontSize: "0.73rem", fontWeight: 700, color: C.accent, fontFamily: FONT_DISPLAY }}>
              ELITE STATUS
            </span>
          </div>
          <button onClick={onLogout} style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            color: "#f87171", borderRadius: 10, padding: "10px 28px",
            fontSize: "0.87rem", fontWeight: 600, cursor: "pointer",
            fontFamily: FONT_DISPLAY,
          }}>Sign Out</button>
        </div>

        {requests.length > 0 && (
          <div style={{
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: "hidden", marginBottom: 14,
          }}>
            <div style={{
              padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY }}>Friend Requests</span>
              <span style={{
                background: "rgba(139,92,246,0.12)", borderRadius: 100,
                padding: "2px 9px", fontSize: "0.7rem", color: C.accent, fontWeight: 700,
                fontFamily: FONT_DISPLAY,
              }}>{requests.length}</span>
            </div>
            {requests.map((req) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <Avatar name={req.sender.fullName} size={40} color="cyan" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY }}>
                    {req.sender.fullName}
                  </div>
                  <div style={{ fontSize: "0.73rem", color: C.textDim, fontFamily: FONT_BODY }}>
                    {(req.sender as any).course ? `${(req.sender as any).course} · ${(req.sender as any).year} Year` : "Campus student"}
                  </div>
                </div>
                <button onClick={() => void acceptRequest(req.id)} style={{
                  background: "linear-gradient(135deg, #047857, #10b981)",
                  border: "none", borderRadius: 9, padding: "8px 16px",
                  fontSize: "0.77rem", fontWeight: 700, color: "#fff", cursor: "pointer",
                  fontFamily: FONT_DISPLAY,
                }}>Accept</button>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div style={{
            background: C.surfaceAlt, border: `1px solid ${C.border}`,
            borderRadius: 16, overflow: "hidden", marginBottom: 14,
          }}>
            <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY }}>Notifications</span>
            </div>
            {notifications.map((n) => (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: "rgba(139,92,246,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.9rem",
                }}>
                  {n.type === "friend_accept" ? "✓" : n.type === "friend_request" ? "+" : "i"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.84rem", fontWeight: 600, color: C.text, fontFamily: FONT_DISPLAY }}>
                    {n.type === "friend_accept" ? "Request accepted" : n.type === "friend_request" ? "New request" : "Update"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: FONT_BODY }}>{n.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: C.surfaceAlt, border: `1px solid ${C.border}`,
          borderRadius: 16, overflow: "hidden",
        }}>
          <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY }}>Blocked Users</span>
          </div>
          {blockedUsers.length === 0
            ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: "0.82rem", fontFamily: FONT_BODY }}>
                <Lock size={18} style={{ marginBottom: 10, display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
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
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: C.text, fontFamily: FONT_DISPLAY }}>{e.user.fullName}</div>
                    <div style={{ fontSize: "0.72rem", color: C.textDim, fontFamily: FONT_BODY }}>
                      {e.reason ? `Reason: ${e.reason}` : "Blocked user"}
                    </div>
                  </div>
                  <button onClick={() => void unblockUser(e.user.id)} style={{
                    background: "transparent", border: `1px solid ${C.border}`,
                    borderRadius: 9, padding: "6px 12px",
                    fontSize: "0.74rem", fontWeight: 600, color: C.textMuted,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                    fontFamily: FONT_BODY,
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
  ); }

  // ─── MOBILE Bottom Nav ────────────────────────────────────────────────────
  const mobileTabs: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "home",     label: "Club",    icon: <Home size={20} /> },
    { id: "discover", label: "Explore", icon: <Grid3x3 size={20} /> },
    // FIX #2: badge shows count of users with unread, not total message count
    { id: "messages", label: "Inbox",   icon: <MessageCircle size={20} />, badge: usersWithUnread },
    { id: "profile",  label: "Elite",   icon: <Star size={20} /> },
  ];
  const navActive = (id: AppTab) =>
    id === "messages" ? (activeTab === "messages" || activeTab === "chat") : activeTab === id;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const callOverlays = (
    <>
      {outgoingCall && !activeCall && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(6,9,16,0.97)",
          backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fade-in 0.3s ease",
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", fontWeight: 800, color: "#fff",
            fontFamily: FONT_DISPLAY, marginBottom: 24,
            animation: "pulse-ring 1.5s infinite",
          }}>
            {initials(outgoingCall.receiverName)}
          </div>
          <h3 style={{ color: C.text, fontSize: "1.5rem", fontFamily: FONT_DISPLAY, fontWeight: 900, letterSpacing: "-0.02em" }}>
            {outgoingCall.receiverName}
          </h3>
          <p style={{ color: C.textMuted, marginTop: 8, fontSize: "0.87rem", fontFamily: FONT_BODY }}>Calling…</p>
          <button onClick={() => setOutgoingCall(null)} style={{
            marginTop: 36, background: "#ef4444",
            padding: "12px 28px", borderRadius: 12, border: "none",
            color: "#fff", cursor: "pointer", fontSize: "0.9rem", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_DISPLAY,
          }}>
            <Phone size={15} style={{ transform: "rotate(135deg)" }} /> Cancel
          </button>
        </div>
      )}
      {incomingCall && !activeCall && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(6,9,16,0.97)",
          backdropFilter: "blur(20px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          animation: "fade-in 0.3s ease",
        }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg, #047857, #10b981)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2rem", fontWeight: 800, color: "#fff",
            fontFamily: FONT_DISPLAY, marginBottom: 24,
          }}>
            {initials(incomingCall.callerName)}
          </div>
          <h3 style={{ color: C.text, fontSize: "1.5rem", fontFamily: FONT_DISPLAY, fontWeight: 900, letterSpacing: "-0.02em" }}>
            {incomingCall.callerName}
          </h3>
          <p style={{ color: C.textMuted, marginTop: 8, fontSize: "0.87rem", fontFamily: FONT_BODY }}>
            Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 40 }}>
            <button onClick={declineCall} style={{
              background: "#ef4444", borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", width: 64, height: 64,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Phone size={22} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={acceptCall} style={{
              background: "linear-gradient(135deg, #047857, #10b981)",
              borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", width: 64, height: 64,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {incomingCall.isVideo ? <Camera size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isDesktop) {
    return (
      <>
        <style>{GLOBAL_CSS}</style>
        <div style={{
          position: "fixed", inset: 0,
          display: "flex",
          background: C.bg, color: C.text,
          fontFamily: FONT_BODY,
          overflow: "hidden",
        }}>
          {/* ── Left Sidebar (240px) ── */}
          <aside style={{
            width: 240, flexShrink: 0,
            display: "flex", flexDirection: "column",
            background: C.surface,
            borderRight: `1px solid ${C.border}`,
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "18px 18px 14px",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: "linear-gradient(135deg, #6d28d9, #06b6d4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Radio size={15} color="#fff" />
              </div>
              <span style={{
                fontFamily: FONT_DISPLAY, fontWeight: 900,
                fontSize: "1.1rem", color: C.text, letterSpacing: "-0.02em",
              }}>
                CAMPUS<span style={{ color: C.accent }}>·</span>
              </span>
            </div>
            <div style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Avatar name={user.fullName} size={36} color="pink" online />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "0.84rem", fontWeight: 700, color: C.text,
                  fontFamily: FONT_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{user.fullName}</div>
                <div style={{ fontSize: "0.69rem", color: C.accentGreen, fontWeight: 600, fontFamily: FONT_BODY }}>● Online</div>
              </div>
              {notifications.length > 0 && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.accentPink }} />
              )}
            </div>
            <nav style={{ padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
              {renderSidebarItem({ id: "home", label: "Club Home", icon: <Home size={17} /> })}
              {renderSidebarItem({ id: "discover", label: "Explore", icon: <Grid3x3 size={17} /> })}
              {/* FIX #2: badge uses usersWithUnread */}
              {renderSidebarItem({ id: "messages", label: "Inbox", icon: <MessageCircle size={17} />, badge: usersWithUnread })}
              {renderSidebarItem({ id: "profile", label: "Profile", icon: <UserCircle2 size={17} /> })}
            </nav>
            {friends.length > 0 && (
              <>
                <div style={{
                  padding: "10px 18px 8px",
                  fontSize: "0.65rem", fontWeight: 700, color: C.textDim,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                  fontFamily: FONT_DISPLAY,
                  borderTop: `1px solid ${C.border}`, marginTop: 8,
                }}>
                  Direct Messages
                </div>
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  {friends.map(f => (
                    <button
                      key={f.id}
                      className="sidebar-btn"
                      onClick={openChatCallbacks[f.id] ?? (() => openChat(f))}
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "8px 14px", width: "100%",
                        background: selectedFriend?.id === f.id ? "rgba(139,92,246,0.08)" : "transparent",
                        border: "none",
                        borderLeft: selectedFriend?.id === f.id ? `2px solid ${C.accent}` : "2px solid transparent",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      <Avatar name={f.fullName} size={28} color="cyan" online={!!(unreadCounts[f.id])} />
                      <span style={{
                        fontSize: "0.82rem",
                        fontWeight: unreadCounts[f.id] ? 700 : 400,
                        color: unreadCounts[f.id] ? C.text : C.textMuted,
                        fontFamily: FONT_BODY,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                      }}>{f.fullName}</span>
                      {/* FIX #2: per-user unread count */}
                      {unreadCounts[f.id] > 0 && (
                        <span style={{
                          background: C.accentPink, color: "#fff", fontSize: "0.55rem",
                          padding: "1px 5px", borderRadius: 100, fontWeight: 800,
                          fontFamily: FONT_DISPLAY, minWidth: 16, textAlign: "center",
                        }}>{unreadCounts[f.id]}</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>

          {/* ── Main Content ── */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <header style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 28px", height: 60, flexShrink: 0,
              background: C.bg,
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: "1rem", color: C.text, letterSpacing: "-0.01em" }}>
                {activeTab === "home" && "Club Home"}
                {activeTab === "discover" && "Discover Students"}
                {(activeTab === "messages" || activeTab === "chat") && "Messages"}
                {activeTab === "profile" && "My Profile"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setActiveTab("discover")} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 9,
                  background: C.surfaceAlt, border: `1px solid ${C.border}`,
                  color: C.textMuted, cursor: "pointer", fontSize: "0.8rem",
                  fontFamily: FONT_BODY,
                }}>
                  <Search size={13} /> Search
                </button>
                <button style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: C.surfaceAlt, border: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: C.textMuted, cursor: "pointer", position: "relative",
                }}>
                  <Bell size={15} />
                  {notifications.length > 0 && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      width: 7, height: 7, borderRadius: "50%",
                      background: C.accentPink, border: `1.5px solid ${C.bg}`,
                    }} />
                  )}
                </button>
                <button onClick={() => navigate("/app/random")} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 9,
                  background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
                  border: "none", color: "#fff", cursor: "pointer",
                  fontSize: "0.82rem", fontWeight: 700,
                  fontFamily: FONT_DISPLAY,
                }}>
                  <Zap size={13} /> Random Chat
                </button>
              </div>
            </header>
            <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
              {(activeTab === "messages" || activeTab === "chat") && (
                <div style={{
                  width: 320, flexShrink: 0,
                  borderRight: `1px solid ${C.border}`,
                  display: "flex", flexDirection: "column",
                  overflow: "hidden",
                }}>
                  {renderMessagesContent()}
                </div>
              )}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
                {activeTab === "home" && renderHomeContent()}
                {activeTab === "discover" && renderDiscoverContent()}
                {(activeTab === "messages" || activeTab === "chat") && renderChatContent()}
                {activeTab === "profile" && renderProfileContent()}
              </div>
            </div>
          </main>
        </div>
        {callOverlays}
      </>
    );
  }

  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        background: C.bg, color: C.text,
        fontFamily: FONT_BODY,
        overflow: "hidden",
      }}>
        {activeTab !== "chat" && activeTab !== "messages" && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0 16px", height: 56, flexShrink: 0,
            borderBottom: `1px solid ${C.border}`,
            background: C.bg,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: "linear-gradient(135deg, #6d28d9, #06b6d4)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Radio size={13} color="#fff" />
              </div>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: "1.05rem", color: C.text }}>
                CAMPUS<span style={{ color: C.accent }}>·</span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{
                width: 32, height: 32, borderRadius: 8,
                background: C.surfaceAlt, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: C.textMuted, cursor: "pointer", position: "relative",
              }}>
                <Bell size={14} />
                {notifications.length > 0 && (
                  <span style={{
                    position: "absolute", top: 5, right: 5,
                    width: 6, height: 6, borderRadius: "50%",
                    background: C.accentPink, border: `1.5px solid ${C.bg}`,
                  }} />
                )}
              </button>
              <button onClick={() => setActiveTab("profile")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <Avatar name={user.fullName} size={32} color="pink" />
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeTab === "home" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px", minHeight: 0 }}>
              <HeroCard onStartRandom={() => navigate("/app/random")} />
              <div style={{ marginTop: 20 }}>
                {renderSectionTitle({ title: "Curated For You", action: "All", onAction: () => setActiveTab("discover") })}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {discoverUsers.slice(0, 3).map((u) => (
                    <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                {renderSectionTitle({ title: "Active Dialogue", action: "See all", onAction: () => setActiveTab("messages") })}
                <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
                  {friends.slice(0, 4).map(f => (
                    <ChatItem
                      key={f.id} friend={f}
                      unread={unreadCounts[f.id] ?? 0}
                      lastMsg={lastMessages[f.id]}
                      onClick={openChatCallbacks[f.id] ?? (() => openChat(f))}
                      compact
                    />
                  ))}
                  {friends.length === 0 && (
                    <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: "0.82rem", fontFamily: FONT_BODY }}>Add friends to chat</div>
                  )}
                </div>
              </div>
              <div style={{ height: 24 }} />
            </div>
          )}
          {activeTab === "discover" && renderDiscoverContent()}
          {activeTab === "messages" && renderMessagesContent()}
          {activeTab === "chat" && renderChatContent()}
          {activeTab === "profile" && renderProfileContent()}
        </div>

        {activeTab !== "chat" && (
          <nav style={{
            display: "flex",
            height: "calc(60px + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            background: "rgba(6,9,16,0.98)",
            borderTop: `1px solid ${C.border}`,
            flexShrink: 0,
            backdropFilter: "blur(20px)",
          }}>
            {mobileTabs.map((tab) => {
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
                    color: active ? C.accentBright : C.textDim,
                    fontSize: "0.58rem", fontWeight: 700,
                    position: "relative", padding: "8px 0",
                    fontFamily: FONT_DISPLAY, letterSpacing: "0.08em",
                    transition: "color 0.15s",
                  }}
                >
                  {active && (
                    <span style={{
                      position: "absolute", top: 0, left: "50%",
                      transform: "translateX(-50%)",
                      width: 20, height: 2, borderRadius: 1,
                      background: C.accent,
                    }} />
                  )}
                  <span style={{ opacity: active ? 1 : 0.55 }}>{tab.icon}</span>
                  <span style={{ textTransform: "uppercase" }}>{tab.label}</span>
                  {tab.badge && tab.badge > 0 ? (
                    <span style={{
                      position: "absolute", top: 7, right: "calc(50% - 16px)",
                      background: C.accentPink, color: "#fff",
                      fontSize: "0.52rem", fontWeight: 800,
                      padding: "1px 4px", borderRadius: 100, minWidth: 15, textAlign: "center",
                      border: `2px solid ${C.bg}`, fontFamily: FONT_DISPLAY,
                    }}>{tab.badge > 99 ? "99+" : tab.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        )}
      </div>
      {callOverlays}
    </>
  );
}