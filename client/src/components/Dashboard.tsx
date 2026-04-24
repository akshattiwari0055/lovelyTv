import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  Compass,
  Flame,
  Home,
  Lock,
  Menu,
  MessageCircle,
  Search,
  Send,
  ShieldBan,
  UserCircle2,
  UserPlus,
  Users,
  X,
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
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(false);
  
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
  const recentFriends = useMemo(() => friends.slice(0, 4), [friends]);
  const conversationIsOpen = activeTab === "chat" && !!selectedFriendId;
  const currentTitle = activeTab === "home" ? "Campus Connect" : activeTab === "discover" ? "Discover" : activeTab === "chat" ? "Messages" : "Profile";

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

  function handleNavigate(tab: AppTab) {
    setActiveTab(tab);
    setIsLeftMenuOpen(false);
  }

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

  import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  Flame,
  Home,
  Lock,
  Menu,
  MessageCircle,
  Search,
  Send,
  ShieldBan,
  UserCircle2,
  UserPlus,
  Users,
  X,
  Camera,
  Phone,
  ImagePlus,
  Check,
  CheckCheck,
  Compass,
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { AppNotification, BlockedUserEntry, FriendRequest, Message, User } from "../types";
import { VideoRoom } from "./VideoRoom";

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

  const [zegoConfig, setZegoConfig] = useState<{ appId: number; serverSecret: string } | null>(null);
  const [activeCall, setActiveCall] = useState<{ roomId: string; isVideo: boolean } | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callerName: string; isVideo: boolean; roomId: string } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{ roomId: string; isVideo: boolean; receiverName: string } | null>(null);

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
  const [isLeftMenuOpen, setIsLeftMenuOpen] = useState(false);

  const [courseFilter, setCourseFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const selectedFriendName = useMemo(() => selectedFriend?.fullName ?? "Friends", [selectedFriend]);
  const selectedFriendId = selectedFriend?.id ?? null;
  const suggestedStudents = useMemo(() => discoverUsers.slice(0, 6), [discoverUsers]);
  const pendingCount = requests.length;
  const recentFriends = useMemo(() => friends.slice(0, 3), [friends]);
  const conversationIsOpen = activeTab === "chat" && !!selectedFriendId;
  const currentTitle =
    activeTab === "home" ? "Campus Connect" :
    activeTab === "discover" ? "Discover" :
    activeTab === "chat" ? "Messages" : "Profile";

  const formatMessageTime = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const getFriendSubline = (friend: User) => {
    if (friend.interests) return friend.interests;
    if (friend.course && friend.year) return `${friend.course} • ${friend.year} Year`;
    if (friend.course) return friend.course;
    return "Available to chat";
  };

  const formatUnreadBadge = (count: number) => (count >= 4 ? "4+" : `+${count}`);

  function handleNavigate(tab: AppTab) {
    setActiveTab(tab);
    setIsLeftMenuOpen(false);
  }

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".dashboard-reveal", {
        y: 20,
        opacity: 0,
        duration: 0.55,
        stagger: 0.07,
        ease: "power3.out",
      });
    }, shellRef);
    return () => ctx.revert();
  }, [activeTab, friends.length, notifications.length]);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("message:new", (message: Message) => {
      setMessages((current) => (current.some((e) => e.id === message.id) ? current : [...current, message]));
      if (selectedFriendId === message.senderId && conversationIsOpen && document.visibilityState === "visible") {
        socket.emit("message:read", { messageIds: [message.id], senderId: message.senderId });
        setUnreadCounts((current) => (!current[message.senderId] ? current : { ...current, [message.senderId]: 0 }));
      } else if (message.senderId !== user.id) {
        setUnreadCounts((current) => ({
          ...current,
          [message.senderId]: Math.min((current[message.senderId] ?? 0) + 1, 4),
        }));
      }
    });

    socket.on("message:read:update", ({ messageIds }: { messageIds: string[]; readerId: string }) => {
      setMessages((current) => current.map((msg) => (messageIds.includes(msg.id) ? { ...msg, isRead: true } : msg)));
    });

    socket.on("typing:started", ({ typerId }: { typerId: string }) => {
      if (selectedFriend && selectedFriend.id === typerId) setPartnerTyping(true);
    });

    socket.on("typing:stopped", ({ typerId }: { typerId: string }) => {
      if (selectedFriend && selectedFriend.id === typerId) setPartnerTyping(false);
    });

    socket.on("call:incoming", (payload: { callerId: string; callerName: string; isVideo: boolean; roomId: string }) => {
      setIncomingCall(payload);
    });

    socket.on("call:accepted", ({ roomId }: { roomId: string }) => {
      setOutgoingCall((current) => {
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
      api.get("/zego-config").then((res) => setZegoConfig(res.data)),
    ]);
  }, [courseFilter, yearFilter]);

  useEffect(() => {
    if (!selectedFriendId) return;
    const socket = getSocket();
    socket?.emit("join:conversation", { otherUserId: selectedFriendId });
    void loadConversation(selectedFriendId, conversationIsOpen && document.visibilityState === "visible");
  }, [selectedFriendId, conversationIsOpen]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !selectedFriendId || !conversationIsOpen) return;
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
    if (!selectedFriend && response.data.length > 0) setSelectedFriend(response.data[0]);
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
      setUnreadCounts((current) => (!current[otherUserId] ? current : { ...current, [otherUserId]: 0 }));
    }
  }

  async function sendFriendRequest(receiverId: string) {
    await api.post("/friend-requests", { receiverId });
    setStatus("Friend request sent!");
    void Promise.all([loadFriends(), loadDiscover()]);
  }

  async function acceptRequest(requestId: string) {
    await api.post(`/friend-requests/${requestId}/accept`);
    setStatus("Friend request accepted.");
    const acceptedNotification: AppNotification = {
      id: `local-${requestId}`,
      type: "system",
      message: "Friend request accepted. You can start chatting now.",
      createdAt: new Date().toISOString(),
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
    const friend = friends.find((f) => f.id === incomingCall.callerId);
    if (friend) { setSelectedFriend(friend); setActiveTab("chat"); }
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
    setOutgoingCall(null);
    setStatus("Call cancelled.");
  }

  function handleSendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedFriend || (!messageInput.trim() && !imagePreview)) return;
    const socket = getSocket();
    socket?.emit("message:send", { receiverId: selectedFriend.id, content: messageInput, imageUrl: imagePreview });
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
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket?.emit("typing:stop", { receiverId: selectedFriend.id });
    }, 2000);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  // ─── RENDER HOME ───────────────────────────────────────────────────────────
  const renderHome = () => (
    <>
      <style>{`
        /* ── HERO ───────────────────────────────── */
        .hero-card {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #0d2137 0%, #0a1628 55%, #111a2e 100%);
          border: 1px solid rgba(255,184,74,0.22);
          border-radius: 20px;
          padding: 32px 28px 28px;
          margin-bottom: 24px;
        }
        .hero-glow {
          position: absolute;
          top: -80px; right: -80px;
          width: 320px; height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,184,74,0.14) 0%, transparent 70%);
          pointer-events: none;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(255,184,74,0.12);
          border: 1px solid rgba(255,184,74,0.32);
          border-radius: 100px;
          padding: 5px 14px;
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #ffb84a;
          margin-bottom: 16px;
        }
        .hero-badge-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #ffb84a;
          animation: lpublink 1.4s infinite;
        }
        @keyframes lpublink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .hero-title {
          font-size: clamp(1.5rem, 3.5vw, 2.1rem);
          font-weight: 800;
          line-height: 1.2;
          color: #fff;
          margin: 0 0 10px;
          letter-spacing: -0.02em;
        }
        .hero-title-accent {
          background: linear-gradient(90deg, #ffb84a, #ff8c42);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-sub {
          font-size: 0.88rem;
          color: rgba(255,255,255,0.45);
          margin: 0 0 24px;
        }
        .hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          color: #1a0e00;
          font-weight: 700;
          font-size: 0.92rem;
          padding: 13px 26px;
          border-radius: 100px;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(255,140,66,0.38);
          transition: transform 0.18s, box-shadow 0.18s;
        }
        .hero-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(255,140,66,0.55); }
        .hero-cta:active { transform: translateY(0); }

        /* ── HOME SECTIONS ──────────────────────── */
        .home-section { margin-bottom: 28px; }
        .home-section-head {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .home-section-title {
          font-size: 1rem; font-weight: 700; color: #fff; margin: 0;
        }
        .home-link-btn {
          font-size: 0.82rem; font-weight: 600;
          color: #ffb84a; background: none; border: none;
          cursor: pointer; padding: 0; transition: opacity 0.15s;
        }
        .home-link-btn:hover { opacity: 0.65; }
        .home-empty {
          background: rgba(255,255,255,0.03);
          border: 1px dashed rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 18px 20px;
          color: rgba(255,255,255,0.38);
          font-size: 0.88rem;
          text-align: center;
        }

        /* ── SUGGESTED GRID ─────────────────────── */
        .suggested-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }
        .suggested-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 18px 14px 14px;
          display: flex; flex-direction: column;
          align-items: center; gap: 8px;
          text-align: center;
          transition: background 0.18s, border-color 0.18s;
        }
        .suggested-card:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,184,74,0.28);
        }
        .s-card-avatar {
          width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.3rem; font-weight: 800; color: #1a0e00; flex-shrink: 0;
        }
        .s-card-name { font-size: 0.88rem; font-weight: 700; color: #fff; }
        .s-card-sub { font-size: 0.74rem; color: rgba(255,255,255,0.42); }
        .connect-btn {
          display: inline-flex; align-items: center; gap: 5px;
          background: rgba(255,184,74,0.1);
          border: 1px solid rgba(255,184,74,0.28);
          border-radius: 100px; padding: 6px 14px;
          font-size: 0.76rem; font-weight: 600; color: #ffb84a;
          cursor: pointer; margin-top: 4px;
          transition: background 0.15s, transform 0.15s;
        }
        .connect-btn:hover { background: rgba(255,184,74,0.2); transform: scale(1.03); }

        /* ── FRIENDS STACK ──────────────────────── */
        .friends-list-stack { display: flex; flex-direction: column; gap: 8px; }
        .friend-row {
          display: flex; align-items: center; gap: 13px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; padding: 12px 16px;
          cursor: pointer; text-align: left; width: 100%;
          transition: background 0.15s, border-color 0.15s;
        }
        .friend-row:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,184,74,0.22);
        }
        .friend-row-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: linear-gradient(135deg, #4ee1b7, #1b8a6b);
          display: flex; align-items: center; justify-content: center;
          font-size: 1rem; font-weight: 800; color: #fff; flex-shrink: 0;
        }
        .friend-row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .friend-row-name {
          font-size: 0.9rem; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .friend-row-sub { font-size: 0.76rem; color: rgba(255,255,255,0.4); }
        .friend-unread-dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: #ffb84a; flex-shrink: 0;
        }
        .friend-row-arrow { color: rgba(255,255,255,0.22); font-size: 1.2rem; }

        @media (max-width: 600px) {
          .hero-card { padding: 22px 18px 20px; }
          .suggested-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* HERO */}
      <section className="hero-card dashboard-reveal">
        <div className="hero-glow" />
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          LIVE RANDOM CHAT
        </div>
        <h1 className="hero-title">
          Talk to someone new<br />
          <span className="hero-title-accent">from campus</span> in a tap.
        </h1>
        <p className="hero-sub">{status}</p>
        <button className="hero-cta" onClick={() => navigate("/app/random")}>
          <Flame size={18} />
          Start Random Chat
        </button>
      </section>

      {/* SUGGESTED STUDENTS */}
      <section className="home-section dashboard-reveal">
        <div className="home-section-head">
          <h3 className="home-section-title">Suggested students</h3>
          <button className="home-link-btn" onClick={() => setActiveTab("discover")}>View all</button>
        </div>
        <div className="suggested-grid">
          {suggestedStudents.map((student) => (
            <article className="suggested-card" key={student.id}>
              <div className="s-card-avatar">{student.fullName.slice(0, 1).toUpperCase()}</div>
              <strong className="s-card-name">{student.fullName}</strong>
              <span className="s-card-sub">{student.interests || "Exploring campus life"}</span>
              <button className="connect-btn" onClick={() => void sendFriendRequest(student.id)}>
                <UserPlus size={13} /> Connect
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ACTIVE FRIENDS */}
      <section className="home-section dashboard-reveal">
        <div className="home-section-head">
          <h3 className="home-section-title">Active friends</h3>
          <button className="home-link-btn" onClick={() => setActiveTab("chat")}>View all</button>
        </div>
        {recentFriends.length === 0 ? (
          <div className="home-empty">No friends yet — accept a request to start chatting.</div>
        ) : (
          <div className="friends-list-stack">
            {recentFriends.map((friend) => (
              <button
                className="friend-row"
                key={friend.id}
                onClick={() => { setSelectedFriend(friend); setActiveTab("chat"); }}
              >
                <span className="friend-row-avatar">{friend.fullName.slice(0, 1).toUpperCase()}</span>
                <span className="friend-row-info">
                  <strong className="friend-row-name">{friend.fullName}</strong>
                  <small className="friend-row-sub">
                    {unreadCounts[friend.id] ? `${formatUnreadBadge(unreadCounts[friend.id])} unread` : getFriendSubline(friend)}
                  </small>
                </span>
                {unreadCounts[friend.id]
                  ? <span className="friend-unread-dot" />
                  : <span className="friend-row-arrow">›</span>
                }
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );

  // ─── RENDER DISCOVER ───────────────────────────────────────────────────────
  const renderDiscover = () => (
    <>
      <style>{`
        .discover-filters {
          display: flex; gap: 10px; flex-wrap: wrap;
        }
        .discover-filter-input {
          flex: 1; min-width: 140px;
          padding: 9px 14px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: #fff; font-size: 0.88rem;
          outline: none; transition: border-color 0.2s;
        }
        .discover-filter-input::placeholder { color: rgba(255,255,255,0.3); }
        .discover-filter-input:focus { border-color: rgba(255,184,74,0.4); }

        .discover-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 14px;
          margin-top: 16px;
        }
        .discover-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px; padding: 20px;
          display: flex; align-items: flex-start; gap: 14px;
          transition: background 0.18s, border-color 0.18s;
        }
        .discover-card:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,184,74,0.22);
        }
        .discover-avatar {
          width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, #a78bfa, #7c3aed);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.3rem; font-weight: 800; color: #fff; flex-shrink: 0;
        }
        .discover-info { flex: 1; min-width: 0; }
        .discover-name { font-size: 0.92rem; font-weight: 700; color: #fff; margin-bottom: 3px; }
        .discover-course { font-size: 0.78rem; color: rgba(255,255,255,0.45); margin-bottom: 4px; }
        .discover-mutual {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 0.76rem; color: #ffb84a; font-weight: 600; margin-bottom: 6px;
        }
        .discover-bio {
          font-size: 0.8rem; color: rgba(255,255,255,0.38);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .discover-add-btn {
          background: rgba(255,184,74,0.1);
          border: 1px solid rgba(255,184,74,0.28);
          border-radius: 10px; padding: 7px 14px;
          font-size: 0.78rem; font-weight: 600; color: #ffb84a;
          cursor: pointer; flex-shrink: 0; align-self: center;
          transition: background 0.15s;
        }
        .discover-add-btn:hover { background: rgba(255,184,74,0.2); }
      `}</style>

      <section className="ome-section dashboard-reveal">
        <div className="ome-section-head" style={{ flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3 style={{ color: "#fff", margin: 0 }}>Discover students</h3>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.4)" }}>{discoverUsers.length} students found</span>
          </div>
          <div className="discover-filters">
            <input
              className="discover-filter-input"
              type="text"
              placeholder="Filter by course (e.g. CSE)"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            />
            <input
              className="discover-filter-input"
              type="text"
              placeholder="Filter by year (e.g. 2nd)"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="discover-grid">
          {discoverUsers.map((student) => (
            <article className="discover-card" key={student.id}>
              <div className="discover-avatar">{student.fullName.slice(0, 1).toUpperCase()}</div>
              <div className="discover-info">
                <div className="discover-name">{student.fullName}</div>
                <div className="discover-course">
                  {student.course && student.year ? `${student.course} • ${student.year} Year` : student.email}
                </div>
                {student.mutualConnections !== undefined && student.mutualConnections > 0 && (
                  <div className="discover-mutual">
                    <Users size={11} />
                    {student.mutualConnections} mutual friend{student.mutualConnections > 1 ? "s" : ""}
                  </div>
                )}
                <div className="discover-bio">{student.bio || "New to LPU TV."}</div>
              </div>
              <button className="discover-add-btn" onClick={() => void sendFriendRequest(student.id)}>
                Add
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );

  // ─── RENDER CHAT ───────────────────────────────────────────────────────────
  const renderChat = () => (
    <>
      <style>{`
        .chat-layout {
          display: flex; height: 100%; gap: 0;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px; overflow: hidden;
        }
        .chat-sidebar {
          width: 280px; flex-shrink: 0;
          border-right: 1px solid rgba(255,255,255,0.07);
          display: flex; flex-direction: column;
          background: rgba(0,0,0,0.2);
        }
        .chat-sidebar-header {
          padding: 18px 16px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
        }
        .chat-sidebar-title { font-size: 1rem; font-weight: 700; color: #fff; margin: 0; }
        .chat-sidebar-req-btn {
          font-size: 0.75rem; font-weight: 600; color: #ffb84a;
          background: rgba(255,184,74,0.1); border: 1px solid rgba(255,184,74,0.2);
          border-radius: 8px; padding: 4px 10px; cursor: pointer;
        }
        .chat-thread-list { flex: 1; overflow-y: auto; padding: 8px; }
        .chat-thread {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 12px; cursor: pointer;
          width: 100%; text-align: left; background: transparent; border: none;
          transition: background 0.15s;
        }
        .chat-thread:hover { background: rgba(255,255,255,0.06); }
        .chat-thread.active { background: rgba(255,184,74,0.08); }
        .chat-thread-avatar {
          width: 40px; height: 40px; border-radius: 50%;
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.95rem; font-weight: 800; color: #1a0e00; flex-shrink: 0;
        }
        .chat-thread-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .chat-thread-name { font-size: 0.88rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-thread-sub { font-size: 0.74rem; color: rgba(255,255,255,0.4); }
        .chat-thread-dot { width: 8px; height: 8px; border-radius: 50%; background: #ffb84a; flex-shrink: 0; }

        /* PANEL */
        .chat-panel { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .chat-panel-header {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; justify-content: space-between;
          background: rgba(0,0,0,0.15);
        }
        .chat-panel-profile { display: flex; align-items: center; gap: 12px; }
        .chat-panel-avatar {
          width: 38px; height: 38px; border-radius: 50%;
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.9rem; font-weight: 800; color: #1a0e00;
        }
        .chat-panel-name { font-size: 0.92rem; font-weight: 700; color: #fff; margin: 0; }
        .chat-panel-sub { font-size: 0.75rem; color: rgba(255,255,255,0.4); margin: 0; }
        .chat-panel-actions { display: flex; gap: 8px; }
        .chat-action-btn {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.09);
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.7); cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .chat-action-btn:hover { background: rgba(255,184,74,0.15); color: #ffb84a; }

        /* MESSAGES */
        .messages-area { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
        .msg-row { display: flex; }
        .msg-row.mine { justify-content: flex-end; }
        .msg-bubble {
          max-width: 68%; padding: 10px 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.08);
          color: #e8eaf0; font-size: 0.88rem; line-height: 1.5;
        }
        .msg-bubble.mine {
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          border-color: transparent;
          color: #1a0e00;
        }
        .msg-image { max-width: 100%; border-radius: 10px; margin-bottom: 6px; display: block; }
        .msg-meta {
          display: flex; align-items: center; gap: 5px; margin-top: 4px;
          justify-content: flex-end;
        }
        .msg-time { font-size: 0.68rem; opacity: 0.6; }
        .typing-bubble {
          display: flex; align-items: center; gap: 4px;
          padding: 10px 14px; border-radius: 18px;
          background: rgba(255,255,255,0.07); width: fit-content;
        }
        .typing-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: rgba(255,255,255,0.5);
          animation: tdot 1.2s infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes tdot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

        /* COMPOSER */
        .chat-composer {
          padding: 12px 16px;
          border-top: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; gap: 10px;
          background: rgba(0,0,0,0.15);
        }
        .composer-icon-btn {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09);
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.5); cursor: pointer; flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .composer-icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .composer-input {
          flex: 1; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px; padding: 10px 14px;
          color: #fff; font-size: 0.88rem; outline: none;
          transition: border-color 0.2s;
        }
        .composer-input::placeholder { color: rgba(255,255,255,0.28); }
        .composer-input:focus { border-color: rgba(255,184,74,0.35); }
        .send-btn {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09);
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3); cursor: pointer; flex-shrink: 0;
          transition: background 0.2s, color 0.2s;
        }
        .send-btn.active {
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          border-color: transparent; color: #1a0e00;
        }
        .image-preview-bar {
          padding: 8px 16px 0;
          display: flex; align-items: center; gap: 10px;
        }
        .preview-img { height: 56px; border-radius: 8px; object-fit: cover; }
        .preview-remove {
          width: 22px; height: 22px; border-radius: 50%;
          background: rgba(255,80,80,0.8); border: none;
          color: #fff; font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .empty-chat-card {
          flex: 1; display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3); font-size: 0.88rem;
        }

        @media (max-width: 700px) {
          .chat-sidebar { width: 100%; display: none; }
          .chat-sidebar.mobile-show { display: flex; }
        }
      `}</style>

      <section className="chat-layout dashboard-reveal" style={{ height: "calc(100vh - 140px)", minHeight: "420px" }}>
        {/* Sidebar */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <h3 className="chat-sidebar-title">Messages</h3>
            <button className="chat-sidebar-req-btn">Requests</button>
          </div>
          <div className="chat-thread-list">
            {friends.length === 0 && (
              <div style={{ padding: "20px 12px", color: "rgba(255,255,255,0.3)", fontSize: "0.82rem", textAlign: "center" }}>
                No friends yet. Accept requests to unlock chats.
              </div>
            )}
            {friends.map((friend) => (
              <button
                className={`chat-thread${selectedFriend?.id === friend.id ? " active" : ""}`}
                key={friend.id}
                onClick={() => setSelectedFriend(friend)}
              >
                <span className="chat-thread-avatar">{friend.fullName.slice(0, 1).toUpperCase()}</span>
                <span className="chat-thread-meta">
                  <span className="chat-thread-name">{friend.fullName}</span>
                  <small className="chat-thread-sub">
                    {unreadCounts[friend.id] ? `${formatUnreadBadge(unreadCounts[friend.id])} new messages` : getFriendSubline(friend)}
                  </small>
                </span>
                {unreadCounts[friend.id] ? <span className="chat-thread-dot" /> : null}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Panel */}
        <div className="chat-panel">
          {activeCall && zegoConfig && selectedFriend ? (
            <div style={{ flex: 1, position: "relative", background: "#000" }}>
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
                <div style={{ position: "absolute", inset: 0, background: "rgba(10,14,23,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                  <div style={{ width: "100px", height: "100px", borderRadius: "50%", background: "linear-gradient(135deg, #ffc55d, #ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", fontWeight: "bold", color: "#fff", marginBottom: "20px" }}>
                    {selectedFriendName.charAt(0).toUpperCase()}
                  </div>
                  <h3 style={{ margin: 0, color: "#fff" }}>{selectedFriendName}</h3>
                  <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "8px" }}>Audio Call in progress...</p>
                </div>
              )}
              <button
                onClick={() => setActiveCall(null)}
                style={{ position: "absolute", top: "16px", right: "16px", background: "rgba(255,80,80,0.9)", padding: "9px 20px", borderRadius: "20px", border: "none", color: "#fff", cursor: "pointer", zIndex: 9999, fontWeight: 600, display: "flex", alignItems: "center", gap: "7px" }}
              >
                <Phone size={15} style={{ transform: "rotate(135deg)" }} /> End Call
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-panel-header">
                <div className="chat-panel-profile">
                  <div className="chat-panel-avatar">{selectedFriendName.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <p className="chat-panel-name">{selectedFriendName}</p>
                    <p className="chat-panel-sub">
                      {partnerTyping ? "typing..." : selectedFriend ? getFriendSubline(selectedFriend) : "Select a friend to chat"}
                    </p>
                  </div>
                </div>
                {selectedFriend && (
                  <div className="chat-panel-actions">
                    <button className="chat-action-btn" onClick={() => handleStartCall(false)}><Phone size={16} /></button>
                    <button className="chat-action-btn" onClick={() => handleStartCall(true)}><Camera size={16} /></button>
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="messages-area">
                {messages.length === 0 && selectedFriend && (
                  <div className="empty-chat-card">Say hello to {selectedFriend.fullName} 👋</div>
                )}
                {!selectedFriend && (
                  <div className="empty-chat-card">Select a friend to start chatting</div>
                )}
                {messages.map((message) => {
                  const isMine = message.senderId === user.id;
                  return (
                    <div className={`msg-row${isMine ? " mine" : ""}`} key={message.id}>
                      <div className={`msg-bubble${isMine ? " mine" : ""}`}>
                        {message.imageUrl && <img src={message.imageUrl} alt="attached" className="msg-image" />}
                        {message.content && <span>{message.content}</span>}
                        <div className="msg-meta">
                          <small className="msg-time">{formatMessageTime(message.createdAt)}</small>
                          {isMine && (message.isRead
                            ? <CheckCheck size={13} color={isMine ? "#1a0e00" : "#7ce9d6"} />
                            : <Check size={13} color={isMine ? "rgba(0,0,0,0.4)" : "#8b98ae"} />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {partnerTyping && (
                  <div className="msg-row">
                    <div className="typing-bubble">
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Image preview */}
              {imagePreview && (
                <div className="image-preview-bar">
                  <img src={imagePreview} alt="preview" className="preview-img" />
                  <button className="preview-remove" onClick={() => setImagePreview(null)}>×</button>
                </div>
              )}

              {/* Composer */}
              <form onSubmit={handleSendMessage} className="chat-composer">
                <input type="file" accept="image/*" style={{ display: "none" }} ref={fileInputRef} onChange={handleImageUpload} />
                <button type="button" className="composer-icon-btn" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus size={17} />
                </button>
                <input
                  className="composer-input"
                  placeholder="Message..."
                  value={messageInput}
                  onChange={handleTyping}
                />
                <button
                  type="submit"
                  className={`send-btn${messageInput.trim() || imagePreview ? " active" : ""}`}
                  disabled={!messageInput.trim() && !imagePreview}
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );

  // ─── RENDER PROFILE ────────────────────────────────────────────────────────
  const renderProfile = () => (
    <>
      <style>{`
        .profile-layout { display: flex; flex-direction: column; gap: 18px; }
        .profile-hero-card {
          background: linear-gradient(135deg, #0d2137, #0a1628);
          border: 1px solid rgba(255,184,74,0.18);
          border-radius: 20px; padding: 28px 24px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center; gap: 14px;
        }
        .profile-big-avatar {
          width: 80px; height: 80px; border-radius: 50%;
          background: linear-gradient(135deg, #ffb84a, #ff8c42);
          display: flex; align-items: center; justify-content: center;
          font-size: 2.2rem; font-weight: 800; color: #1a0e00;
          box-shadow: 0 0 0 4px rgba(255,184,74,0.2);
        }
        .profile-name { font-size: 1.2rem; font-weight: 800; color: #fff; margin: 0; }
        .profile-email { font-size: 0.82rem; color: rgba(255,255,255,0.42); margin: 0; }
        .profile-stats {
          display: flex; gap: 0; width: 100%;
          background: rgba(255,255,255,0.05); border-radius: 14px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.07);
        }
        .profile-stat {
          flex: 1; padding: 14px 8px; text-align: center;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .profile-stat:last-child { border-right: none; }
        .profile-stat strong { display: block; font-size: 1.3rem; color: #fff; font-weight: 800; }
        .profile-stat span { font-size: 0.72rem; color: rgba(255,255,255,0.38); }
        .profile-logout-btn {
          background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25);
          color: #ff6b6b; border-radius: 12px; padding: 10px 24px;
          font-size: 0.88rem; font-weight: 600; cursor: pointer;
          transition: background 0.15s;
        }
        .profile-logout-btn:hover { background: rgba(255,80,80,0.2); }

        .profile-panel {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 18px; overflow: hidden;
        }
        .profile-panel-head {
          padding: 16px 20px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          display: flex; align-items: center; justify-content: space-between;
        }
        .profile-panel-title { font-size: 0.92rem; font-weight: 700; color: #fff; margin: 0; }
        .profile-panel-count { font-size: 0.78rem; color: rgba(255,255,255,0.35); }
        .profile-panel-list { display: flex; flex-direction: column; }
        .profile-panel-item {
          display: flex; align-items: center; gap: 13px;
          padding: 13px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .profile-panel-item:last-child { border-bottom: none; }
        .notif-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,184,74,0.12);
          display: flex; align-items: center; justify-content: center;
          color: #ffb84a; flex-shrink: 0; font-size: 0.8rem; font-weight: 700;
        }
        .profile-item-info { flex: 1; min-width: 0; }
        .profile-item-title { font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 2px; }
        .profile-item-sub { font-size: 0.76rem; color: rgba(255,255,255,0.38); }
        .accept-btn {
          background: linear-gradient(135deg, #4ee1b7, #1b8a6b);
          border: none; border-radius: 9px; padding: 7px 14px;
          font-size: 0.78rem; font-weight: 700; color: #fff;
          cursor: pointer; flex-shrink: 0; transition: opacity 0.15s;
        }
        .accept-btn:hover { opacity: 0.85; }
        .unblock-btn {
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px; padding: 7px 12px;
          font-size: 0.76rem; font-weight: 600; color: rgba(255,255,255,0.55);
          cursor: pointer; flex-shrink: 0; display: flex; align-items: center; gap: 5px;
          transition: background 0.15s;
        }
        .unblock-btn:hover { background: rgba(255,255,255,0.12); }
        .profile-empty {
          padding: 20px; text-align: center;
          color: rgba(255,255,255,0.28); font-size: 0.82rem;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
        }
      `}</style>

      <section className="profile-layout dashboard-reveal">
        {/* Profile hero */}
        <article className="profile-hero-card">
          <div className="profile-big-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div>
            <p className="profile-name">{user.fullName}</p>
            <p className="profile-email">{user.email}</p>
          </div>
          <div className="profile-stats">
            <div className="profile-stat"><strong>{friends.length}</strong><span>Friends</span></div>
            <div className="profile-stat"><strong>{pendingCount}</strong><span>Requests</span></div>
            <div className="profile-stat"><strong>{discoverUsers.length}</strong><span>Discover</span></div>
          </div>
          <button className="profile-logout-btn" onClick={onLogout}>Logout</button>
        </article>

        {/* Notifications + Requests */}
        <article className="profile-panel">
          <div className="profile-panel-head">
            <h3 className="profile-panel-title">Notifications & Requests</h3>
            <span className="profile-panel-count">{notifications.length + requests.length} items</span>
          </div>
          <div className="profile-panel-list">
            {notifications.length === 0 && requests.length === 0 && (
              <div className="profile-empty">No notifications yet.</div>
            )}
            {notifications.map((notification) => (
              <div className="profile-panel-item" key={notification.id}>
                <div className="notif-icon">
                  {notification.type === "friend_accept" ? "✓" : notification.type === "friend_request" ? "+" : "i"}
                </div>
                <div className="profile-item-info">
                  <div className="profile-item-title">
                    {notification.type === "friend_accept" ? "Friend accepted" : notification.type === "friend_request" ? "New friend request" : "Update"}
                  </div>
                  <div className="profile-item-sub">{notification.message}</div>
                </div>
              </div>
            ))}
            {requests.map((request) => (
              <div className="profile-panel-item" key={request.id}>
                <div className="notif-icon" style={{ background: "rgba(78,225,183,0.12)", color: "#4ee1b7" }}>+</div>
                <div className="profile-item-info">
                  <div className="profile-item-title">{request.sender.fullName}</div>
                  <div className="profile-item-sub">{request.sender.email}</div>
                </div>
                <button className="accept-btn" onClick={() => void acceptRequest(request.id)}>Accept</button>
              </div>
            ))}
          </div>
        </article>

        {/* Blocked users */}
        <article className="profile-panel">
          <div className="profile-panel-head">
            <h3 className="profile-panel-title">Blocked users</h3>
            <span className="profile-panel-count">{blockedUsers.length} hidden</span>
          </div>
          <div className="profile-panel-list">
            {blockedUsers.length === 0 && (
              <div className="profile-empty">
                <Lock size={18} />
                People you block during random chat will appear here.
              </div>
            )}
            {blockedUsers.map((entry) => (
              <div className="profile-panel-item" key={entry.id}>
                <div className="notif-icon" style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b" }}>
                  <ShieldBan size={16} />
                </div>
                <div className="profile-item-info">
                  <div className="profile-item-title">{entry.user.fullName}</div>
                  <div className="profile-item-sub">{entry.reason ? `Reason: ${entry.reason}` : entry.user.email}</div>
                </div>
                <button className="unblock-btn" onClick={() => void unblockUser(entry.user.id)}>
                  <ShieldBan size={13} /> Unblock
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );

  // ─── RENDER LEFT DRAWER ────────────────────────────────────────────────────
  const renderLeftDrawerContent = () => (
    <div className="ome-left-sheet">
      <div className="ome-menu-user">
        <div className="profile-mini-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
        <div>
          <strong>{user.fullName}</strong>
          <p>{user.email}</p>
        </div>
      </div>

      <section className="ome-mobile-drawer-section">
        <div className="ome-mobile-drawer-head">
          <strong>Suggested friends</strong>
          <button className="ome-link-button" onClick={() => { setActiveTab("discover"); setIsLeftMenuOpen(false); }}>View all</button>
        </div>
        <div className="ome-mobile-suggestions">
          {suggestedStudents.length === 0 && <p className="side-empty-text">No suggestions yet.</p>}
          {suggestedStudents.map((student) => (
            <article className="ome-mobile-suggestion-card" key={student.id}>
              <div className="suggested-avatar small">{student.fullName.slice(0, 1).toUpperCase()}</div>
              <div className="ome-mobile-suggestion-copy">
                <strong>{student.fullName}</strong>
                <span>{student.interests || "Exploring campus life"}</span>
              </div>
              <button className="ghost-button compact-button" onClick={() => void sendFriendRequest(student.id)}>
                <UserPlus size={16} /> Connect
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="ome-mobile-drawer-section">
        <div className="ome-mobile-drawer-head">
          <strong>Friends</strong>
          <span>{friends.length}</span>
        </div>
        <div className="side-friends-list mobile">
          {friends.length === 0 && <p className="side-empty-text">No friends yet.</p>}
          {friends.map((friend) => (
            <button
              key={friend.id}
              className={selectedFriend?.id === friend.id && activeTab === "chat" ? "side-friend-chip active" : "side-friend-chip"}
              onClick={() => { setSelectedFriend(friend); setActiveTab("chat"); setIsLeftMenuOpen(false); }}
            >
              <div className="profile-mini-avatar small">{friend.fullName.slice(0, 1).toUpperCase()}</div>
              <span className="friend-name">{friend.fullName}</span>
              {unreadCounts[friend.id] ? <span className="side-unread-badge">{formatUnreadBadge(unreadCounts[friend.id])}</span> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );

  // ─── MAIN RETURN ───────────────────────────────────────────────────────────
  return (
    <div className="dashboard-shell ome-dashboard-shell" ref={shellRef}>
      <div className="ome-app-frame">
        {/* Desktop Sidebar */}
        <aside className="ome-side-nav">
          <div className="ome-side-brand">
            <div className="profile-mini-avatar">{user.fullName.slice(0, 1).toUpperCase()}</div>
            <div>
              <span className="ome-app-name">LPU TV</span>
              <p className="ome-app-subtitle">{user.fullName}</p>
            </div>
          </div>
          <div className="ome-side-friends-section">
            <span className="side-heading">Friends</span>
            <div className="side-friends-list">
              {friends.length === 0 && <p className="side-empty-text">No friends yet.</p>}
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  className={selectedFriend?.id === friend.id && activeTab === "chat" ? "side-friend-chip active" : "side-friend-chip"}
                  onClick={() => { setSelectedFriend(friend); setActiveTab("chat"); }}
                >
                  <div className="profile-mini-avatar small">{friend.fullName.slice(0, 1).toUpperCase()}</div>
                  <span className="friend-name">{friend.fullName}</span>
                  {unreadCounts[friend.id] ? <span className="side-unread-badge">{formatUnreadBadge(unreadCounts[friend.id])}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="ome-content-shell">
          {/* Topbar */}
          <header className="ome-topbar dashboard-reveal">
            <div className="ome-topbar-left">
              <button
                className="ome-menu-button ome-menu-button-left"
                onClick={() => setIsLeftMenuOpen((c) => !c)}
              >
                {isLeftMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="ome-topbar-title">{currentTitle}</div>
            </div>
            <button
              className={activeTab === "profile" ? "ome-profile-trigger active" : "ome-profile-trigger"}
              onClick={() => { setIsLeftMenuOpen(false); setActiveTab("profile"); }}
            >
              <span className="profile-mini-avatar small">{user.fullName.slice(0, 1).toUpperCase()}</span>
            </button>
          </header>

          {/* Main */}
          <main className={activeTab === "chat" ? "ome-main-content chat-active" : "ome-main-content"}>
            {activeTab === "home" && renderHome()}
            {activeTab === "discover" && renderDiscover()}
            {activeTab === "chat" && renderChat()}
            {activeTab === "profile" && renderProfile()}
          </main>

          {/* Left drawer */}
          {isLeftMenuOpen && (
            <div className="ome-menu-drawer ome-menu-drawer-left">
              {renderLeftDrawerContent()}
            </div>
          )}

          {/* Bottom nav */}
          <nav className="ome-bottom-nav">
            <button className={activeTab === "home" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => handleNavigate("home")}>
              <Home size={18} /><span>Home</span>
            </button>
            <button className={activeTab === "discover" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => handleNavigate("discover")}>
              <Search size={18} /><span>Discover</span>
            </button>
            <button className={activeTab === "chat" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => handleNavigate("chat")}>
              <MessageCircle size={18} /><span>Messages</span>
              {pendingCount > 0 && <span className="ome-nav-badge">{pendingCount}</span>}
            </button>
            <button className={activeTab === "profile" ? "ome-nav-item active" : "ome-nav-item"} onClick={() => handleNavigate("profile")}>
              <UserCircle2 size={18} /><span>Profile</span>
            </button>
          </nav>
        </div>

        {/* Outgoing Call Overlay */}
        {outgoingCall && !activeCall && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,14,23,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(16px)" }}>
            <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "linear-gradient(135deg, #4ee1b7, #1b8a6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", fontWeight: "bold", color: "#fff", marginBottom: "24px", boxShadow: "0 0 40px rgba(78,225,183,0.3)", animation: "pulse 1.5s infinite" }}>
              {outgoingCall.receiverName.charAt(0).toUpperCase()}
            </div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.8rem" }}>{outgoingCall.receiverName}</h3>
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "8px", fontSize: "1.05rem" }}>Calling...</p>
            <button onClick={handleCancelCall} style={{ marginTop: "40px", background: "rgba(255,80,80,0.85)", padding: "14px 30px", borderRadius: "30px", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
              <Phone size={18} style={{ transform: "rotate(135deg)" }} /> Cancel Call
            </button>
            <style>{`@keyframes pulse { 0%{transform:scale(1);box-shadow:0 0 0 0 rgba(78,225,183,0.4)} 70%{transform:scale(1.05);box-shadow:0 0 0 20px rgba(78,225,183,0)} 100%{transform:scale(1);box-shadow:0 0 0 0 rgba(78,225,183,0)} }`}</style>
          </div>
        )}

        {/* Incoming Call Overlay */}
        {incomingCall && !activeCall && (
          <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(10,14,23,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(16px)" }}>
            <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: "linear-gradient(135deg, #ffc55d, #ff6b6b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3.5rem", fontWeight: "bold", color: "#fff", marginBottom: "24px", boxShadow: "0 0 40px rgba(255,197,93,0.3)", animation: "pulse 1.5s infinite" }}>
              {incomingCall.callerName.charAt(0).toUpperCase()}
            </div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: "1.8rem" }}>{incomingCall.callerName}</h3>
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "8px", fontSize: "1.05rem" }}>
              Incoming {incomingCall.isVideo ? "Video" : "Audio"} Call...
            </p>
            <div style={{ display: "flex", gap: "20px", marginTop: "40px" }}>
              <button onClick={handleDeclineCall} style={{ background: "rgba(255,80,80,0.85)", padding: "16px", borderRadius: "50%", border: "none", color: "#fff", cursor: "pointer", width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Phone size={26} style={{ transform: "rotate(135deg)" }} />
              </button>
              <button onClick={handleAcceptCall} style={{ background: "#4ee1b7", padding: "16px", borderRadius: "50%", border: "none", color: "#000", cursor: "pointer", width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {incomingCall.isVideo ? <Camera size={26} /> : <Phone size={26} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}