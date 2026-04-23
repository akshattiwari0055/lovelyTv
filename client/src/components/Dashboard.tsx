import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  Bell,
  Compass,
  Flame,
  Home,
  Lock,
  MessageCircle,
  Send,
  ShieldBan,
  UserCircle2,
  UserPlus,
  Users,
  Camera,
  Phone,
  ImagePlus,
  Check,
  CheckCheck
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { AppNotification, BlockedUserEntry, FriendRequest, Message, User } from "../types";
import { VideoRoom } from "./VideoRoom";

// Re-implementing getConversationRoom locally so we can generate deterministic call room IDs
function getConversationRoom(userA: string, userB: string) {
  const [first, second] = [userA, userB].sort();
  return `call-${first}-${second}`;
}

type DashboardProps = {
  token: string;
  user: User;
  onLogout: () => void;
};

type AppTab = "home" | "discover" | "chat" | "profile";

export function Dashboard({ token, user, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  
  const [zegoConfig, setZegoConfig] = useState<{ appId: number, serverSecret: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ roomId: string, isVideo: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string, callerName: string, isVideo: boolean, roomId: string } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ roomId: string, isVideo: boolean, receiverName: string } | null>(null);
  
  const [discoverUsers, setDiscoverUsers] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messageInput, setMessageInput] = useState("");
  const [status, setStatus] = useState("Ready to explore the campus network.");
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  
  // New Feature States
  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const selectedFriendName = useMemo(() => selectedFriend?.fullName ?? "Friends", [selectedFriend]);
  const selectedFriendId = selectedFriend?.id ?? null;
  const suggestedStudents = useMemo(() => discoverUsers.slice(0, 6), [discoverUsers]);
  const pendingCount = requests.length;
  const recentFriends = useMemo(() => friends.slice(0, 5), [friends]);
  const conversationIsOpen = activeTab === "chat" && !!selectedFriendId;

  const formatMessageTime = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit"
    });

  const getFriendSubline = (friend: User) => {
    if (friend.interests) return friend.interests;
    if (friend.course && friend.year) return `${friend.course} • ${friend.year} Year`;
    if (friend.course) return friend.course;
    return "Available to chat";
  };

  const formatUnreadBadge = (count: number) => {
    if (count >= 4) return "4+";
    return `+${count}`;
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".dashboard-reveal", {
        y: 24,
        opacity: 0,
        duration: 0.65,
        stagger: 0.08,
        ease: "power3.out"
      });
    }, shellRef);

    return () => ctx.revert();
  }, [activeTab, friends.length, notifications.length]);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (message: Message) => {
      setMessages((current) => (current.some((entry) => entry.id === message.id) ? current : [...current, message]));

      if (selectedFriendId === message.senderId && conversationIsOpen && document.visibilityState === "visible") {
        socket.emit("message:read", { messageIds: [message.id], senderId: message.senderId });
        setUnreadCounts((current) => {
          if (!current[message.senderId]) {
            return current;
          }

          return { ...current, [message.senderId]: 0 };
        });
      } else if (message.senderId !== user.id) {
        setUnreadCounts((current) => ({
          ...current,
          [message.senderId]: Math.min((current[message.senderId] ?? 0) + 1, 4)
        }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[], readerId: string }) => {
      setMessages(current => 
        current.map(msg => messageIds.includes(msg.id) ? { ...msg, isRead: true } : msg)
      );
    });

    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriend && selectedFriend.id === typerId) setPartnerTyping(true);
    });

    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriend && selectedFriend.id === typerId) setPartnerTyping(false);
    });

    socket.on("call:incoming", (payload: { callerId: string, callerName: string, isVideo: boolean, roomId: string }) => {
      setIncomingCall(payload);
    });

    socket.on("call:accepted", ({ roomId }: { roomId: string }) => {
      setOutgoingCall(current => {
        if (current && current.roomId === roomId) {
          setActiveCall({ roomId, isVideo: current.isVideo });
          return null;
        }
        return current;
      });
      setStatus("Call connected.");
    });

    socket.on("call:declined", () => {
      setOutgoingCall(null);
      setStatus("Call declined.");
    });

    socket.on("notification:new", (notification: AppNotification) => {
      setNotifications((current) => [notification, ...current].slice(0, 20));
      setStatus(notification.message);
      void Promise.all([loadFriends(), loadRequests()]);
    });

    socket.on("message:error", (payload: { message: string }) => {
      setStatus(payload.message);
    });

    return () => {
      socket.off("message:new");
      socket.off("message:read:update");
      socket.off("typing:started");
      socket.off("typing:stopped");
      socket.off("call:incoming");
      socket.off("call:accepted");
      socket.off("call:declined");
      socket.off("notification:new");
      socket.off("message:error");
      disconnectSocket();
    };
  }, [token, selectedFriendId, conversationIsOpen, user.id]);

  useEffect(() => {
    void Promise.all([
      loadDiscover(), 
      loadFriends(), 
      loadRequests(), 
      loadBlockedUsers(),
      api.get("/zego-config").then(res => setZegoConfig(res.data))
    ]);
  }, [courseFilter, yearFilter]);

  useEffect(() => {
    if (!selectedFriendId) {
      return;
    }

    const socket = getSocket();
    socket?.emit("join:conversation", { otherUserId: selectedFriendId });
    void loadConversation(selectedFriendId, conversationIsOpen && document.visibilityState === "visible");
  }, [selectedFriendId, conversationIsOpen]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !selectedFriendId || !conversationIsOpen) {
        return;
      }

      void loadConversation(selectedFriendId, true);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [selectedFriendId, conversationIsOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, partnerTyping, imagePreview]);

  async function loadDiscover() {
    const params = new URLSearchParams();
    if (courseFilter) params.append("course", courseFilter);
    if (yearFilter) params.append("year", yearFilter);
    
    const url = `/discover${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await api.get(url);
    setDiscoverUsers(response.data);
  }

  async function loadFriends() {
    const response = await api.get("/friends");
    setFriends(response.data);
    if (!selectedFriend && response.data.length > 0) {
      setSelectedFriend(response.data[0]);
    }
  }

  async function loadRequests() {
    const response = await api.get("/friend-requests");
    setRequests(response.data);
  }

  async function loadBlockedUsers() {
    const response = await api.get("/blocked-users");
    setBlockedUsers(response.data);
  }

  async function loadConversation(otherUserId: string, markAsRead = false) {
    const response = await api.get(`/messages/${otherUserId}`);
    const fetchedMessages: Message[] = response.data.messages;
    setMessages(fetchedMessages);

    const unreadFromThem = fetchedMessages.filter((msg) => msg.senderId === otherUserId && !msg.isRead).map((msg) => msg.id);

    if (markAsRead && unreadFromThem.length > 0) {
      const socket = getSocket();
      socket?.emit("message:read", { messageIds: unreadFromThem, senderId: otherUserId });

      setMessages((current) => current.map((msg) => (unreadFromThem.includes(msg.id) ? { ...msg, isRead: true } : msg)));
    }

    if (markAsRead) {
      setUnreadCounts((current) => {
        if (!current[otherUserId]) {
          return current;
        }

        return { ...current, [otherUserId]: 0 };
      });
    }
  }

  async function sendFriendRequest(receiverId: string) {
    await api.post("/friend-requests", { receiverId });
    setStatus("You are now friends!");
    void Promise.all([loadFriends(), loadDiscover()]);
  }

  async function acceptRequest(requestId: string) {
    await api.post(`/friend-requests/${requestId}/accept`);
    setStatus("Friend request accepted.");
    const acceptedNotification: AppNotification = {
      id: `local-${requestId}`,
      type: "system",
      message: "Friend request accepted. You can start chatting now.",
      createdAt: new Date().toISOString()
    };
    setNotifications((current) => [acceptedNotification, ...current].slice(0, 20));
    await Promise.all([loadFriends(), loadRequests()]);
  }

  async function unblockUser(blockedUserId: string) {
    await api.delete(`/users/${blockedUserId}/block`);
    setStatus("User unblocked.");
    await Promise.all([loadBlockedUsers(), loadDiscover(), loadFriends(), loadRequests()]);
  }

  function handleStartCall(isVideo: boolean) {
    if (!selectedFriend) return;
    const roomId = getConversationRoom(user.id, selectedFriend.id);
    setOutgoingCall({ roomId, isVideo, receiverName: selectedFriend.fullName });
    const socket = getSocket();
    socket?.emit("call:initiate", { receiverId: selectedFriend.id, isVideo, roomId });
    setStatus("Calling...");
  }

  function handleAcceptCall() {
    if (!incomingCall) return;
    const socket = getSocket();
    socket?.emit("call:accept", { callerId: incomingCall.callerId, roomId: incomingCall.roomId });
    
    // Auto switch to chat tab with the caller if they are a friend
    const friend = friends.find(f => f.id === incomingCall.callerId);
    if (friend) {
      setSelectedFriend(friend);
      setActiveTab("chat");
    }
    
    setActiveCall({ roomId: incomingCall.roomId, isVideo: incomingCall.isVideo });
    setIncomingCall(null);
  }

  function handleDeclineCall() {
    if (!incomingCall) return;
    const socket = getSocket();
    socket?.emit("call:decline", { callerId: incomingCall.callerId });
    setIncomingCall(null);
  }

  function handleCancelCall() {
    // If we want to cancel before they answer, we can just decline it from our side or send a drop event.
    // Since we don't have a drop event, we'll just decline our own call and let them figure it out, or add drop later.
    setOutgoingCall(null);
    setStatus("Call cancelled.");
  }

  function handleSendMessage(event: FormEvent) {
    event.preventDefault();

    if (!selectedFriend || (!messageInput.trim() && !imagePreview)) {
      return;
    }

    const socket = getSocket();
    socket?.emit("message:send", {
      receiverId: selectedFriend.id,
      content: messageInput,
      imageUrl: imagePreview
    });
    
    socket?.emit("typing:stop", { receiverId: selectedFriend.id });

    setMessageInput("");
    setImagePreview(null);
  }

  function handleTyping(e: React.ChangeEvent<HTMLInputElement>) {
    setMessageInput(e.target.value);
    
    if (!selectedFriend) return;
    
    const socket = getSocket();
    
    if (!isTyping) {
      setIsTyping(true);
      socket?.emit("typing:start", { receiverId: selectedFriend.id });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit("typing:stop", { receiverId: selectedFriend.id });
    }, 2000);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  const renderHome = () => (
    <>
      <section className="ome-hero-card dashboard-reveal">
        <div className="ome-hero-copy">
          <p className="eyebrow">LIVE RANDOM CHAT</p>
          <h1>Jump into the next conversation, OmeTV style.</h1>
          <p>{status}</p>
        </div>
        <div className="ome-hero-actions">
          <button className="ome-start-button" onClick={() => navigate("/app/random")}>
            <Flame size={22} />
            Start Random Chat
          </button>
        </div>
      </section>

      <div className="dashboard-home-grid dashboard-reveal">
        <section className="ome-section">
          <div className="ome-section-head">
            <h3>Suggested students</h3>
            <button className="ome-link-button" onClick={() => setActiveTab("discover")}>
              View all
            </button>
          </div>
          <div className="suggested-grid">
            {suggestedStudents.map((student) => (
              <article className="suggested-card" key={student.id}>
                <div className="suggested-avatar">{student.fullName.slice(0, 1).toUpperCase()}</div>
                <div className="suggested-copy">
                  <strong>{student.fullName}</strong>
                  <span>{student.interests || "Exploring campus life"}</span>
                </div>
                <button className="ghost-button compact-button" onClick={() => void sendFriendRequest(student.id)}>
                  <UserPlus size={16} />
                  Connect
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="ome-section">
          <div className="ome-section-head">
            <h3>Friends</h3>
            <button className="ome-link-button" onClick={() => setActiveTab("chat")}>
              Open chats
            </button>
          </div>
          <div className="friends-preview-list">
            {recentFriends.length === 0 ? <div className="empty-card">No friends yet. Accept a request to start chatting.</div> : null}
            {recentFriends.map((friend) => (
              <button
                className="friend-preview-card"
                key={friend.id}
                onClick={() => {
                  setSelectedFriend(friend);
                  setActiveTab("chat");
                }}
              >
                <span className="suggested-avatar small">{friend.fullName.slice(0, 1).toUpperCase()}</span>
                <span>{friend.fullName}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );

  const renderDiscover = () => (
    <section className="ome-section dashboard-reveal">
      <div className="ome-section-head">
        <div>
          <h3>Discover students</h3>
          <span>{discoverUsers.length} students</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Filter Course (e.g. CSE)"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
          />
          <input
            type="text"
            placeholder="Filter Year (e.g. 2nd)"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
          />
        </div>
      </div>
      <div className="discover-list">
        {discoverUsers.map((student) => (
          <article className="discover-card" key={student.id}>
            <div className="suggested-avatar large">{student.fullName.slice(0, 1).toUpperCase()}</div>
            <div className="discover-copy">
              <strong>{student.fullName}</strong>
              <span>
                {student.course && student.year ? `${student.course} • ${student.year} Year` : student.email}
              </span>
              {student.mutualConnections !== undefined && student.mutualConnections > 0 && (
                <span style={{ color: "#ffb84a", fontSize: "0.85rem", fontWeight: 600 }}>
                  <Users size={12} style={{ display: "inline", marginRight: "4px" }} />
                  {student.mutualConnections} mutual friend{student.mutualConnections > 1 ? "s" : ""}
                </span>
              )}
              <p>{student.bio || "New to LPU TV."}</p>
            </div>
            <button className="primary-button compact-button" onClick={() => void sendFriendRequest(student.id)}>
              Add Friend
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const renderChat = () => (
    <section className="ome-chat-layout insta-chat-layout dashboard-reveal">
      <div className="ome-chat-sidebar insta-chat-sidebar">
        <div className="insta-sidebar-header">
          <div>
            <p className="insta-sidebar-label">Inbox</p>
            <h3>Messages</h3>
          </div>
          <span>{friends.length} chats</span>
        </div>
        <div className="insta-sidebar-pill-row">
          <button className="insta-filter-pill active" type="button">Primary</button>
          <button className="insta-filter-pill" type="button">Friends</button>
        </div>
        <div className="chat-friend-list insta-thread-list">
          {friends.length === 0 ? <div className="empty-card">No friends yet. Accept requests to unlock chats.</div> : null}
          {friends.map((friend) => (
            <button
              className={selectedFriend?.id === friend.id ? "chat-friend-chip insta-thread active" : "chat-friend-chip insta-thread"}
              key={friend.id}
              onClick={() => setSelectedFriend(friend)}
            >
              <span className="suggested-avatar insta-thread-avatar">{friend.fullName.slice(0, 1).toUpperCase()}</span>
              <span className="chat-friend-meta insta-thread-meta">
                <span className="insta-thread-head">
                  <strong>{friend.fullName}</strong>
                  {unreadCounts[friend.id] ? (
                    <span className="insta-unread-badge">{formatUnreadBadge(unreadCounts[friend.id])}</span>
                  ) : (
                    <small>{selectedFriend?.id === friend.id ? "Open now" : "DM"}</small>
                  )}
                </span>
                <small>{getFriendSubline(friend)}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="ome-chat-panel insta-chat-panel" style={{ display: "flex", flexDirection: "column" }}>
        {activeCall && zegoConfig && selectedFriend ? (
          <div style={{ flex: 1, position: "relative", borderRadius: "16px", overflow: "hidden", background: "#000" }}>
            <VideoRoom
              appId={zegoConfig.appId}
              serverSecret={zegoConfig.serverSecret}
              roomId={activeCall.roomId}
              userId={user.id}
              userName={user.fullName}
              isAudioOnly={!activeCall.isVideo}
              onJoined={() => setStatus("Call started.")}
            />
            
            {!activeCall.isVideo && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(10, 14, 23, 0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(10px)" }}>
                <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "linear-gradient(135deg, #ffc55d, #ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", fontWeight: "bold", color: "#fff", marginBottom: "24px", boxShadow: "0 0 40px rgba(255, 197, 93, 0.3)" }}>
                  {selectedFriendName.charAt(0).toUpperCase()}
                </div>
                <h3 style={{ margin: 0, color: "#fff", fontSize: "1.5rem" }}>{selectedFriendName}</h3>
                <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "8px" }}>Audio Call in progress...</p>
              </div>
            )}
            
            <button 
              onClick={() => setActiveCall(null)}
              style={{ position: "absolute", top: "20px", right: "20px", background: "rgba(255,107,107,0.9)", padding: "10px 20px", borderRadius: "20px", border: "none", color: "white", cursor: "pointer", zIndex: 9999, fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Phone size={16} style={{ transform: "rotate(135deg)" }} />
              End Call
            </button>
          </div>
        ) : (
          <>
            <div className="insta-chat-header">
              <div className="insta-chat-profile">
                <div className="insta-chat-avatar">{selectedFriendName.slice(0, 1).toUpperCase()}</div>
                <div>
                  <h3>{selectedFriendName}</h3>
                  <span>{partnerTyping ? "typing..." : selectedFriend ? getFriendSubline(selectedFriend) : "Choose a friend to start chatting"}</span>
                </div>
              </div>
              {selectedFriend && (
                <div className="insta-chat-actions">
                  <button className="ghost-button compact-button insta-action-button" onClick={() => handleStartCall(false)}>
                    <Phone size={18} />
                  </button>
                  <button className="ghost-button compact-button insta-action-button" onClick={() => handleStartCall(true)}>
                    <Camera size={18} />
                  </button>
                </div>
              )}
            </div>

            <div className="messages-box ome-messages-box insta-messages-box" style={{ flex: 1 }}>
              {messages.length === 0 ? <div className="empty-card">Start the conversation with your friend.</div> : null}
              {messages.map((message) => {
                const isMine = message.senderId === user.id;
                return (
                  <div className={isMine ? "insta-message-row mine" : "insta-message-row"} key={message.id}>
                    <div className={isMine ? "message mine insta-message-bubble" : "message insta-message-bubble"}>
                      {message.imageUrl && <img src={message.imageUrl} alt="attached" className="insta-message-image" />}
                      {message.content && <span>{message.content}</span>}
                      <div className="insta-message-meta">
                        <small>{formatMessageTime(message.createdAt)}</small>
                        {isMine ? (
                          message.isRead ? <CheckCheck size={14} color="#7ce9d6" /> : <Check size={14} color="#8b98ae" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {imagePreview && (
              <div className="insta-preview-card">
                <img src={imagePreview} alt="preview" className="insta-preview-image" />
                <button
                  type="button"
                  className="insta-preview-close"
                  onClick={() => setImagePreview(null)}
                >
                  ×
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="insta-composer">
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
              <button type="button" className="insta-composer-icon" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={18} />
              </button>
              <input
                placeholder="Message..."
                value={messageInput}
                onChange={handleTyping}
                className="insta-composer-input"
              />
              <button
                type="submit"
                className={messageInput.trim() || imagePreview ? "insta-send-button active" : "insta-send-button"}
                disabled={!messageInput.trim() && !imagePreview}
              >
                <Send size={18} />
              </button>
            </form>
          </>
        )}
      </div>
    </section>
  );

  const renderProfile = () => (
    <section className="ome-profile-layout dashboard-reveal">
      <article className="profile-card">
        <div className="profile-hero">
          <div className="profile-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div>
            <h3>{user.fullName}</h3>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="profile-stats">
          <div><strong>{friends.length}</strong><span>Friends</span></div>
          <div><strong>{pendingCount}</strong><span>Requests</span></div>
          <div><strong>{discoverUsers.length}</strong><span>Discover</span></div>
        </div>
        <button className="secondary-button" onClick={onLogout}>Logout</button>
      </article>

      <article className="requests-card">
        <div className="ome-section-head">
          <h3>In-app notifications</h3>
          <span>{notifications.length} updates</span>
        </div>
        <div className="requests-list notifications-list">
          {notifications.length === 0 ? <div className="empty-card">No new notifications yet.</div> : null}
          {notifications.map((notification) => (
            <div className="request-item notification-item" key={notification.id}>
              <div>
                <strong>{notification.type === "friend_accept" ? "Friend accepted" : notification.type === "friend_request" ? "New request" : "Update"}</strong>
                <p>{notification.message}</p>
              </div>
            </div>
          ))}
          {requests.map((request) => (
            <div className="request-item" key={request.id}>
              <div>
                <strong>{request.sender.fullName}</strong>
                <p>{request.sender.email}</p>
              </div>
              <button className="primary-button compact-button" onClick={() => void acceptRequest(request.id)}>
                Accept
              </button>
            </div>
          ))}
        </div>
      </article>

      <article className="requests-card blocked-users-card">
        <div className="ome-section-head">
          <h3>Blocked users</h3>
          <span>{blockedUsers.length} hidden</span>
        </div>
        <div className="requests-list blocked-users-list">
          {blockedUsers.length === 0 ? (
            <div className="empty-card">
              <Lock size={18} />
              <span>No blocked users. People you block during random chat will show up here.</span>
            </div>
          ) : null}
          {blockedUsers.map((entry) => (
            <div className="request-item blocked-user-item" key={entry.id}>
              <div>
                <strong>{entry.user.fullName}</strong>
                <p>{entry.user.email}</p>
                {entry.reason ? <small>Reason: {entry.reason}</small> : null}
              </div>
              <button className="secondary-button compact-button" onClick={() => void unblockUser(entry.user.id)}>
                <ShieldBan size={16} />
                Unblock
              </button>
            </div>
          ))}
        </div>
      </article>
    </section>
  );

  return (
    <div className="dashboard-shell ome-dashboard-shell" ref={shellRef}>
      <div className="ome-app-frame">
        <aside className="ome-side-nav">
          <div className="ome-side-brand">
            <div className="profile-mini-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
            <div>
              <span className="ome-app-name">LPU TV</span>
              <p className="ome-app-subtitle">{user.fullName}</p>
            </div>
          </div>

          <div className="ome-side-links">
            <button className={activeTab === "home" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("home")}>
              <Home size={18} />
              <span>Home</span>
            </button>
            <button className={activeTab === "discover" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("discover")}>
              <Compass size={18} />
              <span>Discover</span>
            </button>
            <button className={activeTab === "chat" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("chat")}>
              <MessageCircle size={18} />
              <span>Messages</span>
            </button>
            <button className={activeTab === "profile" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("profile")}>
              <UserCircle2 size={18} />
              <span>Profile</span>
            </button>
          </div>

          <div className="ome-side-friends-section">
            <span className="side-heading">Friends</span>
            <div className="side-friends-list">
              {friends.length === 0 ? <p className="side-empty-text">No friends yet.</p> : null}
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  className={selectedFriend?.id === friend.id && activeTab === "chat" ? "side-friend-chip active" : "side-friend-chip"}
                  onClick={() => {
                    setSelectedFriend(friend);
                    setActiveTab("chat");
                  }}
                >
                  <div className="profile-mini-avatar small">{friend.fullName.slice(0, 1).toUpperCase()}</div>
                  <span className="friend-name">{friend.fullName}</span>
                  {unreadCounts[friend.id] ? <span className="side-unread-badge">{formatUnreadBadge(unreadCounts[friend.id])}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <button className="ghost-button ome-side-logout" onClick={onLogout}>Logout</button>
        </aside>

        <div className="ome-content-shell">
          <header className="ome-topbar dashboard-reveal">
            <div className="ome-brand">
              <div>
                <span className="ome-page-title">
                  {activeTab === "home" ? "Home" : activeTab === "discover" ? "Discover" : activeTab === "chat" ? "Friends & Chat" : "Profile"}
                </span>
                <p className="ome-app-subtitle">Connect with LPU students in real time</p>
              </div>
            </div>

            <button className="ome-notification-btn" onClick={() => setActiveTab("profile")}>
              <Bell size={18} />
              {pendingCount > 0 ? <span className="ome-badge">{pendingCount}</span> : null}
            </button>
          </header>

          <main className={activeTab === "chat" ? "ome-main-content chat-active" : "ome-main-content"}>
            {activeTab === "home" ? renderHome() : null}
            {activeTab === "discover" ? renderDiscover() : null}
            {activeTab === "chat" ? renderChat() : null}
            {activeTab === "profile" ? renderProfile() : null}
          </main>

          <nav className="ome-bottom-nav">
            <button className={activeTab === "home" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("home")}>
              <Home size={18} />
              <span>Home</span>
            </button>
            <button className={activeTab === "discover" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("discover")}>
              <Compass size={18} />
              <span>Discover</span>
            </button>
            <button className={activeTab === "chat" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("chat")}>
              <MessageCircle size={18} />
              <span>Messages</span>
            </button>
            <button className={activeTab === "profile" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => setActiveTab("profile")}>
              <UserCircle2 size={18} />
              <span>Profile</span>
            </button>
          </nav>
        </div>
        
        {/* Outgoing Call Overlay */}
        {outgoingCall && !activeCall && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10, 14, 23, 0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(15px)" }}>
            <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "linear-gradient(135deg, #4ee1b7, #1b8a6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", fontWeight: "bold", color: "#fff", marginBottom: "24px", boxShadow: "0 0 40px rgba(78, 225, 183, 0.3)", animation: "pulse 1.5s infinite" }}>
              {outgoingCall.receiverName.charAt(0).toUpperCase()}
            </div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.8rem" }}>{outgoingCall.receiverName}</h3>
            <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "8px", fontSize: "1.1rem" }}>Calling...</p>
            <button 
              onClick={handleCancelCall}
              style={{ marginTop: "40px", background: "rgba(255,107,107,0.9)", padding: "16px 32px", borderRadius: "30px", border: "none", color: "white", cursor: "pointer", fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Phone size={20} style={{ transform: "rotate(135deg)" }} />
              Cancel Call
            </button>
            <style>
              {`
                @keyframes pulse {
                  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(78, 225, 183, 0.4); }
                  70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(78, 225, 183, 0); }
                  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(78, 225, 183, 0); }
                }
              `}
            </style>
          </div>
        )}

        {/* Incoming Call Overlay */}
        {incomingCall && !activeCall && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10, 14, 23, 0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(15px)" }}>
            <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "linear-gradient(135deg, #ffc55d, #ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", fontWeight: "bold", color: "#fff", marginBottom: "24px", boxShadow: "0 0 40px rgba(255, 197, 93, 0.3)", animation: "pulse 1.5s infinite" }}>
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.8rem" }}>{incomingCall.callerName}</h3>
            <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "8px", fontSize: "1.1rem" }}>
              Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call...
            </p>
            <div style={{ display: "flex", gap: "20px", marginTop: "40px" }}>
              <button 
                onClick={handleDeclineCall}
                style={{ background: "rgba(255,107,107,0.9)", padding: "16px", borderRadius: "50%", border: "none", color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px" }}
              >
                <Phone size={28} style={{ transform: "rotate(135deg)" }} />
              </button>
              <button 
                onClick={handleAcceptCall}
                style={{ background: "#4ee1b7", padding: "16px", borderRadius: "50%", border: "none", color: "#000", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px" }}
              >
                {incomingCall.isVideo ? <Camera size={28} /> : <Phone size={28} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
