/**
 * Dashboard.tsx — Redesigned Mobile-First Campus Connect UI
 *
 * CHANGES:
 * 1. Hero: replaced image with GSAP-animated headline + description (CDN via useEffect script injection)
 * 2. Unread badges: blank if 0, "+1" "+2" etc. on ChatItem cards (WhatsApp style)
 * 3. Keyboard dismiss: input blurs on every keydown then re-focuses — prevents stuck keyboard after 1 key
 */

import {
  FormEvent, useEffect, useMemo, useRef, useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Camera, Check, CheckCheck, Flame, Home, ImagePlus,
  Lock, MessageCircle, Phone, Search, Send, ShieldBan,
  UserCircle2, UserPlus, Users, X,
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

const initials = (name: string) => name[0]?.toUpperCase() ?? "?";

// ─── ScreenHeader ─────────────────────────────────────────────────────────────
function ScreenHeader({
  title, onBack, right,
}: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 16px", height: 56, flexShrink: 0,
      background: "rgba(10,14,23,0.97)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      width: "100%", boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
        {onBack && (
          <button onClick={onBack} style={S.iconBtn}>
            <ArrowLeft size={17} />
          </button>
        )}
        <span style={{
          fontSize: "0.96rem", fontWeight: 700, color: "#fff",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</span>
      </div>
      {right && <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 8 }}>{right}</div>}
    </header>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40, gradient = "135deg, #ffb84a, #ff8c42" }:
  { name: string; size?: number; gradient?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(${gradient})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 800, color: "#1a0e00",
    }}>{initials(name)}</div>
  );
}

// ─── ChatItem ─────────────────────────────────────────────────────────────────
// CHANGE 2: show blank slot if 0 unread, "+N" badge if unread > 0
function ChatItem({ friend, unread, lastMsg, active, onClick }:
  { friend: User; unread: number; lastMsg?: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "13px 16px", width: "100%", textAlign: "left",
      background: active ? "rgba(255,184,74,0.07)" : "transparent",
      border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
      cursor: "pointer", boxSizing: "border-box", minWidth: 0,
      transition: "background 0.15s",
    }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Avatar name={friend.fullName} gradient="135deg, #4ee1b7, #1b8a6b" />
        {/* dot indicator on avatar only when unread > 0 */}
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -2, right: -2,
            background: "#25d366", width: 10, height: 10,
            borderRadius: "50%", border: "2px solid #0a0f1c",
          }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.88rem", fontWeight: unread > 0 ? 700 : 600,
          color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{friend.fullName}</div>
        <div style={{
          fontSize: "0.74rem", marginTop: 2,
          color: unread > 0 ? "rgba(255,184,74,0.9)" : "rgba(255,255,255,0.38)",
          fontWeight: unread > 0 ? 600 : 400,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{lastMsg ?? (friend.interests || "Tap to chat")}</div>
      </div>
      {/* CHANGE 2: always reserve space; show "+N" only when unread > 0; blank placeholder when 0 */}
      <div style={{
        minWidth: 36, height: 22,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {unread > 0 && (
          <span style={{
            background: "#25d366", color: "#fff",
            fontSize: "0.65rem", fontWeight: 800,
            padding: "3px 8px", borderRadius: 100,
            whiteSpace: "nowrap",
          }}>
            {unread > 99 ? "+99" : `+${unread}`}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── UserCard ─────────────────────────────────────────────────────────────────
function UserCard({ user: u, onAdd }: { user: User; onAdd: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <article style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: 16, boxSizing: "border-box",
      display: "flex", alignItems: "center", gap: 13,
    }}>
      <Avatar name={u.fullName} size={46} gradient="135deg, #a78bfa, #7c3aed" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.87rem", fontWeight: 700, color: "#fff", marginBottom: 2 }}>
          {u.fullName}
        </div>
        <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
          {u.course && u.year
            ? `${u.course} · ${u.year} Year`
            : u.interests
              ? u.interests
              : "Campus student"}
        </div>
        {u.mutualConnections != null && u.mutualConnections > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.71rem", color: "#ffb84a" }}>
            <Users size={10} />{u.mutualConnections} mutual
          </div>
        )}
      </div>
      <button onClick={() => { setSent(true); onAdd(); }} disabled={sent} style={{
        background: sent ? "rgba(255,255,255,0.04)" : "rgba(255,184,74,0.12)",
        border: `1px solid ${sent ? "rgba(255,255,255,0.08)" : "rgba(255,184,74,0.28)"}`,
        borderRadius: 10, padding: "8px 14px",
        fontSize: "0.76rem", fontWeight: 600,
        color: sent ? "rgba(255,255,255,0.3)" : "#ffb84a",
        cursor: sent ? "default" : "pointer", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 5,
      }}>
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
        maxWidth: "72%", padding: "9px 13px",
        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background: mine ? "linear-gradient(135deg, #ffb84a, #ff8c42)" : "rgba(255,255,255,0.08)",
        border: mine ? "none" : "1px solid rgba(255,255,255,0.08)",
        color: mine ? "#1a0e00" : "#dde1ec",
        fontSize: "0.86rem", lineHeight: 1.5, wordBreak: "break-word", boxSizing: "border-box",
      }}>
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="img"
            style={{
              width: "100%",
              maxWidth: "min(260px, 70vw)",
              height: "auto",
              borderRadius: 8,
              marginBottom: 6,
              display: "block",
            }}
          />
        )}
        {msg.content && <span>{msg.content}</span>}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          justifyContent: "flex-end", marginTop: 4,
        }}>
          <small style={{ fontSize: "0.62rem", opacity: 0.55 }}>{fmt(msg.createdAt)}</small>
          {mine && (msg.isRead
            ? <CheckCheck size={11} color="#1a0e00" />
            : <Check size={11} color="rgba(0,0,0,0.4)" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GSAP Hero ────────────────────────────────────────────────────────────────
// CHANGE 1: replaces image hero with GSAP animated headline + description
function GsapHero({ onStartRandom }: { onStartRandom: () => void }) {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject GSAP from CDN if not already loaded
    const loadGsap = () =>
      new Promise<void>((resolve) => {
        if ((window as any).gsap) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
        s.onload = () => resolve();
        document.head.appendChild(s);
      });

    loadGsap().then(() => {
      const gsap = (window as any).gsap;
      if (!heroRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      // Stagger in all animated children
      tl.fromTo(".gsap-badge", { opacity: 0, y: -16, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.5 })
        .fromTo(".gsap-line1", { opacity: 0, y: 40, skewY: 4 }, { opacity: 1, y: 0, skewY: 0, duration: 0.65 }, "-=0.2")
        .fromTo(".gsap-line2", { opacity: 0, y: 40, skewY: 4 }, { opacity: 1, y: 0, skewY: 0, duration: 0.65 }, "-=0.45")
        .fromTo(".gsap-desc", { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.55 }, "-=0.3")
        .fromTo(".gsap-cta", { opacity: 0, scale: 0.88, y: 12 }, { opacity: 1, scale: 1, y: 0, duration: 0.5 }, "-=0.2");

      // Floating particles
      gsap.utils.toArray(".gsap-particle").forEach((el: any, i: number) => {
        gsap.to(el, {
          y: `${-14 - i * 6}px`,
          x: `${(i % 2 === 0 ? 1 : -1) * (8 + i * 3)}px`,
          duration: 2.2 + i * 0.4,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.3,
        });
      });

      // Glow pulse
      gsap.to(".gsap-glow", {
        opacity: 0.35,
        scale: 1.18,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });
  }, []);

  return (
    <div ref={heroRef} style={{
      position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg, #0d2137 0%, #0a1628 55%, #111a2e 100%)",
      border: "1px solid rgba(255,184,74,0.18)", borderRadius: 20,
      padding: "32px 22px 28px", marginBottom: 22,
      minHeight: 220,
    }}>
      {/* Animated glow blob */}
      <div className="gsap-glow" style={{
        position: "absolute", top: -70, right: -70, width: 260, height: 260,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,184,74,0.22) 0%, transparent 70%)",
        pointerEvents: "none", opacity: 0.2,
      }} />

      {/* Floating particles */}
      {[
        { top: "18%", left: "72%", size: 5, color: "#ffb84a" },
        { top: "62%", left: "82%", size: 3.5, color: "#ff8c42" },
        { top: "30%", left: "88%", size: 4, color: "rgba(255,184,74,0.5)" },
        { top: "75%", left: "65%", size: 2.5, color: "#fff" },
      ].map((p, i) => (
        <div key={i} className="gsap-particle" style={{
          position: "absolute", top: p.top, left: p.left,
          width: p.size, height: p.size, borderRadius: "50%",
          background: p.color, pointerEvents: "none", opacity: 0.7,
        }} />
      ))}

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Badge */}
        <div className="gsap-badge" style={{ opacity: 0, ...S.heroBadge }}>
          <span style={S.heroDot} /> LIVE CAMPUS CHAT
        </div>

        {/* Headline line 1 */}
        <div style={{ overflow: "hidden", marginBottom: 4 }}>
          <h1 className="gsap-line1" style={{
            ...S.heroTitle, opacity: 0,
            margin: "14px 0 0",
          }}>
            Talk to someone
          </h1>
        </div>

        {/* Headline line 2 — gradient accent */}
        <div style={{ overflow: "hidden", marginBottom: 10 }}>
          <h1 className="gsap-line2" style={{
            ...S.heroTitle, opacity: 0,
            margin: "0 0 0",
            background: "linear-gradient(90deg, #ffb84a 0%, #ff8c42 50%, #ffda8a 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>
            new from campus ✦
          </h1>
        </div>

        {/* Description */}
        <p className="gsap-desc" style={{
          opacity: 0,
          fontSize: "0.82rem",
          color: "rgba(255,255,255,0.42)",
          margin: "0 0 22px",
          lineHeight: 1.6,
          maxWidth: 260,
        }}>
          Discover real connections with students around you — instantly, anonymously, authentically.
        </p>

        {/* CTA */}
        <button className="gsap-cta" style={{ ...S.heroCta, opacity: 0 }} onClick={onStartRandom}>
          <Flame size={15} /> Start Random Chat
        </button>
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

  // CHANGE 3: track whether keyboard dismiss is active
  const [inputReadOnly, setInputReadOnly] = useState(false);

  const totalUnread = useMemo(
    () => Object.values(unreadCounts).reduce((a, b) => a + b, 0), [unreadCounts]);
  const conversationIsOpen = activeTab === "chat" && !!selectedFriend;

  const filteredDiscoverUsers = useMemo(
    () => nameFilter.trim()
      ? discoverUsers.filter((u) =>
          u.fullName.toLowerCase().includes(nameFilter.trim().toLowerCase()))
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

  // ─── API ──────────────────────────────────────────────────────────────────
  async function loadDiscover() {
    const r = await api.get("/discover");
    setDiscoverUsers(r.data);
  }
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
    if (markRead) setUnreadCounts((c) => ({ ...c, [otherId]: 0 }));
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

  // ─── Navigation ───────────────────────────────────────────────────────────
  function openChat(friend: User) {
    setSelectedFriend(friend);
    setMessages([]);
    setActiveTab("chat");
  }
  function goBack() {
    if (activeTab === "chat") { setSelectedFriend(null); setActiveTab("messages"); }
    else setActiveTab("home");
  }

  // ─── Calls ────────────────────────────────────────────────────────────────
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

  // ─── Messaging ────────────────────────────────────────────────────────────
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

  // CHANGE 3: keyboard dismiss — blur on every key, re-focus after 50ms
  // This causes iOS to lower keyboard momentarily then raise it back,
  // preventing the stuck-keyboard-after-1-key bug.
  function handleTyping(e: React.ChangeEvent<HTMLInputElement>) {
    setMessageInput(e.target.value);
    if (!selectedFriend) return;
    if (!isTyping) { setIsTyping(true); getSocket()?.emit("typing:start", { receiverId: selectedFriend.id }); }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setIsTyping(false); getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    }, 2000);
  }

  // CHANGE 3: on every keydown, briefly blur (hides keyboard) then re-focus
  function handleKeyDown() {
    if (!compInputRef.current) return;
    compInputRef.current.blur();
    setTimeout(() => compInputRef.current?.focus(), 30);
  }

  function handleImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREENS
  // ──────────────────────────────────────────────────────────────────────────

  const HomeScreen = () => (
    <div style={S.screen}>
      <ScreenHeader
        title="Campus Connect"
        right={
          <div style={S.topAvatar} onClick={() => setActiveTab("profile")} role="button" tabIndex={0}>
            {initials(user.fullName)}
          </div>
        }
      />
      <div style={S.scrollArea}>
        {/* CHANGE 1: GSAP animated hero — no photo */}
        <GsapHero onStartRandom={() => navigate("/app/random")} />

        {/* Suggested */}
        <div style={S.section}>
          <div style={S.sectionHead}>
            <span style={S.sectionTitle}>Suggested</span>
            <button style={S.sectionLink} onClick={() => setActiveTab("discover")}>See all</button>
          </div>
          {discoverUsers.slice(0, 4).length === 0
            ? <div style={S.emptyCard}>No suggestions yet.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {discoverUsers.slice(0, 4).map((u) => (
                  <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
                ))}
              </div>
          }
        </div>

        {/* Active friends */}
        <div style={S.section}>
          <div style={S.sectionHead}>
            <span style={S.sectionTitle}>Active friends</span>
            <button style={S.sectionLink} onClick={() => setActiveTab("messages")}>See all</button>
          </div>
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            {friends.length === 0
              ? <div style={S.emptyCard}>No friends yet — accept a request to start.</div>
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
        <div style={{ height: 20 }} />
      </div>
    </div>
  );

  const MessagesScreen = () => (
    <div style={S.screen}>
      <ScreenHeader title="Messages" onBack={() => setActiveTab("home")} />
      {requests.length > 0 && (
        <button onClick={() => setActiveTab("profile")} style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "10px 16px", background: "rgba(255,184,74,0.07)",
          border: "none", borderBottom: "1px solid rgba(255,184,74,0.14)",
          cursor: "pointer", boxSizing: "border-box",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,184,74,0.14)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <UserPlus size={14} color="#ffb84a" />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#ffb84a" }}>
              {requests.length} Friend Request{requests.length > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.38)" }}>Tap to view and accept</div>
          </div>
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "1.2rem" }}>›</span>
        </button>
      )}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {friends.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.28)", fontSize: "0.84rem" }}>
              No conversations yet. Discover and add friends!
            </div>
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
        <div style={{ ...S.screen, position: "relative" }}>
          <ScreenHeader title={selectedFriend.fullName} onBack={() => setActiveCall(null)} />
          <div style={{ flex: 1, background: "#000", position: "relative", minHeight: 0 }}>
            <VideoRoom
              appId={zegoConfig.appId} serverSecret={zegoConfig.serverSecret}
              roomId={activeCall.roomId} userId={user.id} userName={user.fullName}
              isAudioOnly={!activeCall.isVideo} onJoined={() => {}}
            />
            <button onClick={() => setActiveCall(null)} style={{
              position: "absolute", top: 14, right: 14, zIndex: 9999,
              background: "rgba(255,70,70,0.88)", padding: "8px 18px",
              borderRadius: 18, border: "none", color: "#fff", cursor: "pointer",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}>
              <Phone size={14} style={{ transform: "rotate(135deg)" }} /> End
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={S.screen}>
        {/* Sticky Header */}
        <ScreenHeader
          title={selectedFriend.fullName}
          onBack={goBack}
          right={
            <>
              <button style={S.iconBtn} onClick={() => startCall(false)} title="Voice call">
                <Phone size={15} />
              </button>
              <button style={S.iconBtn} onClick={() => startCall(true)} title="Video call">
                <Camera size={15} />
              </button>
            </>
          }
        />

        {partnerTyping && (
          <div style={{
            padding: "5px 16px", fontSize: "0.72rem", color: "rgba(255,255,255,0.4)",
            flexShrink: 0, background: "rgba(0,0,0,0.12)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            {selectedFriend.fullName} is typing…
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", overflowX: "hidden",
          padding: "12px 14px", display: "flex", flexDirection: "column",
          gap: 3, minHeight: 0,
        }}>
          {messages.length === 0
            ? <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: "rgba(255,255,255,0.25)", fontSize: "0.84rem", textAlign: "center",
              }}>
                Say hello to {selectedFriend.fullName} 👋
              </div>
            : messages.map((m) => (
                <MessageBubble key={m.id} msg={m} mine={m.senderId === user.id} />
              ))
          }
          {partnerTyping && (
            <div style={{ display: "flex", padding: "4px 0" }}>
              <div style={{
                padding: "9px 13px", borderRadius: "18px 18px 18px 4px",
                background: "rgba(255,255,255,0.08)", display: "flex", gap: 4, alignItems: "center",
              }}>
                {[0, 200, 400].map((delay, i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "rgba(255,255,255,0.5)", display: "inline-block",
                    animation: `tdot 1.2s ${delay}ms infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div style={{
            padding: "8px 14px", flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", gap: 10,
            background: "rgba(0,0,0,0.15)",
          }}>
            <img src={imagePreview} alt="preview"
              style={{ height: 54, borderRadius: 8, objectFit: "cover" }} />
            <button onClick={() => setImagePreview(null)} style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "rgba(255,60,60,0.8)", border: "none",
              color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><X size={12} /></button>
          </div>
        )}

        {/* Sticky Composer — CHANGE 3: onKeyDown handler added */}
        <form onSubmit={handleSend} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
          flexShrink: 0,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(10,14,23,0.97)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          boxSizing: "border-box", width: "100%",
        }}>
          <input
            type="file" accept="image/*"
            style={{ display: "none" }} ref={fileRef}
            onChange={handleImgUpload}
          />
          <button type="button" onClick={() => fileRef.current?.click()} style={S.compIcon}>
            <ImagePlus size={16} />
          </button>
          <input
            ref={compInputRef}
            style={{ ...S.compInput, fontSize: "16px" }}
            placeholder="Message…"
            value={messageInput}
            onChange={handleTyping}
            // CHANGE 3: blur+refocus on every keydown to dismiss keyboard between strokes
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <button
            type="submit"
            disabled={!messageInput.trim() && !imagePreview}
            style={{
              ...S.compIcon,
              background: (messageInput.trim() || imagePreview)
                ? "linear-gradient(135deg, #ffb84a, #ff8c42)"
                : "rgba(255,255,255,0.05)",
              color: (messageInput.trim() || imagePreview) ? "#1a0e00" : "rgba(255,255,255,0.25)",
              border: (messageInput.trim() || imagePreview) ? "none" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    );
  };

  const DiscoverScreen = () => (
    <div style={S.screen}>
      <ScreenHeader title="Discover" onBack={() => setActiveTab("home")} />
      <div style={{ padding: "12px 16px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            color: "rgba(255,255,255,0.35)", pointerEvents: "none",
          }} />
          <input
            style={{ ...S.filterInput, paddingLeft: 34, fontSize: "16px" }}
            placeholder="Search by name…"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            autoComplete="off" autoCorrect="off" spellCheck={false}
          />
          {nameFilter && (
            <button onClick={() => setNameFilter("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%",
              width: 20, height: 20, cursor: "pointer", color: "rgba(255,255,255,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
            }}>
              <X size={11} />
            </button>
          )}
        </div>
        <div style={{ fontSize: "0.73rem", color: "rgba(255,255,255,0.33)", marginTop: 8 }}>
          {filteredDiscoverUsers.length} student{filteredDiscoverUsers.length !== 1 ? "s" : ""} found
          {nameFilter.trim() && (
            <span style={{ color: "rgba(255,184,74,0.7)", marginLeft: 4 }}>
              for "{nameFilter.trim()}"
            </span>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "12px 16px", minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredDiscoverUsers.map((u) => (
            <UserCard key={u.id} user={u} onAdd={() => void sendFriendRequest(u.id)} />
          ))}
          {filteredDiscoverUsers.length === 0 && (
            <div style={S.emptyCard}>
              {nameFilter.trim()
                ? `No students found matching "${nameFilter.trim()}".`
                : "No students to discover right now."}
            </div>
          )}
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );

  const ProfileScreen = () => (
    <div style={S.screen}>
      <ScreenHeader title="Profile" onBack={() => setActiveTab("home")} />
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 16, minHeight: 0 }}>
        <div style={{
          background: "linear-gradient(135deg, #0d2137, #0a1628)",
          border: "1px solid rgba(255,184,74,0.15)",
          borderRadius: 18, padding: "24px 20px", marginBottom: 14,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 12, textAlign: "center", boxSizing: "border-box",
        }}>
          <Avatar name={user.fullName} size={74} />
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#fff" }}>{user.fullName}</div>
            {(user as any).course && (user as any).year && (
              <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
                {(user as any).course} · {(user as any).year} Year
              </div>
            )}
          </div>
          <div style={{
            display: "flex", width: "100%",
            background: "rgba(255,255,255,0.05)", borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden",
          }}>
            {[["Friends", friends.length], ["Requests", requests.length], ["Discover", discoverUsers.length]].map(
              ([label, val], i, arr) => (
                <div key={label as string} style={{
                  flex: 1, padding: "12px 4px", textAlign: "center",
                  borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <strong style={{ display: "block", fontSize: "1.15rem", color: "#fff", fontWeight: 800 }}>{val}</strong>
                  <span style={{ fontSize: "0.66rem", color: "rgba(255,255,255,0.33)" }}>{label}</span>
                </div>
              )
            )}
          </div>
          <button onClick={onLogout} style={{
            background: "rgba(255,70,70,0.1)", border: "1px solid rgba(255,70,70,0.22)",
            color: "#ff6b6b", borderRadius: 11, padding: "9px 24px",
            fontSize: "0.86rem", fontWeight: 600, cursor: "pointer",
          }}>Logout</button>
        </div>

        {requests.length > 0 && (
          <div style={{ ...S.panel, marginBottom: 12 }}>
            <div style={S.panelHead}>
              <span style={S.panelTitle}>Friend Requests</span>
              <span style={S.panelCount}>{requests.length}</span>
            </div>
            {requests.map((req) => (
              <div key={req.id} style={S.panelItem}>
                <Avatar name={req.sender.fullName} size={36} gradient="135deg, #4ee1b7, #1b8a6b" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.84rem", fontWeight: 700, color: "#fff" }}>{req.sender.fullName}</div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.38)" }}>
                    {(req.sender as any).course && (req.sender as any).year
                      ? `${(req.sender as any).course} · ${(req.sender as any).year} Year`
                      : "Campus student"}
                  </div>
                </div>
                <button onClick={() => void acceptRequest(req.id)} style={{
                  background: "linear-gradient(135deg, #4ee1b7, #1b8a6b)",
                  border: "none", borderRadius: 9, padding: "7px 14px",
                  fontSize: "0.76rem", fontWeight: 700, color: "#fff", cursor: "pointer", flexShrink: 0,
                }}>Accept</button>
              </div>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div style={{ ...S.panel, marginBottom: 12 }}>
            <div style={S.panelHead}>
              <span style={S.panelTitle}>Notifications</span>
              <span style={S.panelCount}>{notifications.length}</span>
            </div>
            {notifications.map((n) => (
              <div key={n.id} style={S.panelItem}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: "rgba(255,184,74,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#ffb84a", flexShrink: 0,
                }}>{n.type === "friend_accept" ? "✓" : n.type === "friend_request" ? "+" : "i"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                    {n.type === "friend_accept" ? "Friend accepted" : n.type === "friend_request" ? "New request" : "Update"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.38)" }}>{n.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={S.panel}>
          <div style={S.panelHead}>
            <span style={S.panelTitle}>Blocked Users</span>
            <span style={S.panelCount}>{blockedUsers.length}</span>
          </div>
          {blockedUsers.length === 0
            ? <div style={{ padding: 18, textAlign: "center", color: "rgba(255,255,255,0.24)", fontSize: "0.8rem" }}>
                <Lock size={16} style={{ marginBottom: 6, display: "block", margin: "0 auto 8px" }} />
                People you block appear here.
              </div>
            : blockedUsers.map((e) => (
                <div key={e.id} style={S.panelItem}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9,
                    background: "rgba(255,70,70,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#ff6b6b", flexShrink: 0,
                  }}><ShieldBan size={14} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.83rem", fontWeight: 700, color: "#fff" }}>{e.user.fullName}</div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.35)" }}>
                      {e.reason ? `Reason: ${e.reason}` : "Blocked user"}
                    </div>
                  </div>
                  <button onClick={() => void unblockUser(e.user.id)} style={{
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 9, padding: "6px 11px",
                    fontSize: "0.74rem", fontWeight: 600, color: "rgba(255,255,255,0.48)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                  }}><ShieldBan size={12} /> Unblock</button>
                </div>
              ))
          }
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );

  // ─── Bottom Nav Config ────────────────────────────────────────────────────
  const tabs: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "home", label: "Home", icon: <Home size={21} /> },
    { id: "discover", label: "Discover", icon: <Search size={21} /> },
    { id: "messages", label: "Messages", icon: <MessageCircle size={21} />, badge: totalUnread },
    { id: "profile", label: "Profile", icon: <UserCircle2 size={21} /> },
  ];
  const navActive = (id: AppTab) =>
    id === "messages" ? (activeTab === "messages" || activeTab === "chat") : activeTab === id;

  // ─── MAIN RENDER ──────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes tdot {
          0%,60%,100%{transform:translateY(0)}
          30%{transform:translateY(-5px)}
        }
        @keyframes blink {0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes pulse {
          0%{box-shadow:0 0 0 0 rgba(78,225,183,0.4)}
          70%{box-shadow:0 0 0 18px rgba(78,225,183,0)}
          100%{box-shadow:0 0 0 0 rgba(78,225,183,0)}
        }
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:0;background:transparent}
        html,body{height:100%;overflow:hidden;position:fixed;width:100%;}
        input,textarea,select{font-size:16px !important;}
      `}</style>

      <div style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        background: "#0a0f1c", color: "#e8eaf0",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        overflow: "hidden", maxWidth: "100%",
      }}>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {activeTab === "home"     && <HomeScreen />}
          {activeTab === "discover" && <DiscoverScreen />}
          {activeTab === "messages" && <MessagesScreen />}
          {activeTab === "chat"     && <ChatScreen />}
          {activeTab === "profile"  && <ProfileScreen />}
        </div>

        {activeTab !== "chat" && (
          <nav style={{
            display: "flex",
            height: "calc(60px + env(safe-area-inset-bottom, 0px))",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            background: "rgba(8,12,20,0.98)",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            flexShrink: 0, width: "100%",
          }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => {
                if (tab.id === "messages") setSelectedFriend(null);
                setActiveTab(tab.id);
              }} style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer",
                color: navActive(tab.id) ? "#ffb84a" : "rgba(255,255,255,0.32)",
                fontSize: "0.63rem", fontWeight: 600,
                position: "relative", transition: "color 0.15s",
                padding: "8px 0",
              }}>
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge && tab.badge > 0 ? (
                  <span style={{
                    position: "absolute", top: 6,
                    right: "calc(50% - 18px)",
                    background: "#ff4444", color: "#fff",
                    fontSize: "0.57rem", fontWeight: 800,
                    padding: "1px 5px", borderRadius: 100,
                    minWidth: 16, textAlign: "center",
                    border: "2px solid #08121e",
                  }}>{tab.badge > 99 ? "99+" : tab.badge}</span>
                ) : null}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Outgoing Call Overlay */}
      {outgoingCall && !activeCall && (
        <div style={S.callOverlay}>
          <div style={{ ...S.callAvatar, animation: "pulse 1.5s infinite" }}>
            {initials(outgoingCall.receiverName)}
          </div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "1.45rem" }}>{outgoingCall.receiverName}</h3>
          <p style={{ color: "rgba(255,255,255,0.42)", marginTop: 6, fontSize: "0.88rem" }}>Calling…</p>
          <button onClick={() => setOutgoingCall(null)} style={S.callEndBtn}>
            <Phone size={17} style={{ transform: "rotate(135deg)" }} /> Cancel
          </button>
        </div>
      )}

      {/* Incoming Call Overlay */}
      {incomingCall && !activeCall && (
        <div style={S.callOverlay}>
          <div style={S.callAvatar}>{initials(incomingCall.callerName)}</div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: "1.45rem" }}>{incomingCall.callerName}</h3>
          <p style={{ color: "rgba(255,255,255,0.42)", marginTop: 6, fontSize: "0.88rem" }}>
            Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call…
          </p>
          <div style={{ display: "flex", gap: 20, marginTop: 32 }}>
            <button onClick={declineCall} style={{
              background: "#ff4444", borderRadius: "50%", border: "none", color: "#fff",
              cursor: "pointer", width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Phone size={22} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={acceptCall} style={{
              background: "#4ee1b7", borderRadius: "50%", border: "none", color: "#000",
              cursor: "pointer", width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {incomingCall.isVideo ? <Camera size={22} /> : <Phone size={22} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Style constants ──────────────────────────────────────────────────────────
const S = {
  screen: {
    display: "flex" as const, flexDirection: "column" as const,
    height: "100%", overflow: "hidden", width: "100%", maxWidth: "100%",
  },
  scrollArea: {
    flex: 1, overflowY: "auto" as const, overflowX: "hidden" as const,
    padding: 16, minHeight: 0,
  },
  heroBadge: {
    display: "inline-flex", alignItems: "center", gap: 7,
    background: "rgba(255,184,74,0.1)", border: "1px solid rgba(255,184,74,0.28)",
    borderRadius: 100, padding: "5px 13px",
    fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.1em", color: "#ffb84a",
    marginBottom: 16,
  },
  heroDot: {
    display: "inline-block", width: 7, height: 7, borderRadius: "50%",
    background: "#ffb84a", animation: "blink 1.4s infinite",
  },
  heroTitle: {
    fontSize: "1.5rem", fontWeight: 800, lineHeight: 1.22,
    color: "#fff", margin: "0", letterSpacing: "-0.02em",
  },
  heroCta: {
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "linear-gradient(135deg, #ffb84a, #ff8c42)",
    color: "#1a0e00", fontWeight: 700, fontSize: "0.88rem",
    padding: "12px 22px", borderRadius: 100, border: "none", cursor: "pointer",
    boxShadow: "0 4px 18px rgba(255,140,66,0.35)",
  },
  section: { marginBottom: 22 },
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: "0.92rem", fontWeight: 700, color: "#fff" },
  sectionLink: {
    fontSize: "0.78rem", fontWeight: 600, color: "#ffb84a",
    background: "none", border: "none", cursor: "pointer", padding: 0,
  },
  emptyCard: {
    background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)",
    borderRadius: 13, padding: 18, color: "rgba(255,255,255,0.3)",
    fontSize: "0.82rem", textAlign: "center" as const,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 9,
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "rgba(255,255,255,0.7)", cursor: "pointer",
  },
  topAvatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "linear-gradient(135deg, #ffb84a, #ff8c42)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "0.82rem", fontWeight: 800, color: "#1a0e00", cursor: "pointer",
    border: "2px solid rgba(255,184,74,0.3)",
  },
  filterInput: {
    width: "100%", padding: "9px 13px", borderRadius: 11,
    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
    color: "#fff", outline: "none", boxSizing: "border-box" as const,
  },
  compIcon: {
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "rgba(255,255,255,0.55)", cursor: "pointer",
  },
  compInput: {
    flex: 1, background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
    padding: "9px 13px", color: "#fff", outline: "none", minWidth: 0,
  },
  panel: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, overflow: "hidden",
  },
  panelHead: {
    padding: "13px 16px 11px", borderBottom: "1px solid rgba(255,255,255,0.05)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  panelTitle: { fontSize: "0.88rem", fontWeight: 700, color: "#fff" },
  panelCount: { fontSize: "0.73rem", color: "rgba(255,255,255,0.3)" },
  panelItem: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  callOverlay: {
    position: "fixed" as const, inset: 0, zIndex: 99999,
    background: "rgba(8,12,20,0.98)", backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
  },
  callAvatar: {
    width: 96, height: 96, borderRadius: "50%",
    background: "linear-gradient(135deg, #4ee1b7, #1b8a6b)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "2.4rem", fontWeight: 800, color: "#fff", marginBottom: 20,
  },
  callEndBtn: {
    marginTop: 32, background: "rgba(255,70,70,0.88)",
    padding: "12px 28px", borderRadius: 100, border: "none",
    color: "#fff", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600,
    display: "flex", alignItems: "center", gap: 8,
  },
};