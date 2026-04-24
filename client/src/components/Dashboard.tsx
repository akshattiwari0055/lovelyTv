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
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Search,
  Send,
  ShieldBan,
  Sparkles,
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
type FilterTag = "All" | "Architecture" | "Design" | "Technology";

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

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getSubtitle(user: User) {
  if (user.course && user.year) return `${user.course} · ${user.year}`;
  if (user.interests) return user.interests;
  return "Verified campus member";
}

function getFilter(user: User): FilterTag {
  const source = `${user.course ?? ""} ${user.interests ?? ""}`.toLowerCase();
  if (source.includes("arch")) return "Architecture";
  if (source.includes("design") || source.includes("art")) return "Design";
  if (
    source.includes("tech") ||
    source.includes("computer") ||
    source.includes("software") ||
    source.includes("coding")
  ) {
    return "Technology";
  }
  return "All";
}

function getAvatarGradient(seed: string) {
  const gradients = [
    "linear-gradient(135deg, #2a2235 0%, #5c3fb6 100%)",
    "linear-gradient(135deg, #23262f 0%, #46526d 100%)",
    "linear-gradient(135deg, #2f2529 0%, #75516e 100%)",
    "linear-gradient(135deg, #1e2632 0%, #2f6ca8 100%)",
  ];
  return gradients[seed.length % gradients.length];
}

function AppLogo() {
  return (
    <div style={styles.logoWrap}>
      <span style={styles.logoText}>CAMPUS</span>
      <span style={styles.logoDot}>•</span>
    </div>
  );
}

function Avatar({
  name,
  size = 48,
  online = false,
}: {
  name: string;
  size?: number;
  online?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: getAvatarGradient(name),
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize: size * 0.34,
          color: "#f6f3ff",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {getInitials(name)}
      </div>
      {online && <span style={styles.onlineDot} />}
    </div>
  );
}

function SidebarNav({
  activeTab,
  setActiveTab,
  usersWithUnread,
}: {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  usersWithUnread: number;
}) {
  const items: { id: Exclude<AppTab, "chat">; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "home", label: "Club", icon: <Home size={18} /> },
    { id: "discover", label: "Explore", icon: <Search size={18} /> },
    { id: "messages", label: "Inbox", icon: <Mail size={18} />, badge: usersWithUnread },
    { id: "profile", label: "Elite", icon: <Crown size={18} /> },
  ];

  return (
    <>
      <aside className="dashboard-desktop-nav" style={styles.desktopSidebar}>
        <div>
          <AppLogo />
          <div style={styles.desktopNavGroup}>
            {items.map((item) => {
              const active = activeTab === item.id || (item.id === "messages" && activeTab === "chat");
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  style={{
                    ...styles.desktopNavItem,
                    ...(active ? styles.desktopNavItemActive : {}),
                  }}
                >
                  <span style={styles.desktopNavIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span style={styles.desktopNavBadge}>
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.desktopSidebarFoot}>
          <div style={styles.smallMeta}>Private student network</div>
          <div style={styles.smallMetaMuted}>Built for spontaneous, verified campus conversation.</div>
        </div>
      </aside>

      <nav className="dashboard-mobile-nav" style={styles.mobileNav}>
        {items.map((item) => {
          const active = activeTab === item.id || (item.id === "messages" && activeTab === "chat");
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                ...styles.mobileNavItem,
                color: active ? "#b58cff" : "rgba(255,255,255,0.34)",
              }}
            >
              <span
                style={{
                  ...styles.mobileNavIcon,
                  ...(active ? styles.mobileNavIconActive : {}),
                }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span style={styles.mobileNavBadge}>{item.badge > 99 ? "99+" : item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function TopBar({
  user,
  title,
  subtitle,
  onProfile,
  onBack,
  right,
}: {
  user: User;
  title?: string;
  subtitle?: string;
  onProfile: () => void;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header style={styles.topBar}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        {onBack ? (
          <button onClick={onBack} style={styles.iconButton}>
            <ArrowLeft size={16} />
          </button>
        ) : (
          <div className="mobile-logo-only">
            <AppLogo />
          </div>
        )}
        {title ? (
          <div style={{ minWidth: 0 }}>
            <div style={styles.topTitle}>{title}</div>
            {subtitle && <div style={styles.topSubtitle}>{subtitle}</div>}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {right}
        <button onClick={onProfile} style={styles.profileChip}>
          {getInitials(user.fullName)}
        </button>
      </div>
    </header>
  );
}

function StatBox({ value, label, accent }: { value: string | number; label: string; accent?: boolean }) {
  return (
    <div style={styles.statBox}>
      <strong style={styles.statValue}>{value}</strong>
      <span style={{ ...styles.statLabel, color: accent ? "#b58cff" : "rgba(255,255,255,0.42)" }}>
        {label}
      </span>
    </div>
  );
}

function MemberCard({
  user,
  action,
  compact = false,
}: {
  user: User;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <article
      style={{
        ...styles.memberCard,
        ...(compact ? styles.memberCardCompact : {}),
      }}
    >
      <Avatar name={user.fullName} size={compact ? 44 : 50} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.memberName}>{user.fullName}</div>
        <div style={styles.memberSubtitle}>{getSubtitle(user)}</div>
      </div>
      {action}
    </article>
  );
}

function MessageBubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          ...styles.chatBubble,
          ...(mine ? styles.chatBubbleMine : styles.chatBubbleOther),
        }}
      >
        {message.imageUrl ? (
          <img src={message.imageUrl} alt="attachment" style={styles.chatImage} />
        ) : null}
        {message.content ? <div style={styles.chatText}>{message.content}</div> : null}
        <div style={styles.chatMeta}>
          <span>{formatTime(message.createdAt)}</span>
          {mine ? (message.isRead ? <CheckCheck size={11} /> : <Check size={11} />) : null}
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTag>("All");

  const usersWithUnread = useMemo(
    () => Object.values(unreadCounts).filter((count) => count > 0).length,
    [unreadCounts]
  );

  const conversationIsOpen = activeTab === "chat" && !!selectedFriend;

  const filteredDiscoverUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return discoverUsers.filter((person) => {
      const matchesText =
        !query ||
        person.fullName.toLowerCase().includes(query) ||
        (person.course ?? "").toLowerCase().includes(query) ||
        (person.year ?? "").toLowerCase().includes(query);
      const matchesFilter = activeFilter === "All" || getFilter(person) === activeFilter;
      return matchesText && matchesFilter;
    });
  }, [activeFilter, discoverUsers, search]);

  const curatedMembers = useMemo(() => filteredDiscoverUsers.slice(0, 6), [filteredDiscoverUsers]);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (message: Message) => {
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      const otherId = message.senderId === user.id ? message.receiverId : message.senderId;
      if (message.content) {
        setLastMessages((current) => ({ ...current, [otherId]: message.content ?? "" }));
      }

      if (
        selectedFriend?.id === message.senderId &&
        conversationIsOpen &&
        document.visibilityState === "visible"
      ) {
        socket.emit("message:read", {
          messageIds: [message.id],
          senderId: message.senderId,
        });
        setUnreadCounts((current) => ({ ...current, [message.senderId]: 0 }));
      } else if (message.senderId !== user.id) {
        setUnreadCounts((current) => ({
          ...current,
          [message.senderId]: Math.min((current[message.senderId] ?? 0) + 1, 99),
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

    const unreadIds = nextMessages
      .filter((item) => item.senderId === otherId && !item.isRead)
      .map((item) => item.id);

    if (markRead && unreadIds.length) {
      getSocket()?.emit("message:read", { messageIds: unreadIds, senderId: otherId });
      setMessages((current) =>
        current.map((item) =>
          unreadIds.includes(item.id) ? { ...item, isRead: true } : item
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

  function goHome() {
    setActiveTab("home");
  }

  function goMessages() {
    if (selectedFriend) {
      setActiveTab("chat");
      return;
    }
    setActiveTab("messages");
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

  const friendsCount = friends.length;
  const vibeCount = `${(friends.length * 1.6 + discoverUsers.length * 0.7 + 2.4).toFixed(1)}k`;
  const onlineCount = Math.max(12, discoverUsers.length + friends.length * 2 + 8);
  const featuredMembers = curatedMembers.slice(0, 3);
  const latestThreads = friends.slice(0, 8);

  const renderHome = () => (
    <>
      <TopBar user={user} onProfile={() => setActiveTab("profile")} />
      <div style={styles.pageScroll}>
        <div className="dashboard-home-grid" style={styles.homeGrid}>
          <section style={styles.heroPanel}>
            <div style={styles.badge}>• CONNECT INSTANTLY</div>
            <h1 style={styles.heroTitle}>
              Find your next
              <br />
              campus connection.
            </h1>
            <p style={styles.heroCopy}>
              A more curated student space for spontaneous conversations, shared interests, and verified people.
            </p>
            <div style={styles.heroActions}>
              <button style={styles.primaryAction} onClick={() => navigate("/app/random")}>
                <Flame size={16} />
                Start Random Chat
              </button>
              <button style={styles.secondaryAction} onClick={() => setActiveTab("discover")}>
                <Sparkles size={16} />
                Explore Members
              </button>
            </div>
          </section>

          <section style={styles.statsPanel}>
            <StatBox value={friendsCount} label="FRIENDS" />
            <StatBox value={vibeCount} label="VIBES" />
            <StatBox value="Elite" label="STATUS" accent />
          </section>
        </div>

        <div className="dashboard-dual-grid" style={styles.dualGrid}>
          <section style={styles.sectionPanel}>
            <div style={styles.sectionHead}>
              <div>
                <div style={styles.sectionEyebrow}>CURATED FOR YOU</div>
                <h3 style={styles.sectionHeading}>People worth meeting</h3>
              </div>
              <button style={styles.inlineLink} onClick={() => setActiveTab("discover")}>
                View all
              </button>
            </div>
            <div style={styles.cardList}>
              {featuredMembers.length ? (
                featuredMembers.map((member) => (
                  <MemberCard
                    key={member.id}
                    user={member}
                    action={
                      <button
                        onClick={() => void sendFriendRequest(member.id)}
                        style={styles.actionCircle}
                      >
                        <UserPlus size={16} />
                      </button>
                    }
                  />
                ))
              ) : (
                <div style={styles.emptyState}>No members available right now.</div>
              )}
            </div>
          </section>

          <section style={styles.sectionPanel}>
            <div style={styles.sectionHead}>
              <div>
                <div style={styles.sectionEyebrow}>ACTIVE DIALOGUE</div>
                <h3 style={styles.sectionHeading}>Conversations in motion</h3>
              </div>
              <div style={styles.livePill}>{Math.max(4, friends.length)} ONLINE</div>
            </div>
            <div style={styles.cardList}>
              {latestThreads.length ? (
                latestThreads.slice(0, 4).map((friend) => (
                  <button key={friend.id} onClick={() => openChat(friend)} style={styles.threadPreview}>
                    <Avatar name={friend.fullName} size={44} online={(unreadCounts[friend.id] ?? 0) > 0} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={styles.threadName}>{friend.fullName}</div>
                      <div style={styles.threadCopy}>
                        {lastMessages[friend.id] ?? getSubtitle(friend)}
                      </div>
                    </div>
                    {(unreadCounts[friend.id] ?? 0) > 0 ? (
                      <span style={styles.threadBadge}>
                        {unreadCounts[friend.id] > 99 ? "99+" : unreadCounts[friend.id]}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div style={styles.emptyState}>
                  Accept or add friends to turn this into your active inbox.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );

  const renderDiscover = () => (
    <>
      <TopBar
        user={user}
        title="Discover"
        subtitle="Verified Members"
        onProfile={() => setActiveTab("profile")}
        onBack={goHome}
      />
      <div style={styles.pageScroll}>
        <section style={styles.sectionPanel}>
          <div style={styles.searchWrap}>
            <Search size={16} style={styles.searchIcon} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by major, name, or year..."
              style={styles.searchInput}
            />
          </div>

          <div style={styles.filterWrap}>
            {(["All", "Architecture", "Design", "Technology"] as FilterTag[]).map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                style={{
                  ...styles.filterChip,
                  ...(activeFilter === filter ? styles.filterChipActive : {}),
                }}
              >
                {filter}
              </button>
            ))}
          </div>

          <div style={styles.sectionHead}>
            <div>
              <div style={styles.sectionEyebrow}>RECOMMENDED</div>
              <h3 style={styles.sectionHeading}>Students you may vibe with</h3>
            </div>
            <div style={styles.livePill}>{onlineCount} ONLINE</div>
          </div>

          <div className="discover-grid" style={styles.discoverGrid}>
            {curatedMembers.length ? (
              curatedMembers.map((member) => (
                <article key={member.id} style={styles.discoverCard}>
                  <Avatar name={member.fullName} size={54} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.memberName}>{member.fullName}</div>
                    <div style={styles.memberSubtitle}>{getSubtitle(member)}</div>
                    {member.mutualConnections ? (
                      <div style={styles.metaInline}>
                        <Users size={12} />
                        {member.mutualConnections} mutual
                      </div>
                    ) : null}
                  </div>
                  <button
                    onClick={() => void sendFriendRequest(member.id)}
                    style={styles.actionCircle}
                  >
                    <UserPlus size={16} />
                  </button>
                </article>
              ))
            ) : (
              <div style={styles.emptyState}>No matching members found for that filter.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );

  const renderMessages = () => (
    <>
      <TopBar
        user={user}
        title="Inbox"
        subtitle="Private Dialogue"
        onProfile={() => setActiveTab("profile")}
        onBack={goHome}
      />
      <div style={styles.pageScroll}>
        <div className="messages-layout" style={styles.messagesLayout}>
          <section style={styles.sectionPanel}>
            <div style={styles.sectionHead}>
              <div>
                <div style={styles.sectionEyebrow}>THREADS</div>
                <h3 style={styles.sectionHeading}>Recent conversations</h3>
              </div>
            </div>

            {requests.length > 0 ? (
              <div style={styles.requestNotice}>
                <div style={styles.noticeTextBlock}>
                  <strong>{requests.length} pending friend request{requests.length > 1 ? "s" : ""}</strong>
                  <span>Review them in Elite.</span>
                </div>
                <button style={styles.noticeButton} onClick={() => setActiveTab("profile")}>
                  View
                </button>
              </div>
            ) : null}

            <div style={styles.cardList}>
              {friends.length ? (
                friends.map((friend) => (
                  <button key={friend.id} onClick={() => openChat(friend)} style={styles.threadRow}>
                    <Avatar name={friend.fullName} size={46} online={(unreadCounts[friend.id] ?? 0) > 0} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={styles.threadName}>{friend.fullName}</div>
                      <div style={styles.threadCopy}>
                        {lastMessages[friend.id] ?? getSubtitle(friend)}
                      </div>
                    </div>
                    {(unreadCounts[friend.id] ?? 0) > 0 ? (
                      <span style={styles.threadBadge}>
                        {unreadCounts[friend.id] > 99 ? "99+" : unreadCounts[friend.id]}
                      </span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div style={styles.emptyState}>
                  No conversations yet. Explore the network and add someone first.
                </div>
              )}
            </div>
          </section>

          <section className="messages-preview-panel" style={styles.sectionPanel}>
            <div style={styles.sectionHead}>
              <div>
                <div style={styles.sectionEyebrow}>PREVIEW</div>
                <h3 style={styles.sectionHeading}>
                  {selectedFriend ? selectedFriend.fullName : "Select a conversation"}
                </h3>
              </div>
            </div>

            {selectedFriend ? (
              <div style={styles.previewCard}>
                <Avatar name={selectedFriend.fullName} size={72} />
                <div style={styles.previewTitle}>{selectedFriend.fullName}</div>
                <div style={styles.previewSubtitle}>{getSubtitle(selectedFriend)}</div>
                <button style={styles.primaryAction} onClick={() => setActiveTab("chat")}>
                  Open Chat
                </button>
              </div>
            ) : (
              <div style={styles.emptyState}>
                Pick a thread on the left to open it here on larger screens.
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );

  const renderChat = () => {
    if (!selectedFriend) {
      return (
        <>
          <TopBar
            user={user}
            title="Inbox"
            subtitle="Choose a thread"
            onProfile={() => setActiveTab("profile")}
            onBack={goMessages}
          />
          <div style={styles.pageScroll}>
            <div style={styles.emptyState}>Choose a friend from your inbox to start chatting.</div>
          </div>
        </>
      );
    }

    if (activeCall && zegoConfig) {
      return (
        <>
          <TopBar
            user={user}
            title={selectedFriend.fullName}
            subtitle={activeCall.isVideo ? "Video Session" : "Voice Session"}
            onProfile={() => setActiveTab("profile")}
            onBack={() => setActiveCall(null)}
          />
          <div style={styles.callStage}>
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
              End Call
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <TopBar
          user={user}
          title={selectedFriend.fullName}
          subtitle="Online now"
          onProfile={() => setActiveTab("profile")}
          onBack={goMessages}
          right={
            <>
              <button style={styles.iconButton} onClick={() => startCall(false)}>
                <Phone size={15} />
              </button>
              <button style={styles.iconButton} onClick={() => startCall(true)}>
                <Camera size={15} />
              </button>
            </>
          }
        />

        <div className="chat-shell" style={styles.chatShell}>
          <div className="chat-main-panel" style={styles.chatPanel}>
            <div style={styles.chatMessages}>
              {messages.length ? (
                messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    mine={message.senderId === user.id}
                  />
                ))
              ) : (
                <div style={styles.emptyState}>
                  Say hello to {selectedFriend.fullName.split(" ")[0]} and start the conversation.
                </div>
              )}

              {partnerTyping ? (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={styles.typingBubble}>
                    <span style={styles.typingDot} />
                    <span style={{ ...styles.typingDot, animationDelay: "0.15s" }} />
                    <span style={{ ...styles.typingDot, animationDelay: "0.3s" }} />
                  </div>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>

            {imagePreview ? (
              <div style={styles.imagePreviewRow}>
                <img src={imagePreview} alt="preview" style={styles.imagePreview} />
                <button onClick={() => setImagePreview(null)} style={styles.closePreview}>
                  <X size={13} />
                </button>
              </div>
            ) : null}

            <form onSubmit={handleSend} style={styles.composer}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />
              <button type="button" onClick={() => fileRef.current?.click()} style={styles.iconButton}>
                <ImagePlus size={16} />
              </button>
              <input
                ref={composerRef}
                value={messageInput}
                onChange={handleTyping}
                placeholder="Type your message..."
                style={styles.composerInput}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={!messageInput.trim() && !imagePreview}
                style={{
                  ...styles.sendButton,
                  opacity: messageInput.trim() || imagePreview ? 1 : 0.55,
                }}
              >
                <Send size={16} />
              </button>
            </form>
          </div>

          <aside className="chat-info-panel" style={styles.chatInfoPanel}>
            <div style={styles.previewCard}>
              <Avatar name={selectedFriend.fullName} size={76} online />
              <div style={styles.previewTitle}>{selectedFriend.fullName}</div>
              <div style={styles.previewSubtitle}>{getSubtitle(selectedFriend)}</div>
              <div style={styles.metaInline}>
                <Sparkles size={13} />
                Verified member
              </div>
            </div>
          </aside>
        </div>
      </>
    );
  };

  const renderProfile = () => (
    <>
      <TopBar
        user={user}
        title="Elite"
        subtitle="Your Campus Identity"
        onProfile={() => undefined}
        onBack={goHome}
      />
      <div style={styles.pageScroll}>
        <div className="profile-layout" style={styles.profileLayout}>
          <section style={styles.profileHero}>
            <div style={styles.profileHalo}>
              <Avatar name={user.fullName} size={108} />
            </div>
            <h2 style={styles.profileName}>{user.fullName}</h2>
            <div style={styles.profileHandle}>@{user.fullName.replace(/\s+/g, ".").toUpperCase()}</div>

            <div className="profile-stats-grid" style={styles.profileStatsGrid}>
              <StatBox value={friends.length} label="FRIENDS" />
              <StatBox value={vibeCount} label="VIBES" />
              <StatBox value="Elite" label="STATUS" accent />
            </div>
          </section>

          <section style={styles.sectionPanel}>
            <div style={styles.sectionEyebrow}>INFORMATION</div>
            <div style={styles.infoCard}>
              <div style={styles.infoHead}>
                <GraduationCap size={17} color="#b58cff" />
                <div>
                  <div style={styles.infoTitle}>{user.course ?? "Campus Member"}</div>
                  <div style={styles.infoCaption}>{user.year ?? "Verified Student"}</div>
                </div>
              </div>
              <p style={styles.infoParagraph}>
                {user.bio ??
                  user.interests ??
                  "Blending campus energy, private conversation, and more thoughtful social discovery."}
              </p>
            </div>

            {requests.length ? (
              <>
                <div style={styles.sectionEyebrow}>FRIEND REQUESTS</div>
                <div style={styles.cardList}>
                  {requests.map((request) => (
                    <MemberCard
                      key={request.id}
                      user={request.sender}
                      compact
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
              </>
            ) : null}
          </section>

          <section style={styles.sectionPanel}>
            <div style={styles.sectionEyebrow}>ACTIVITY</div>
            <div style={styles.cardList}>
              {notifications.length ? (
                notifications.slice(0, 5).map((notification) => (
                  <div key={notification.id} style={styles.infoRow}>
                    <Info size={15} color="#b58cff" />
                    <span>{notification.message}</span>
                  </div>
                ))
              ) : (
                <div style={styles.infoRow}>
                  <Info size={15} color="rgba(255,255,255,0.4)" />
                  <span>No recent notifications yet.</span>
                </div>
              )}
            </div>

            <div style={styles.sectionEyebrow}>SAFETY</div>
            <div style={styles.cardList}>
              {blockedUsers.length ? (
                blockedUsers.map((entry) => (
                  <div key={entry.id} style={styles.blockedRow}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.infoTitle}>{entry.user.fullName}</div>
                      <div style={styles.infoCaption}>{entry.reason ?? "Blocked member"}</div>
                    </div>
                    <button
                      onClick={() => void unblockUser(entry.user.id)}
                      style={styles.ghostAction}
                    >
                      <ShieldBan size={14} />
                      Unblock
                    </button>
                  </div>
                ))
              ) : (
                <div style={styles.infoRow}>
                  <Lock size={15} color="rgba(255,255,255,0.4)" />
                  <span>No blocked users yet.</span>
                </div>
              )}
            </div>

            <button onClick={onLogout} style={styles.logoutButton}>
              Logout
            </button>
          </section>
        </div>
      </div>
    </>
  );

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
        @keyframes dashboardTyping {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.45; }
          40% { transform: scale(1); opacity: 1; }
        }

        @media (min-width: 960px) {
          .dashboard-mobile-nav {
            display: none !important;
          }

          .mobile-logo-only {
            display: none !important;
          }

          .messages-preview-panel,
          .chat-info-panel {
            display: flex !important;
          }
        }

        @media (max-width: 959px) {
          .dashboard-desktop-nav,
          .messages-preview-panel,
          .chat-info-panel {
            display: none !important;
          }
        }

        @media (max-width: 1180px) {
          .dashboard-home-grid,
          .dashboard-dual-grid,
          .messages-layout,
          .profile-layout,
          .chat-shell {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 720px) {
          .discover-grid,
          .profile-stats-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div style={styles.appShell}>
        <SidebarNav
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === "messages" && !selectedFriend) {
              setActiveTab("messages");
              return;
            }
            if (tab !== "chat") setActiveTab(tab);
          }}
          usersWithUnread={usersWithUnread}
        />

        <main style={styles.mainShell}>{content}</main>
      </div>

      {outgoingCall && !activeCall ? (
        <div style={styles.overlay}>
          <Avatar name={outgoingCall.receiverName} size={90} />
          <div style={styles.overlayTitle}>{outgoingCall.receiverName}</div>
          <div style={styles.overlayText}>Calling now...</div>
          <button onClick={() => setOutgoingCall(null)} style={styles.overlayDanger}>
            <Phone size={14} style={{ transform: "rotate(135deg)" }} />
            Cancel
          </button>
        </div>
      ) : null}

      {incomingCall && !activeCall ? (
        <div style={styles.overlay}>
          <Avatar name={incomingCall.callerName} size={90} online />
          <div style={styles.overlayTitle}>{incomingCall.callerName}</div>
          <div style={styles.overlayText}>
            Incoming {incomingCall.isVideo ? "video" : "voice"} call
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <button onClick={declineCall} style={styles.overlayRoundDanger}>
              <Phone size={18} style={{ transform: "rotate(135deg)" }} />
            </button>
            <button onClick={acceptCall} style={styles.overlayRoundAccept}>
              {incomingCall.isVideo ? <Camera size={18} /> : <Phone size={18} />}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  appShell: {
    minHeight: "100dvh",
    display: "grid",
    gridTemplateColumns: "280px minmax(0, 1fr)",
    background:
      "radial-gradient(circle at top left, rgba(181,140,255,0.12), transparent 24%), radial-gradient(circle at bottom right, rgba(72,128,255,0.08), transparent 18%), #07070a",
    color: "#f3f3f6",
  },
  desktopSidebar: {
    padding: "28px 22px",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(13,13,17,0.82)",
    backdropFilter: "blur(18px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "100dvh",
  },
  logoWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 28,
  },
  logoText: {
    fontSize: "2rem",
    fontWeight: 800,
    letterSpacing: "-0.06em",
    color: "#fafafe",
  },
  logoDot: {
    color: "#b58cff",
    fontSize: "1.8rem",
    lineHeight: 1,
  },
  desktopNavGroup: {
    display: "grid",
    gap: 10,
  },
  desktopNavItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 14px",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(255,255,255,0.02)",
    color: "rgba(255,255,255,0.68)",
    fontWeight: 700,
    fontSize: "0.95rem",
    textAlign: "left",
    position: "relative",
  },
  desktopNavItemActive: {
    background: "rgba(181,140,255,0.12)",
    color: "#f4efff",
    border: "1px solid rgba(181,140,255,0.18)",
  },
  desktopNavIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.05)",
  },
  desktopNavBadge: {
    marginLeft: "auto",
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: "0.72rem",
    fontWeight: 800,
    background: "#b58cff",
    color: "#140f1b",
    padding: "0 6px",
  },
  desktopSidebarFoot: {
    display: "grid",
    gap: 6,
  },
  smallMeta: {
    fontSize: "0.92rem",
    fontWeight: 700,
    color: "#f5f5f8",
  },
  smallMetaMuted: {
    fontSize: "0.82rem",
    lineHeight: 1.5,
    color: "rgba(255,255,255,0.38)",
  },
  mobileNav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
    background: "rgba(9,9,12,0.96)",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    backdropFilter: "blur(14px)",
  },
  mobileNavItem: {
    position: "relative",
    background: "transparent",
    border: "none",
    display: "grid",
    justifyItems: "center",
    gap: 6,
    fontSize: "0.68rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  mobileNavIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  mobileNavIconActive: {
    background: "rgba(181,140,255,0.14)",
    border: "1px solid rgba(181,140,255,0.22)",
  },
  mobileNavBadge: {
    position: "absolute",
    top: 0,
    right: "calc(50% - 18px)",
    minWidth: 17,
    height: 17,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    background: "#b58cff",
    color: "#15111c",
    fontSize: "0.6rem",
    fontWeight: 800,
    padding: "0 4px",
  },
  mainShell: {
    minWidth: 0,
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    padding: "24px 24px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    background: "rgba(10,10,14,0.72)",
    backdropFilter: "blur(14px)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  topTitle: {
    fontSize: "1.24rem",
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: "#fafafe",
  },
  topSubtitle: {
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#b58cff",
    marginTop: 3,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.07)",
    color: "#f4f4f8",
    flexShrink: 0,
  },
  profileChip: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: "rgba(181,140,255,0.16)",
    border: "1px solid rgba(181,140,255,0.18)",
    color: "#ddcfff",
    fontWeight: 800,
    fontSize: "0.9rem",
  },
  pageScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "24px",
    paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
  },
  homeGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.9fr)",
    gap: 20,
    marginBottom: 20,
  },
  heroPanel: {
    padding: "30px",
    borderRadius: 28,
    background:
      "radial-gradient(circle at top right, rgba(181,140,255,0.16), transparent 30%), linear-gradient(135deg, rgba(23,23,29,0.96) 0%, rgba(15,15,18,0.98) 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 30px 60px rgba(0,0,0,0.26)",
  },
  badge: {
    color: "#b58cff",
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.16em",
    marginBottom: 18,
  },
  heroTitle: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 3.8rem)",
    lineHeight: 0.98,
    fontWeight: 800,
    letterSpacing: "-0.07em",
    color: "#fafafe",
  },
  heroCopy: {
    margin: "18px 0 0",
    maxWidth: 560,
    color: "rgba(255,255,255,0.52)",
    fontSize: "1rem",
    lineHeight: 1.7,
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 26,
  },
  primaryAction: {
    minHeight: 50,
    padding: "0 18px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #b58cff 0%, #9d70ff 100%)",
    color: "#17121d",
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
  },
  secondaryAction: {
    minHeight: 50,
    padding: "0 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#f5f3fb",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 9,
  },
  statsPanel: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  },
  statBox: {
    padding: "22px 18px",
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    display: "grid",
    alignContent: "center",
    minHeight: 112,
  },
  statValue: {
    fontSize: "2rem",
    lineHeight: 1,
    marginBottom: 8,
    color: "#fafafe",
    fontWeight: 800,
    letterSpacing: "-0.05em",
  },
  statLabel: {
    fontSize: "0.8rem",
    fontWeight: 800,
    letterSpacing: "0.1em",
  },
  dualGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 20,
  },
  sectionPanel: {
    padding: "22px",
    borderRadius: 26,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(15,15,19,0.92)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  sectionHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionEyebrow: {
    color: "rgba(255,255,255,0.28)",
    fontSize: "0.72rem",
    fontWeight: 800,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  sectionHeading: {
    margin: "8px 0 0",
    fontSize: "1.35rem",
    lineHeight: 1.05,
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: "#f8f8fb",
  },
  inlineLink: {
    background: "none",
    border: "none",
    color: "#b58cff",
    fontWeight: 700,
    padding: 0,
    whiteSpace: "nowrap",
  },
  livePill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(35,217,104,0.08)",
    color: "#23d968",
    fontSize: "0.74rem",
    fontWeight: 800,
  },
  cardList: {
    display: "grid",
    gap: 12,
  },
  memberCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  memberCardCompact: {
    padding: "14px 15px",
  },
  memberName: {
    fontSize: "0.98rem",
    fontWeight: 700,
    color: "#f7f7fb",
    marginBottom: 4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  memberSubtitle: {
    fontSize: "0.82rem",
    color: "rgba(255,255,255,0.42)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  actionCircle: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(181,140,255,0.18)",
    background: "rgba(181,140,255,0.1)",
    color: "#d5c3ff",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  },
  threadPreview: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    color: "inherit",
    width: "100%",
  },
  threadName: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#f7f7fb",
    marginBottom: 4,
  },
  threadCopy: {
    fontSize: "0.82rem",
    color: "rgba(255,255,255,0.4)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  threadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 999,
    background: "#b58cff",
    color: "#15111c",
    display: "grid",
    placeItems: "center",
    padding: "0 6px",
    fontSize: "0.7rem",
    fontWeight: 800,
    flexShrink: 0,
  },
  emptyState: {
    padding: "20px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.03)",
    border: "1px dashed rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.44)",
    lineHeight: 1.6,
    textAlign: "center",
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    top: "50%",
    left: 14,
    transform: "translateY(-50%)",
    color: "rgba(255,255,255,0.3)",
    pointerEvents: "none",
  },
  searchInput: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.03)",
    color: "#f7f7fb",
    padding: "0 16px 0 42px",
    outline: "none",
    fontSize: "0.95rem",
  },
  filterWrap: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  filterChip: {
    height: 36,
    padding: "0 15px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.03)",
    color: "rgba(255,255,255,0.7)",
    fontWeight: 700,
  },
  filterChipActive: {
    background: "linear-gradient(135deg, #b58cff 0%, #9d70ff 100%)",
    color: "#17121d",
    border: "none",
  },
  discoverGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },
  discoverCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "16px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  metaInline: {
    marginTop: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#b58cff",
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  messagesLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.8fr)",
    gap: 20,
  },
  requestNotice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(181,140,255,0.08)",
    border: "1px solid rgba(181,140,255,0.14)",
  },
  noticeTextBlock: {
    display: "grid",
    gap: 4,
    color: "#f5f0ff",
    fontSize: "0.88rem",
  },
  noticeButton: {
    minHeight: 38,
    padding: "0 14px",
    borderRadius: 12,
    border: "none",
    background: "#f5efff",
    color: "#18121f",
    fontWeight: 800,
    flexShrink: 0,
  },
  threadRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    width: "100%",
    color: "inherit",
  },
  previewCard: {
    flex: 1,
    borderRadius: 22,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: 10,
    textAlign: "center",
    padding: "26px 20px",
  },
  previewTitle: {
    fontSize: "1.2rem",
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: "#fafafe",
  },
  previewSubtitle: {
    color: "rgba(255,255,255,0.42)",
    lineHeight: 1.55,
  },
  chatShell: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.55fr)",
    gap: 20,
    padding: "24px",
  },
  chatPanel: {
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: 26,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(15,15,19,0.92)",
    overflow: "hidden",
  },
  chatMessages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "22px",
    display: "grid",
    gap: 12,
    background:
      "radial-gradient(circle at top, rgba(181,140,255,0.07), transparent 24%), rgba(15,15,19,0.92)",
  },
  chatBubble: {
    maxWidth: "72%",
    padding: "13px 15px",
    borderRadius: 20,
  },
  chatBubbleMine: {
    background: "linear-gradient(135deg, #b58cff 0%, #9d70ff 100%)",
    color: "#17121d",
    borderTopRightRadius: 8,
  },
  chatBubbleOther: {
    background: "rgba(255,255,255,0.06)",
    color: "#f3f3f6",
    borderTopLeftRadius: 8,
  },
  chatText: {
    fontSize: "0.94rem",
    lineHeight: 1.6,
    wordBreak: "break-word",
  },
  chatMeta: {
    marginTop: 8,
    display: "flex",
    justifyContent: "flex-end",
    gap: 4,
    fontSize: "0.66rem",
    opacity: 0.65,
    alignItems: "center",
  },
  chatImage: {
    width: "100%",
    maxWidth: 260,
    borderRadius: 14,
    display: "block",
    marginBottom: 10,
  },
  typingBubble: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "11px 13px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.06)",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.8)",
    animation: "dashboardTyping 1s infinite",
  },
  imagePreviewRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 22px 12px",
  },
  imagePreview: {
    width: 58,
    height: 58,
    borderRadius: 14,
    objectFit: "cover",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  closePreview: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    border: "none",
    color: "#f5f5f8",
    display: "grid",
    placeItems: "center",
  },
  composer: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) 44px",
    gap: 10,
    padding: "0 22px 22px",
    alignItems: "center",
  },
  composerInput: {
    width: "100%",
    minWidth: 0,
    height: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.04)",
    color: "#f7f7fb",
    padding: "0 15px",
    outline: "none",
    fontSize: "16px",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: "none",
    background: "linear-gradient(135deg, #b58cff 0%, #9d70ff 100%)",
    color: "#17121d",
    display: "grid",
    placeItems: "center",
  },
  chatInfoPanel: {
    minHeight: 0,
  },
  callStage: {
    flex: 1,
    position: "relative",
    background: "#000",
    minHeight: 0,
  },
  endCallButton: {
    position: "absolute",
    right: 16,
    bottom: 16,
    zIndex: 2,
    minHeight: 42,
    padding: "0 16px",
    borderRadius: 999,
    border: "none",
    background: "#ff5d5d",
    color: "#fff",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 800,
  },
  profileLayout: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, 0.85fr) minmax(0, 1fr) minmax(0, 1fr)",
    gap: 20,
  },
  profileHero: {
    padding: "28px 24px",
    borderRadius: 28,
    background:
      "radial-gradient(circle at top, rgba(181,140,255,0.18), transparent 34%), rgba(15,15,19,0.92)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "grid",
    justifyItems: "center",
    alignContent: "start",
    gap: 12,
    textAlign: "center",
  },
  profileHalo: {
    width: 150,
    height: 150,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle, rgba(181,140,255,0.18), rgba(181,140,255,0.04) 72%)",
  },
  profileName: {
    margin: 0,
    fontSize: "2rem",
    fontWeight: 800,
    letterSpacing: "-0.05em",
    color: "#fafafe",
  },
  profileHandle: {
    color: "rgba(255,255,255,0.34)",
    fontWeight: 800,
    fontSize: "0.86rem",
    letterSpacing: "0.06em",
  },
  profileStatsGrid: {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 8,
  },
  infoCard: {
    padding: "18px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  infoHead: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: "0.96rem",
    fontWeight: 700,
    color: "#f7f7fb",
    marginBottom: 4,
  },
  infoCaption: {
    fontSize: "0.8rem",
    color: "rgba(255,255,255,0.4)",
  },
  infoParagraph: {
    margin: 0,
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.7,
  },
  acceptButton: {
    minHeight: 36,
    padding: "0 14px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #b58cff 0%, #9d70ff 100%)",
    color: "#17121d",
    fontWeight: 800,
  },
  infoRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 16px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.62)",
  },
  blockedRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },
  ghostAction: {
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#f7f7fb",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontWeight: 700,
    flexShrink: 0,
  },
  logoutButton: {
    marginTop: "auto",
    minHeight: 48,
    borderRadius: 16,
    border: "1px solid rgba(255,92,92,0.18)",
    background: "rgba(255,92,92,0.08)",
    color: "#ff9090",
    fontWeight: 800,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    background: "rgba(8,8,12,0.9)",
    backdropFilter: "blur(18px)",
    display: "grid",
    placeItems: "center",
    gap: 14,
    textAlign: "center",
    padding: 20,
  },
  overlayTitle: {
    fontSize: "1.55rem",
    fontWeight: 800,
    letterSpacing: "-0.04em",
    color: "#fafafe",
  },
  overlayText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "0.92rem",
  },
  overlayDanger: {
    minHeight: 46,
    padding: "0 18px",
    borderRadius: 999,
    border: "none",
    background: "#ff5d5d",
    color: "#fff",
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  overlayRoundDanger: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "none",
    background: "#ff5d5d",
    color: "#fff",
    display: "grid",
    placeItems: "center",
  },
  overlayRoundAccept: {
    width: 58,
    height: 58,
    borderRadius: "50%",
    border: "none",
    background: "#29d96f",
    color: "#0f1612",
    display: "grid",
    placeItems: "center",
  },
  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: "#29d96f",
    border: "2px solid #121217",
  },
};
