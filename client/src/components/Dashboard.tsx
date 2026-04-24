import type { CSSProperties, ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Crown,
  Flame,
  GraduationCap,
  Home,
  ImagePlus,
  Info,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldBan,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import {
  AppNotification,
  BlockedUserEntry,
  FriendRequest,
  Message,
  User,
} from "../types";
import { VideoRoom } from "./VideoRoom";

type DashboardProps = { token: string; user: User; onLogout: () => void };
type AppTab = "home" | "discover" | "messages" | "chat" | "profile";
type UserTag = "All Majors" | "Architecture" | "Design" | "Technology";

const phoneFrameStyle: CSSProperties = {
  width: "100%",
  maxWidth: 392,
  height: "min(844px, 100dvh - 24px)",
  borderRadius: 38,
  background:
    "linear-gradient(180deg, rgba(20,20,24,0.98) 0%, rgba(11,11,14,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.09)",
  boxShadow:
    "0 38px 90px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.05)",
  overflow: "hidden",
  position: "relative",
  display: "flex",
  flexDirection: "column",
};

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRoomId(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `call-${x}-${y}`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getSubtitle(person: User) {
  if (person.course && person.year) return `${person.course} · ${person.year}`;
  if (person.interests) return person.interests;
  return "Campus member";
}

function getTag(person: User): UserTag {
  const source = `${person.course ?? ""} ${person.interests ?? ""}`.toLowerCase();
  if (source.includes("arch")) return "Architecture";
  if (source.includes("design") || source.includes("art")) return "Design";
  if (
    source.includes("computer") ||
    source.includes("tech") ||
    source.includes("software") ||
    source.includes("coding")
  ) {
    return "Technology";
  }
  return "All Majors";
}

function getAvatarTone(seed: string) {
  const tones = [
    "linear-gradient(135deg, #26272d 0%, #3a3b46 100%)",
    "linear-gradient(135deg, #2b203a 0%, #4d2f7f 100%)",
    "linear-gradient(135deg, #252833 0%, #4a5368 100%)",
    "linear-gradient(135deg, #2f2323 0%, #6c4040 100%)",
  ];
  const index = seed.length % tones.length;
  return tones[index];
}

function getHeroImage(index: number) {
  const images = [
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
  ];
  return images[index % images.length];
}

function Screen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}

function TopBar({
  user,
  onAvatarClick,
  showBack,
  onBack,
  title,
  subtitle,
}: {
  user: User;
  onAvatarClick: () => void;
  showBack?: boolean;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
}) {
  return (
    <header
      style={{
        padding: "18px 18px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {showBack ? (
          <button onClick={onBack} style={styles.roundIcon}>
            <ArrowLeft size={16} />
          </button>
        ) : (
          <div
            style={{
              fontSize: "1.72rem",
              fontWeight: 800,
              letterSpacing: "-0.06em",
              color: "#f5f5f7",
              whiteSpace: "nowrap",
            }}
          >
            CAMPUS <span style={{ color: "#a678ff" }}>•</span>
          </div>
        )}
        {title && (
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "#f5f5f7",
                letterSpacing: "-0.03em",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: "0.72rem",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  color: "#a678ff",
                  textTransform: "uppercase",
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        )}
      </div>

      <button onClick={onAvatarClick} style={styles.avatarChip}>
        {getInitials(user.fullName)}
      </button>
    </header>
  );
}

function MemberAvatar({
  name,
  size = 44,
  dot,
}: {
  name: string;
  size?: number;
  dot?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: getAvatarTone(name),
          color: "#f5f5f7",
          fontWeight: 700,
          fontSize: size * 0.35,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {getInitials(name)}
      </div>
      {dot && (
        <span
          style={{
            position: "absolute",
            right: 1,
            bottom: 1,
            width: Math.max(10, size * 0.23),
            height: Math.max(10, size * 0.23),
            borderRadius: "50%",
            background: "#23d968",
            border: "2px solid #121216",
          }}
        />
      )}
    </div>
  );
}

function MemberCard({
  person,
  action,
}: {
  person: User;
  action?: React.ReactNode;
}) {
  return (
    <article
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <MemberAvatar name={person.fullName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#f6f6f8",
            fontWeight: 700,
            fontSize: "0.98rem",
            letterSpacing: "-0.02em",
            marginBottom: 3,
          }}
        >
          {person.fullName}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.42)",
            fontSize: "0.8rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {getSubtitle(person)}
        </div>
      </div>
      {action}
    </article>
  );
}

function ChatBubble({
  msg,
  mine,
}: {
  msg: Message;
  mine: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "82%",
          padding: msg.imageUrl ? "10px" : "14px 16px",
          borderRadius: mine ? "22px 22px 8px 22px" : "22px 22px 22px 8px",
          background: mine
            ? "linear-gradient(135deg, #b187ff 0%, #9c74ff 100%)"
            : "rgba(255,255,255,0.06)",
          color: mine ? "#17131f" : "#f0f0f3",
          boxShadow: mine
            ? "0 14px 30px rgba(166,120,255,0.22)"
            : "inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="attachment"
            style={{
              width: "100%",
              maxWidth: 250,
              borderRadius: 14,
              display: "block",
              marginBottom: msg.content ? 10 : 0,
            }}
          />
        )}
        {msg.content && (
          <div style={{ fontSize: "0.96rem", lineHeight: 1.55 }}>{msg.content}</div>
        )}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 4,
            fontSize: "0.68rem",
            opacity: 0.68,
          }}
        >
          <span>{fmtTime(msg.createdAt)}</span>
          {mine ? (
            msg.isRead ? (
              <CheckCheck size={12} />
            ) : (
              <Check size={12} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  const [zegoConfig, setZegoConfig] = useState<{ appId: number; serverSecret: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ roomId: string; isVideo: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callerId: string;
    callerName: string;
    isVideo: boolean;
    roomId: string;
  } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    roomId: string;
    isVideo: boolean;
    receiverName: string;
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
  const [majorFilter, setMajorFilter] = useState<UserTag>("All Majors");

  const usersWithUnread = useMemo(
    () => Object.values(unreadCounts).filter((count) => count > 0).length,
    [unreadCounts]
  );

  const conversationIsOpen = activeTab === "chat" && !!selectedFriend;

  const filteredDiscoverUsers = useMemo(() => {
    const query = nameFilter.trim().toLowerCase();
    return discoverUsers.filter((person) => {
      const matchesText =
        !query ||
        person.fullName.toLowerCase().includes(query) ||
        (person.course ?? "").toLowerCase().includes(query);
      const matchesMajor =
        majorFilter === "All Majors" || getTag(person) === majorFilter;
      return matchesText && matchesMajor;
    });
  }, [discoverUsers, majorFilter, nameFilter]);

  const recommendedMembers = useMemo(
    () => filteredDiscoverUsers.slice(0, 6),
    [filteredDiscoverUsers]
  );

  const heroMembers = useMemo(() => {
    const picks = discoverUsers.slice(0, 2);
    return picks.length ? picks : friends.slice(0, 2);
  }, [discoverUsers, friends]);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (msg: Message) => {
      setMessages((current) => (current.some((item) => item.id === msg.id) ? current : [...current, msg]));
      const otherId = msg.senderId === user.id ? msg.receiverId : msg.senderId;
      if (msg.content) {
        setLastMessages((current) => ({ ...current, [otherId]: msg.content ?? "" }));
      }

      if (
        selectedFriend?.id === msg.senderId &&
        conversationIsOpen &&
        document.visibilityState === "visible"
      ) {
        socket.emit("message:read", { messageIds: [msg.id], senderId: msg.senderId });
        setUnreadCounts((current) => ({ ...current, [msg.senderId]: 0 }));
      } else if (msg.senderId !== user.id) {
        setUnreadCounts((current) => ({
          ...current,
          [msg.senderId]: Math.min((current[msg.senderId] ?? 0) + 1, 99),
        }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[] }) => {
      setMessages((current) =>
        current.map((item) =>
          messageIds.includes(item.id) ? { ...item, isRead: true } : item
        )
      );
    });

    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(true);
    });

    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriend?.id === typerId) setPartnerTyping(false);
    });

    socket.on("call:incoming", (payload: typeof incomingCall) => setIncomingCall(payload));

    socket.on("call:accepted", ({ roomId }: { roomId: string }) => {
      setOutgoingCall((current) => {
        if (current?.roomId === roomId) {
          setActiveCall({ roomId, isVideo: current.isVideo });
          return null;
        }
        return current;
      });
    });

    socket.on("call:declined", () => setOutgoingCall(null));

    socket.on("notification:new", (notice: AppNotification) => {
      setNotifications((current) => [notice, ...current].slice(0, 20));
      void Promise.all([loadFriends(), loadRequests()]);
    });

    return () => {
      [
        "message:new",
        "message:read:update",
        "typing:started",
        "typing:stopped",
        "call:incoming",
        "call:accepted",
        "call:declined",
        "notification:new",
      ].forEach((event) => socket.off(event));
      disconnectSocket();
    };
  }, [conversationIsOpen, selectedFriend?.id, token, user.id]);

  useEffect(() => {
    void Promise.all([
      loadDiscover(),
      loadFriends(),
      loadRequests(),
      loadBlockedUsers(),
      api.get("/zego-config").then((response) => setZegoConfig(response.data)),
    ]);
  }, []);

  useEffect(() => {
    if (!selectedFriend) return;
    getSocket()?.emit("join:conversation", { otherUserId: selectedFriend.id });
    void loadConversation(
      selectedFriend.id,
      conversationIsOpen && document.visibilityState === "visible"
    );
  }, [conversationIsOpen, selectedFriend?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partnerTyping]);

  useEffect(() => {
    if (activeTab === "chat") {
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [activeTab, selectedFriend?.id]);

  async function loadDiscover() {
    const response = await api.get("/discover");
    setDiscoverUsers(response.data);
  }

  async function loadFriends() {
    const response = await api.get("/friends");
    setFriends(response.data);
  }

  async function loadRequests() {
    const response = await api.get("/friend-requests");
    setRequests(response.data);
  }

  async function loadBlockedUsers() {
    const response = await api.get("/blocked-users");
    setBlockedUsers(response.data);
  }

  async function loadConversation(otherId: string, markRead = false) {
    const response = await api.get(`/messages/${otherId}`);
    const nextMessages: Message[] = response.data.messages;
    setMessages(nextMessages);
    const last = nextMessages[nextMessages.length - 1];
    if (last?.content) {
      setLastMessages((current) => ({ ...current, [otherId]: last.content ?? "" }));
    }
    const unread = nextMessages
      .filter((item) => item.senderId === otherId && !item.isRead)
      .map((item) => item.id);
    if (markRead && unread.length) {
      getSocket()?.emit("message:read", { messageIds: unread, senderId: otherId });
      setMessages((current) =>
        current.map((item) =>
          unread.includes(item.id) ? { ...item, isRead: true } : item
        )
      );
    }
    setUnreadCounts((current) => ({ ...current, [otherId]: 0 }));
  }

  async function sendFriendRequest(id: string) {
    await api.post("/friend-requests", { receiverId: id });
    void loadDiscover();
  }

  async function acceptRequest(id: string) {
    await api.post(`/friend-requests/${id}/accept`);
    await Promise.all([loadFriends(), loadRequests()]);
  }

  async function unblockUser(userId: string) {
    await api.delete(`/users/${userId}/block`);
    await Promise.all([loadBlockedUsers(), loadDiscover(), loadFriends(), loadRequests()]);
  }

  function openChat(friend: User) {
    setSelectedFriend(friend);
    setMessages([]);
    setActiveTab("chat");
  }

  function goBack() {
    if (activeTab === "chat") {
      setSelectedFriend(null);
      setActiveTab("messages");
      return;
    }
    setActiveTab("home");
  }

  function startCall(isVideo: boolean) {
    if (!selectedFriend) return;
    const roomId = getRoomId(user.id, selectedFriend.id);
    setOutgoingCall({ roomId, isVideo, receiverName: selectedFriend.fullName });
    getSocket()?.emit("call:initiate", {
      receiverId: selectedFriend.id,
      isVideo,
      roomId,
    });
  }

  function acceptCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:accept", {
      callerId: incomingCall.callerId,
      roomId: incomingCall.roomId,
    });
    const friend = friends.find((item) => item.id === incomingCall.callerId);
    if (friend) openChat(friend);
    setActiveCall({ roomId: incomingCall.roomId, isVideo: incomingCall.isVideo });
    setIncomingCall(null);
  }

  function declineCall() {
    if (!incomingCall) return;
    getSocket()?.emit("call:decline", { callerId: incomingCall.callerId });
    setIncomingCall(null);
  }

  function handleTyping(event: ChangeEvent<HTMLInputElement>) {
    setMessageInput(event.target.value);
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

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedFriend || (!messageInput.trim() && !imagePreview)) return;
    getSocket()?.emit("message:send", {
      receiverId: selectedFriend.id,
      content: messageInput.trim(),
      imageUrl: imagePreview,
    });
    getSocket()?.emit("typing:stop", { receiverId: selectedFriend.id });
    setMessageInput("");
    setImagePreview(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  const vibeCount = `${(friends.length * 1.4 + discoverUsers.length * 0.6 + 3).toFixed(1)}k`;
  const onlineCount = Math.max(12, discoverUsers.length + friends.length * 2 + 7);

  const tabs: { id: AppTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "home", label: "Club", icon: <Home size={18} /> },
    { id: "discover", label: "Explore", icon: <Search size={18} /> },
    { id: "messages", label: "Inbox", icon: <Mail size={18} />, badge: usersWithUnread },
    { id: "profile", label: "Elite", icon: <Crown size={18} /> },
  ];

  function renderHome() {
    return (
      <Screen>
        <TopBar user={user} onAvatarClick={() => setActiveTab("profile")} />

        <div style={styles.scrollArea}>
          <section style={styles.heroCard}>
            <div style={styles.heroBadge}>• CONNECT INSTANTLY</div>
            <h1 style={styles.heroTitle}>
              Experience the
              <br />
              <span style={{ fontWeight: 800 }}>Unseen Connection.</span>
            </h1>
            <button style={styles.primaryButton} onClick={() => navigate("/app/random")}>
              <Flame size={16} />
              START RANDOM CHAT
            </button>
          </section>

          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionLabel}>CURATED FOR YOU</span>
              <button style={styles.linkButton} onClick={() => setActiveTab("discover")}>
                Discover all
              </button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {recommendedMembers.length ? (
                recommendedMembers.slice(0, 3).map((person) => (
                  <MemberCard
                    key={person.id}
                    person={person}
                    action={
                      <button
                        onClick={() => void sendFriendRequest(person.id)}
                        style={styles.memberAction}
                      >
                        <UserPlus size={16} />
                      </button>
                    }
                  />
                ))
              ) : (
                <div style={styles.emptyPanel}>No recommendations right now.</div>
              )}
            </div>
          </section>

          <section style={styles.sectionBlock}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionLabel}>ACTIVE DIALOGUE</span>
              <span style={styles.onlineLabel}>{Math.max(4, friends.length)} ONLINE</span>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {friends.length ? (
                friends.slice(0, 3).map((friend) => (
                  <MemberCard
                    key={friend.id}
                    person={friend}
                    action={
                      <button
                        onClick={() => openChat(friend)}
                        style={styles.memberActionSecondary}
                      >
                        <MessageCircle size={16} />
                      </button>
                    }
                  />
                ))
              ) : (
                <div style={styles.emptyPanel}>
                  Your inbox will show up here after you add someone from Explore.
                </div>
              )}
            </div>
          </section>

          <section style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {heroMembers.map((person, index) => (
              <article key={person.id} style={styles.photoCard}>
                <img
                  src={getHeroImage(index)}
                  alt={person.fullName}
                  style={styles.photoImage}
                />
                <div style={styles.photoMetaLeft}>
                  {person.fullName.split(" ")[0]},{person.year?.replace("Year", "") ?? "21"}
                </div>
                {index === 1 && <div style={styles.photoMetaRight}>You</div>}
              </article>
            ))}
          </section>
        </div>
      </Screen>
    );
  }

  function renderDiscover() {
    const filters: UserTag[] = ["All Majors", "Architecture", "Design", "Technology"];

    return (
      <Screen>
        <TopBar
          user={user}
          onAvatarClick={() => setActiveTab("profile")}
          showBack
          onBack={() => setActiveTab("home")}
          title="Discover"
          subtitle="Verified Members"
        />

        <div style={styles.scrollArea}>
          <div style={styles.searchWrap}>
            <Search size={16} style={styles.searchIcon} />
            <input
              value={nameFilter}
              onChange={(event) => setNameFilter(event.target.value)}
              placeholder="Search by major or year..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.filterRow}>
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setMajorFilter(filter)}
                style={{
                  ...styles.filterChip,
                  ...(majorFilter === filter ? styles.filterChipActive : {}),
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>RECOMMENDED</span>
            <span style={styles.onlineLabel}>{onlineCount} ONLINE</span>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {recommendedMembers.length ? (
              recommendedMembers.map((person) => (
                <MemberCard
                  key={person.id}
                  person={person}
                  action={
                    <button
                      onClick={() => void sendFriendRequest(person.id)}
                      style={styles.memberActionSecondary}
                    >
                      <UserPlus size={16} />
                    </button>
                  }
                />
              ))
            ) : (
              <div style={styles.emptyPanel}>No matching members found.</div>
            )}
          </div>
        </div>
      </Screen>
    );
  }

  function renderMessages() {
    return (
      <Screen>
        <TopBar
          user={user}
          onAvatarClick={() => setActiveTab("profile")}
          showBack
          onBack={() => setActiveTab("home")}
          title="Inbox"
          subtitle="Private Dialogue"
        />

        <div style={styles.scrollArea}>
          {requests.length > 0 && (
            <div style={styles.noticeCard}>
              <div style={styles.noticeIcon}>
                <Users size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={styles.noticeTitle}>
                  {requests.length} pending request{requests.length > 1 ? "s" : ""}
                </div>
                <div style={styles.noticeText}>Open Elite to review and accept them.</div>
              </div>
            </div>
          )}

          {friends.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => openChat(friend)}
                  style={styles.threadCard}
                >
                  <MemberAvatar name={friend.fullName} dot={(unreadCounts[friend.id] ?? 0) > 0} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div style={styles.threadHead}>
                      <strong>{friend.fullName}</strong>
                      <small>{lastMessages[friend.id] ? "now" : "today"}</small>
                    </div>
                    <div style={styles.threadText}>
                      {lastMessages[friend.id] ?? getSubtitle(friend)}
                    </div>
                  </div>
                  {(unreadCounts[friend.id] ?? 0) > 0 && (
                    <div style={styles.unreadBadge}>
                      {unreadCounts[friend.id] > 99 ? "99+" : unreadCounts[friend.id]}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div style={styles.emptyPanel}>
              No conversations yet. Add someone from Explore to start chatting.
            </div>
          )}
        </div>
      </Screen>
    );
  }

  function renderChat() {
    if (!selectedFriend) return null;

    if (activeCall && zegoConfig) {
      return (
        <Screen>
          <TopBar
            user={user}
            onAvatarClick={() => setActiveTab("profile")}
            showBack
            onBack={() => setActiveCall(null)}
            title={selectedFriend.fullName}
            subtitle={activeCall.isVideo ? "Video Session" : "Voice Session"}
          />

          <div style={{ flex: 1, minHeight: 0, background: "#000", position: "relative" }}>
            <VideoRoom
              appId={zegoConfig.appId}
              serverSecret={zegoConfig.serverSecret}
              roomId={activeCall.roomId}
              userId={user.id}
              userName={user.fullName}
              isAudioOnly={!activeCall.isVideo}
              onJoined={() => {}}
            />
            <button onClick={() => setActiveCall(null)} style={styles.endCallButton}>
              <Phone size={14} style={{ transform: "rotate(135deg)" }} />
              End session
            </button>
          </div>
        </Screen>
      );
    }

    return (
      <Screen>
        <header style={styles.chatHeader}>
          <button onClick={goBack} style={styles.plainIcon}>
            <ArrowLeft size={17} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
            <MemberAvatar name={selectedFriend.fullName} size={38} dot />
            <div style={{ minWidth: 0 }}>
              <div style={styles.chatName}>{selectedFriend.fullName}</div>
              <div style={styles.chatStatus}>• ONLINE</div>
            </div>
          </div>
          <button onClick={() => startCall(false)} style={styles.plainIcon}>
            <Phone size={16} />
          </button>
          <button onClick={() => startCall(true)} style={styles.plainIcon}>
            <Camera size={16} />
          </button>
        </header>

        <div style={styles.chatMessages}>
          {messages.length === 0 ? (
            <div style={styles.emptyChatState}>
              Start the conversation with {selectedFriend.fullName.split(" ")[0]}.
            </div>
          ) : (
            messages.map((msg) => (
              <ChatBubble key={msg.id} msg={msg} mine={msg.senderId === user.id} />
            ))
          )}

          {partnerTyping && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
              <div style={styles.typingBubble}>
                <span style={styles.typingDot} />
                <span style={{ ...styles.typingDot, animationDelay: "0.15s" }} />
                <span style={{ ...styles.typingDot, animationDelay: "0.3s" }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {imagePreview && (
          <div style={styles.previewRow}>
            <img src={imagePreview} alt="preview" style={styles.previewImage} />
            <button onClick={() => setImagePreview(null)} style={styles.previewClose}>
              <X size={13} />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} style={styles.chatComposer}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: "none" }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} style={styles.plusButton}>
            <ImagePlus size={17} />
          </button>
          <input
            ref={composerRef}
            value={messageInput}
            onChange={handleTyping}
            placeholder="Message..."
            style={styles.chatInput}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="submit"
            style={{
              ...styles.sendButton,
              opacity: messageInput.trim() || imagePreview ? 1 : 0.55,
            }}
            disabled={!messageInput.trim() && !imagePreview}
          >
            <Send size={16} />
          </button>
        </form>
      </Screen>
    );
  }

  function renderProfile() {
    return (
      <Screen>
        <TopBar user={user} onAvatarClick={() => undefined} />

        <div style={styles.scrollArea}>
          <section style={styles.profileHero}>
            <div style={styles.profileHalo}>
              <div style={styles.profileCenter}>{getInitials(user.fullName)}</div>
            </div>
            <div style={styles.profileName}>{user.fullName}</div>
            <div style={styles.profileHandle}>@{user.fullName.replace(/\s+/g, ".").toUpperCase()}</div>

            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <strong>{friends.length || 0}</strong>
                <span>FRIENDS</span>
              </div>
              <div style={styles.statCard}>
                <strong>{vibeCount}</strong>
                <span>VIBES</span>
              </div>
              <div style={styles.statCard}>
                <strong>Elite</strong>
                <span style={{ color: "#a678ff" }}>STATUS</span>
              </div>
            </div>
          </section>

          <section style={styles.sectionBlock}>
            <div style={styles.sectionLabel}>INFORMATION</div>
            <div style={styles.infoCard}>
              <div style={styles.infoTitleRow}>
                <GraduationCap size={16} color="#a678ff" />
                <div>
                  <div style={styles.infoTitle}>{user.course ?? "Campus Member"}</div>
                  <div style={styles.infoMeta}>{user.year ?? "Verified Student"}</div>
                </div>
              </div>
              <p style={styles.infoText}>
                {user.bio ??
                  user.interests ??
                  "Exploring authentic conversations, creative campus energy, and people worth remembering."}
              </p>
            </div>
          </section>

          {requests.length > 0 && (
            <section style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>FRIEND REQUESTS</div>
              <div style={{ display: "grid", gap: 12 }}>
                {requests.map((request) => (
                  <MemberCard
                    key={request.id}
                    person={request.sender}
                    action={
                      <button
                        onClick={() => void acceptRequest(request.id)}
                        style={styles.acceptButton}
                      >
                        Accept
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {notifications.length > 0 && (
            <section style={styles.sectionBlock}>
              <div style={styles.sectionLabel}>NOTIFICATIONS</div>
              <div style={{ display: "grid", gap: 10 }}>
                {notifications.slice(0, 4).map((notice) => (
                  <div key={notice.id} style={styles.infoMiniCard}>
                    <Info size={15} color="#a678ff" />
                    <span>{notice.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section style={styles.sectionBlock}>
            <div style={styles.sectionLabel}>SAFETY</div>
            <div style={{ display: "grid", gap: 10 }}>
              {blockedUsers.length ? (
                blockedUsers.map((entry) => (
                  <div key={entry.id} style={styles.blockedCard}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.infoTitle}>{entry.user.fullName}</div>
                      <div style={styles.infoMeta}>{entry.reason ?? "Blocked user"}</div>
                    </div>
                    <button
                      onClick={() => void unblockUser(entry.user.id)}
                      style={styles.unblockButton}
                    >
                      <ShieldBan size={14} />
                      Unblock
                    </button>
                  </div>
                ))
              ) : (
                <div style={styles.infoMiniCard}>
                  <ShieldBan size={15} color="rgba(255,255,255,0.5)" />
                  <span>No blocked members yet.</span>
                </div>
              )}
            </div>
          </section>

          <button onClick={onLogout} style={styles.logoutButton}>
            Logout
          </button>
        </div>
      </Screen>
    );
  }

  const content =
    activeTab === "home"
      ? renderHome()
      : activeTab === "discover"
        ? renderDiscover()
        : activeTab === "messages"
          ? renderMessages()
          : activeTab === "chat"
            ? renderChat()
            : renderProfile();

  return (
    <>
      <style>{`
        @keyframes campusTyping {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.45; }
          40% { transform: scale(1); opacity: 1; }
        }
        * { box-sizing: border-box; }
        html, body, #root { min-height: 100%; }
        body.dashboard-ui-lock { overflow: hidden; }
        .dashboard-scroll::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 12,
          background:
            "radial-gradient(circle at top, rgba(166,120,255,0.12), transparent 24%), radial-gradient(circle at bottom, rgba(255,255,255,0.05), transparent 28%), #050507",
        }}
      >
        <div style={phoneFrameStyle}>
          <div
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 138,
              height: 28,
              borderRadius: 999,
              background: "#09090b",
              border: "1px solid rgba(255,255,255,0.03)",
              zIndex: 4,
            }}
          />

          <div style={styles.statusBar}>
            <span>23:59</span>
            <span>⌁ ▰</span>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>{content}</div>

          {activeTab !== "chat" && (
            <nav style={styles.bottomNav}>
              {tabs.map((tab) => {
                const active =
                  tab.id === "messages" ? activeTab === "messages" : activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === "messages") setSelectedFriend(null);
                      setActiveTab(tab.id);
                    }}
                    style={{
                      ...styles.navButton,
                      color: active ? "#b187ff" : "rgba(255,255,255,0.34)",
                    }}
                  >
                    <span
                      style={{
                        ...styles.navIconWrap,
                        ...(active ? styles.navIconWrapActive : {}),
                      }}
                    >
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                    {tab.badge && tab.badge > 0 ? (
                      <span style={styles.navBadge}>{tab.badge > 99 ? "99+" : tab.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          )}

          <div style={styles.homeIndicator} />
        </div>
      </div>

      {outgoingCall && !activeCall && (
        <div style={styles.callOverlay}>
          <div style={styles.callCircle}>{getInitials(outgoingCall.receiverName)}</div>
          <div style={styles.callTitle}>{outgoingCall.receiverName}</div>
          <div style={styles.callText}>Connecting now...</div>
          <button onClick={() => setOutgoingCall(null)} style={styles.callDanger}>
            <Phone size={15} style={{ transform: "rotate(135deg)" }} />
            Cancel
          </button>
        </div>
      )}

      {incomingCall && !activeCall && (
        <div style={styles.callOverlay}>
          <div style={styles.callCircle}>{getInitials(incomingCall.callerName)}</div>
          <div style={styles.callTitle}>{incomingCall.callerName}</div>
          <div style={styles.callText}>
            Incoming {incomingCall.isVideo ? "video" : "voice"} call...
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <button onClick={declineCall} style={styles.callDangerRound}>
              <Phone size={18} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={acceptCall} style={styles.callAcceptRound}>
              {incomingCall.isVideo ? <Camera size={18} /> : <Phone size={18} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  statusBar: {
    height: 34,
    padding: "12px 18px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "rgba(255,255,255,0.78)",
    fontSize: "0.9rem",
    fontWeight: 600,
    letterSpacing: "0.01em",
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 18px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  },
  roundIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f4f4f6",
  },
  plainIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    color: "rgba(255,255,255,0.78)",
    border: "none",
    flexShrink: 0,
  },
  avatarChip: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(43,37,61,0.88)",
    border: "1px solid rgba(166,120,255,0.18)",
    color: "#d8cdff",
    fontWeight: 700,
    fontSize: "0.8rem",
    flexShrink: 0,
  },
  heroCard: {
    borderRadius: 28,
    padding: "24px 22px 22px",
    background:
      "radial-gradient(circle at top right, rgba(166,120,255,0.18), transparent 36%), linear-gradient(135deg, rgba(28,28,34,0.96) 0%, rgba(22,22,27,0.98) 100%)",
    border: "1px solid rgba(255,255,255,0.05)",
    boxShadow: "0 26px 50px rgba(0,0,0,0.32)",
  },
  heroBadge: {
    color: "#a678ff",
    fontSize: "0.66rem",
    letterSpacing: "0.16em",
    fontWeight: 800,
    marginBottom: 16,
  },
  heroTitle: {
    margin: 0,
    color: "#fafafc",
    fontWeight: 600,
    fontSize: "2.08rem",
    lineHeight: 1.05,
    letterSpacing: "-0.05em",
  },
  primaryButton: {
    marginTop: 24,
    width: "100%",
    height: 54,
    borderRadius: 18,
    border: "none",
    background: "#f4f1ee",
    color: "#17151c",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontWeight: 800,
    letterSpacing: "0.02em",
  },
  sectionBlock: {
    display: "grid",
    gap: 12,
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.28)",
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "#b187ff",
    fontSize: "0.82rem",
    fontWeight: 700,
    padding: 0,
  },
  onlineLabel: {
    color: "#23d968",
    fontSize: "0.74rem",
    fontWeight: 800,
    letterSpacing: "0.02em",
  },
  memberAction: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(77,55,132,0.35)",
    border: "1px solid rgba(166,120,255,0.15)",
    color: "#cbb7ff",
    flexShrink: 0,
  },
  memberActionSecondary: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(43,37,61,0.88)",
    border: "1px solid rgba(166,120,255,0.18)",
    color: "#cbb7ff",
    flexShrink: 0,
  },
  emptyPanel: {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.03)",
    padding: "18px 16px",
    color: "rgba(255,255,255,0.48)",
    fontSize: "0.9rem",
    lineHeight: 1.55,
  },
  photoCard: {
    position: "relative",
    minHeight: 170,
    borderRadius: 22,
    overflow: "hidden",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  photoImage: {
    width: "100%",
    height: 170,
    objectFit: "cover",
    display: "block",
  },
  photoMetaLeft: {
    position: "absolute",
    left: 12,
    bottom: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(17,17,20,0.78)",
    color: "#ececf1",
    fontSize: "0.78rem",
    fontWeight: 700,
    backdropFilter: "blur(10px)",
  },
  photoMetaRight: {
    position: "absolute",
    right: 12,
    bottom: 12,
    padding: "6px 10px",
    borderRadius: 999,
    background: "rgba(17,17,20,0.78)",
    color: "#ececf1",
    fontSize: "0.78rem",
    fontWeight: 700,
    backdropFilter: "blur(10px)",
  },
  searchWrap: {
    position: "relative",
    marginBottom: 8,
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(255,255,255,0.28)",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    padding: "0 16px 0 42px",
    color: "#f4f4f7",
    outline: "none",
    fontSize: "0.95rem",
  },
  filterRow: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 6,
    marginBottom: 8,
  },
  filterChip: {
    height: 34,
    borderRadius: 999,
    padding: "0 14px",
    border: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.72)",
    whiteSpace: "nowrap",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  filterChipActive: {
    background: "linear-gradient(135deg, #b187ff 0%, #9d74ff 100%)",
    color: "#19131f",
    border: "none",
    boxShadow: "0 14px 28px rgba(166,120,255,0.22)",
  },
  noticeCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    background: "rgba(166,120,255,0.08)",
    border: "1px solid rgba(166,120,255,0.12)",
    marginBottom: 14,
  },
  noticeIcon: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(166,120,255,0.18)",
    color: "#cbb7ff",
  },
  noticeTitle: {
    color: "#f5f4f8",
    fontWeight: 700,
    fontSize: "0.9rem",
    marginBottom: 2,
  },
  noticeText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: "0.76rem",
  },
  threadCard: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    color: "inherit",
  },
  threadHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
    color: "#f5f5f7",
    fontSize: "0.95rem",
  },
  threadText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "0.8rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    padding: "0 7px",
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#b187ff",
    color: "#17131f",
    fontWeight: 800,
    fontSize: "0.72rem",
    flexShrink: 0,
  },
  chatHeader: {
    padding: "18px 16px 14px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    flexShrink: 0,
  },
  chatName: {
    color: "#f7f7fa",
    fontSize: "0.94rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  chatStatus: {
    color: "#23d968",
    fontSize: "0.72rem",
    fontWeight: 700,
    marginTop: 2,
  },
  chatMessages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "18px 16px 10px",
    background:
      "radial-gradient(circle at top, rgba(166,120,255,0.06), transparent 24%), #111114",
  },
  emptyChatState: {
    minHeight: "100%",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    color: "rgba(255,255,255,0.38)",
    fontSize: "0.92rem",
    padding: "0 24px",
  },
  typingBubble: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "12px 14px",
    borderRadius: "18px 18px 18px 8px",
    background: "rgba(255,255,255,0.06)",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.78)",
    animation: "campusTyping 1s infinite",
  },
  previewRow: {
    padding: "10px 16px 0",
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 16,
    objectFit: "cover",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  previewClose: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "none",
  },
  chatComposer: {
    padding: "12px 16px 20px",
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr) 42px",
    gap: 10,
    alignItems: "center",
    flexShrink: 0,
    background: "#111114",
  },
  plusButton: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.75)",
    border: "none",
  },
  chatInput: {
    width: "100%",
    minWidth: 0,
    height: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.04)",
    color: "#f4f4f7",
    padding: "0 16px",
    outline: "none",
    fontSize: "16px",
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#f4f1ee",
    color: "#15131a",
    border: "none",
  },
  profileHero: {
    display: "grid",
    justifyItems: "center",
    gap: 10,
    paddingTop: 10,
  },
  profileHalo: {
    width: 112,
    height: 112,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle, rgba(166,120,255,0.22), rgba(166,120,255,0.04) 70%)",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  profileCenter: {
    width: 78,
    height: 78,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "#232327",
    color: "#d7cbff",
    fontSize: "2rem",
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  profileName: {
    color: "#f5f5f8",
    fontSize: "1.8rem",
    fontWeight: 800,
    letterSpacing: "-0.05em",
    textAlign: "center",
  },
  profileHandle: {
    color: "rgba(255,255,255,0.32)",
    fontSize: "0.88rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  statsGrid: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 10,
  },
  statCard: {
    minHeight: 72,
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: 10,
    color: "#f5f5f8",
  },
  infoCard: {
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.03)",
    padding: 18,
  },
  infoTitleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  infoTitle: {
    color: "#f5f5f8",
    fontWeight: 700,
    fontSize: "0.95rem",
    marginBottom: 2,
  },
  infoMeta: {
    color: "rgba(255,255,255,0.38)",
    fontSize: "0.8rem",
  },
  infoText: {
    margin: 0,
    color: "rgba(255,255,255,0.64)",
    fontSize: "0.94rem",
    lineHeight: 1.65,
  },
  acceptButton: {
    height: 36,
    padding: "0 14px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #b187ff 0%, #9d74ff 100%)",
    color: "#18121f",
    fontWeight: 800,
    flexShrink: 0,
  },
  infoMiniCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.64)",
    fontSize: "0.88rem",
  },
  blockedCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  unblockButton: {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#f1f1f5",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 700,
    flexShrink: 0,
  },
  logoutButton: {
    width: "100%",
    height: 52,
    borderRadius: 18,
    border: "1px solid rgba(255,90,90,0.18)",
    background: "rgba(255,90,90,0.08)",
    color: "#ff8c8c",
    fontWeight: 800,
    marginTop: 8,
  },
  bottomNav: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    padding: "10px 14px 12px",
    borderTop: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(12,12,15,0.98)",
    flexShrink: 0,
  },
  navButton: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    gap: 6,
    padding: "2px 0 0",
    background: "transparent",
    border: "none",
    fontSize: "0.66rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(255,255,255,0.05)",
    background: "rgba(255,255,255,0.02)",
  },
  navIconWrapActive: {
    background: "rgba(166,120,255,0.12)",
    border: "1px solid rgba(166,120,255,0.2)",
    boxShadow: "0 12px 24px rgba(166,120,255,0.14)",
  },
  navBadge: {
    position: "absolute",
    top: 1,
    right: "calc(50% - 18px)",
    minWidth: 16,
    height: 16,
    padding: "0 4px",
    borderRadius: 999,
    background: "#b187ff",
    color: "#18121f",
    fontSize: "0.6rem",
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
  },
  homeIndicator: {
    width: 118,
    height: 5,
    borderRadius: 999,
    background: "rgba(255,255,255,0.74)",
    alignSelf: "center",
    marginBottom: 8,
    flexShrink: 0,
  },
  callOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(7,7,10,0.9)",
    backdropFilter: "blur(16px)",
    display: "grid",
    placeItems: "center",
    gap: 14,
    textAlign: "center",
    zIndex: 999,
  },
  callCircle: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #b187ff 0%, #7041ff 100%)",
    color: "#141019",
    fontSize: "1.8rem",
    fontWeight: 800,
  },
  callTitle: {
    color: "#f7f7fb",
    fontSize: "1.5rem",
    fontWeight: 800,
    letterSpacing: "-0.04em",
  },
  callText: {
    color: "rgba(255,255,255,0.54)",
    fontSize: "0.92rem",
  },
  callDanger: {
    height: 46,
    padding: "0 18px",
    borderRadius: 999,
    border: "none",
    background: "rgba(255,90,90,0.95)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
  },
  callDangerRound: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "none",
    display: "grid",
    placeItems: "center",
    background: "#ff5a5a",
    color: "#fff",
  },
  callAcceptRound: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "none",
    display: "grid",
    placeItems: "center",
    background: "#23d968",
    color: "#101512",
  },
  endCallButton: {
    position: "absolute",
    right: 16,
    bottom: 16,
    height: 42,
    padding: "0 16px",
    borderRadius: 999,
    border: "none",
    background: "rgba(255,90,90,0.95)",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
    zIndex: 3,
  },
};
