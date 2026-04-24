import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Flag,
  MessageCircle,
  PhoneOff,
  Play,
  Send,
  ShieldBan,
  SkipForward,
  SmilePlus,
  UserPlus,
  X,
  ChevronDown,
} from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { MatchResult, RelationshipStatus, User } from "../types";
import { VideoRoom } from "./VideoRoom";

type RandomChatPageProps = {
  token: string;
  user: User;
};

type LiveChatMessage = {
  id: string;
  message: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

type FloatingReaction = {
  id: string;
  emoji: string;
  own?: boolean;
};

const QUICK_REACTIONS = ["🔥", "👏", "😂", "❤️"];

function emit(event: string, payload?: unknown) {
  const socket = getSocket();
  if (socket?.connected) {
    payload !== undefined ? socket.emit(event, payload) : socket.emit(event);
  }
}

export function RandomChatPage({ token, user }: RandomChatPageProps) {
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchResult | null>(null);
  const [zegoRenderMatch, setZegoRenderMatch] = useState<MatchResult | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [zegoConnecting, setZegoConnecting] = useState(false);
  const [roomRevealPending, setRoomRevealPending] = useState(false);
  const [zegoConfig, setZegoConfig] = useState({ appId: 0, serverSecret: "" });
  const [relationship, setRelationship] = useState<RelationshipStatus | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showBlockSheet, setShowBlockSheet] = useState(false);
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [actionBusy, setActionBusy] = useState<"friend" | "report" | "block" | "accept" | null>(null);
  const [showLiveChat, setShowLiveChat] = useState(false);
  const [liveChatInput, setLiveChatInput] = useState("");
  const [liveMessages, setLiveMessages] = useState<LiveChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectionIssue, setConnectionIssue] = useState("");
  const [showReactionTray, setShowReactionTray] = useState(false);

  // Swipe state
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const hasStartedRef = useRef(hasStarted);
  const matchRef = useRef(match);
  const isMatchingRef = useRef(isMatching);
  const previewRetryTimerRef = useRef<number | null>(null);
  const zegoTimeoutRef = useRef<number | null>(null);
  const liveChatBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { hasStartedRef.current = hasStarted; }, [hasStarted]);
  useEffect(() => { matchRef.current = match; }, [match]);
  useEffect(() => { isMatchingRef.current = isMatching; }, [isMatching]);

  const upcomingPartnerName = match?.partner.fullName?.split(" ")[0] ?? "Someone";

  const liveTimer = useMemo(() => {
    const m = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const s = String(elapsedSeconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!callStartedAt || zegoConnecting || !match) { setElapsedSeconds(0); return; }
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [callStartedAt, match, zegoConnecting]);

  useEffect(() => {
    if (!showLiveChat) return;
    liveChatBodyRef.current?.scrollTo({ top: liveChatBodyRef.current.scrollHeight, behavior: "smooth" });
  }, [liveMessages, showLiveChat]);

  useEffect(() => {
    if (match || zegoRenderMatch || zegoConnecting) return;
    let cancelled = false;
    let currentStream: MediaStream | null = null;
    const startPreview = () => {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then((s) => {
          if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
          currentStream = s;
          if (localVideoRef.current) localVideoRef.current.srcObject = s;
        })
        .catch((error: DOMException) => {
          if (cancelled) return;
          if (error.name === "NotReadableError") {
            previewRetryTimerRef.current = window.setTimeout(() => { if (!cancelled) startPreview(); }, 1000);
          }
        });
    };
    startPreview();
    return () => {
      cancelled = true;
      if (previewRetryTimerRef.current !== null) { window.clearTimeout(previewRetryTimerRef.current); previewRetryTimerRef.current = null; }
      currentStream?.getTracks().forEach((t) => t.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    };
  }, [match, zegoConnecting, zegoRenderMatch]);

  useEffect(() => {
    if (match) { const t = setTimeout(() => setZegoRenderMatch(match), 800); return () => clearTimeout(t); }
    setZegoRenderMatch(null);
  }, [match]);

  useEffect(() => {
    const kill = (node: HTMLElement) => {
      const text = node.textContent || "";
      if (!text.includes("Media play failed") && !text.includes("Resume")) return;
      let target: HTMLElement = node;
      while (target.parentElement && target.parentElement !== document.body) target = target.parentElement;
      target.remove();
    };
    const observer = new MutationObserver((mutations) =>
      mutations.forEach((m) => m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) kill(n); }))
    );
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.querySelectorAll<HTMLElement>("div").forEach((div) => { if (div.parentElement === document.body) kill(div); });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!zegoConnecting) return;
    zegoTimeoutRef.current = window.setTimeout(() => {
      setMatch(null); setZegoRenderMatch(null); setZegoConnecting(false); setRoomRevealPending(false);
      setConnectionIssue("Video connection timed out. Try another partner.");
    }, 12000);
    return () => { if (zegoTimeoutRef.current !== null) { window.clearTimeout(zegoTimeoutRef.current); zegoTimeoutRef.current = null; } };
  }, [zegoConnecting]);

  useEffect(() => { api.get("/zego-config").then((res) => setZegoConfig(res.data)); }, []);

  useEffect(() => {
    if (!match) {
      setRelationship(null); setActionMessage(""); setShowReportSheet(false); setShowBlockSheet(false);
      setReportDetails(""); setBlockReason(""); setLiveMessages([]); setFloatingReactions([]);
      setCallStartedAt(null); setConnectionIssue(""); setShowReactionTray(false);
      return;
    }
    api.get(`/relationships/${match.partner.id}`).then((res) => setRelationship(res.data)).catch(() => setRelationship(null));
  }, [match]);

  useEffect(() => {
    const socket = connectSocket(token);
    socket.on("connect", () => {
      if (hasStartedRef.current && !matchRef.current && !isMatchingRef.current) { setIsMatching(true); socket.emit("match:join-queue"); }
    });
    socket.on("match:waiting", () => {});
    socket.on("match:found", (payload: MatchResult) => {
      if (zegoTimeoutRef.current !== null) { window.clearTimeout(zegoTimeoutRef.current); zegoTimeoutRef.current = null; }
      setZegoConnecting(true); setRoomRevealPending(true); setMatch(payload);
      setShowLiveChat(false); setLiveMessages([]); setFloatingReactions([]);
      setCallStartedAt(null); setConnectionIssue(""); setIsMatching(false); setHasStarted(true);
    });
    socket.on("match:partner-left", () => {
      socket.emit("match:leave-room");
      setMatch(null); setZegoConnecting(false); setRoomRevealPending(false);
      setShowLiveChat(false); setCallStartedAt(null); setConnectionIssue("");
      if (hasStartedRef.current) {
        setIsMatching(true);
        window.setTimeout(() => { if (socket.connected) socket.emit("match:join-queue"); }, 120);
      }
    });
    socket.on("match:reaction", ({ emoji, senderId }: { emoji: string; senderId: string }) => {
      const id = `${senderId}-${Date.now()}`;
      setFloatingReactions((c) => [...c, { id, emoji }]);
      window.setTimeout(() => setFloatingReactions((c) => c.filter((r) => r.id !== id)), 2200);
    });
    socket.on("match:chat", (payload: LiveChatMessage) => setLiveMessages((c) => [...c.slice(-19), payload]));
    return () => {
      socket.off("connect"); socket.off("match:waiting"); socket.off("match:found");
      socket.off("match:partner-left"); socket.off("match:reaction"); socket.off("match:chat");
      if (socket.connected) { socket.emit("match:leave-room"); socket.emit("match:leave-queue"); }
      disconnectSocket();
    };
  }, [token]);

  // Touch swipe handlers for mobile
  function handleTouchStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    setSwipeDelta(0);
    setSwipeDir(null);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.touches[0].clientX - swipeStartX.current;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (Math.abs(dy) > Math.abs(dx) + 10) return; // vertical scroll wins
    setSwipeDelta(dx);
    setSwipeDir(dx > 0 ? "right" : "left");
  }

  function handleTouchEnd() {
    if (Math.abs(swipeDelta) > 80 && hasStarted) {
      if (swipeDir === "right" && match) nextMatch();
      else if (swipeDir === "left") stopMatching();
    }
    setSwipeDelta(0);
    setSwipeDir(null);
    swipeStartX.current = null;
    swipeStartY.current = null;
  }

  async function handleFriendAction() {
    if (!match?.partner || !relationship || actionBusy) return;
    try {
      if (relationship.isFriend) { setActionMessage("You are already friends."); return; }
      if (relationship.incomingRequestPending && relationship.incomingRequestId) {
        setActionBusy("accept");
        await api.post(`/friend-requests/${relationship.incomingRequestId}/accept`);
        setRelationship((c) => c ? { ...c, isFriend: true, incomingRequestPending: false, incomingRequestId: null } : c);
        setActionMessage("Friend request accepted."); return;
      }
      if (relationship.outgoingRequestPending) { setActionMessage("Friend request already sent."); return; }
      setActionBusy("friend");
      await api.post("/friend-requests", { receiverId: match.partner.id });
      setRelationship((c) => c ? { ...c, outgoingRequestPending: true } : c);
      setActionMessage("Friend request sent.");
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not update friendship.");
    } finally { setActionBusy(null); }
  }

  async function submitReport() {
    if (!match?.partner || actionBusy) return;
    try {
      setActionBusy("report");
      await api.post(`/users/${match.partner.id}/report`, { reason: reportReason, details: reportDetails });
      setActionMessage("Report submitted.");
      setShowReportSheet(false); setReportDetails("");
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not submit report.");
    } finally { setActionBusy(null); }
  }

  async function confirmBlock() {
    if (!match?.partner || actionBusy) return;
    try {
      setActionBusy("block");
      await api.post(`/users/${match.partner.id}/block`, { reason: blockReason });
      setActionMessage(`${match.partner.fullName.split(" ")[0]} has been blocked.`);
      setShowBlockSheet(false); nextMatch();
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not block this user.");
    } finally { setActionBusy(null); }
  }

  function getFriendLabel() {
    if (!relationship) return "Add Friend";
    if (relationship.isBlocked || relationship.isBlockedByOther) return "Unavailable";
    if (relationship.isFriend) return "Friends ✓";
    if (relationship.incomingRequestPending) return "Accept Request";
    if (relationship.outgoingRequestPending) return "Sent ✓";
    return "Add Friend";
  }

  function startMatching() {
    setMatch(null); setZegoConnecting(false); setRoomRevealPending(false);
    setShowLiveChat(false); setLiveMessages([]); setFloatingReactions([]);
    setCallStartedAt(null); setConnectionIssue(""); setIsMatching(true); setHasStarted(true);
    emit("match:join-queue");
  }

  function stopMatching() {
    setHasStarted(false); hasStartedRef.current = false;
    emit("match:leave-room"); emit("match:leave-queue");
    setMatch(null); setZegoConnecting(false); setRoomRevealPending(false);
    setShowLiveChat(false); setLiveMessages([]); setFloatingReactions([]);
    setCallStartedAt(null); setConnectionIssue(""); setIsMatching(false);
  }

  function nextMatch() {
    emit("match:leave-room");
    setMatch(null); setZegoConnecting(false); setRoomRevealPending(false);
    setShowLiveChat(false); setLiveMessages([]); setFloatingReactions([]);
    setCallStartedAt(null); setConnectionIssue(""); setIsMatching(true); setHasStarted(true);
    window.setTimeout(() => emit("match:join-queue"), 120);
  }

  function triggerReaction(emoji: string) {
    const id = `${user.id}-${Date.now()}`;
    setFloatingReactions((c) => [...c, { id, emoji, own: true }]);
    emit("match:reaction", { emoji });
    window.setTimeout(() => setFloatingReactions((c) => c.filter((r) => r.id !== id)), 2200);
  }

  function sendLiveChatMessage(event: FormEvent) {
    event.preventDefault();
    const msg = liveChatInput.trim();
    if (!msg) return;
    emit("match:chat", { message: msg });
    setLiveChatInput("");
  }

  const isInCall = Boolean(match) && !zegoConnecting;

  // Swipe visual cue transform
  const swipeStyle = Math.abs(swipeDelta) > 20 ? {
    transform: `translateX(${swipeDelta * 0.15}px)`,
    transition: "none",
  } : { transform: "translateX(0)", transition: "transform 0.3s ease" };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .rcp-root {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          width: 100%;
          background: #0a0a0b;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* ─── TOP BAR ─── */
        .rcp-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: max(env(safe-area-inset-top), 10px) 20px 10px;
          background: #0a0a0b;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
          z-index: 50;
        }
        .rcp-wordmark {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 18px;
          color: #fff;
          letter-spacing: -0.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          user-select: none;
        }
        .rcp-wordmark-badge {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          color: #e5ff00;
          text-transform: uppercase;
          background: rgba(229,255,0,0.1);
          border: 1px solid rgba(229,255,0,0.25);
          border-radius: 4px;
          padding: 2px 6px;
          font-family: 'DM Sans', sans-serif;
        }
        .rcp-topbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .rcp-status-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 100px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.6);
        }
        .rcp-status-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #555;
          flex-shrink: 0;
        }
        .rcp-status-dot.live { background: #4ade80; box-shadow: 0 0 8px #4ade8080; }
        .rcp-status-dot.searching { background: #e5ff00; animation: rcp-pulse 1.2s ease-in-out infinite; }
        @keyframes rcp-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        .rcp-report-btn {
          width: 34px; height: 34px;
          border-radius: 10px;
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.2);
          display: flex; align-items: center; justify-content: center;
          color: #f87171;
          cursor: pointer;
          transition: background 0.15s;
        }
        .rcp-report-btn:hover { background: rgba(239,68,68,0.2); }

        /* ─── MAIN VIDEO AREA ─── */
        .rcp-main {
          flex: 1;
          display: flex;
          min-height: 0;
          gap: 0;
          position: relative;
        }

        /* DESKTOP: side by side */
        @media (min-width: 769px) {
          .rcp-main { flex-direction: row; gap: 12px; padding: 12px; }
          .rcp-panel { border-radius: 16px; overflow: hidden; }
          .rcp-panel-remote { flex: 1.1; }
          .rcp-panel-local  { flex: 0.9; }
        }

        /* MOBILE: stacked */
        @media (max-width: 768px) {
          .rcp-main { flex-direction: column; padding: 0; }
          .rcp-panel { border-radius: 0; }
          .rcp-panel-remote { flex: 1.1; border-bottom: 2px solid rgba(255,255,255,0.05); }
          .rcp-panel-local  { flex: 0.9; }
        }

        .rcp-panel {
          position: relative;
          overflow: hidden;
          background: #111114;
          flex-shrink: 0;
        }
        .rcp-panel > div,
        .rcp-panel > video {
          width: 100% !important;
          height: 100% !important;
        }
        .rcp-panel video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* Panel placeholder content */
        .rcp-panel-idle {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          background: linear-gradient(135deg, #111118 0%, #0d0d14 100%);
        }
        .rcp-panel-idle-icon {
          width: 56px; height: 56px;
          border-radius: 18px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-idle-label {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255,255,255,0.3);
          letter-spacing: 0.2px;
        }
        .rcp-idle-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.15);
          margin-top: -8px;
        }

        /* Pulse spinner */
        .rcp-spinner {
          width: 44px; height: 44px;
          position: relative;
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-spinner::before, .rcp-spinner::after {
          content: '';
          position: absolute;
          border-radius: 50%;
          border: 2px solid transparent;
          border-top-color: #e5ff00;
          animation: rcp-spin 1s linear infinite;
        }
        .rcp-spinner::before { width: 44px; height: 44px; }
        .rcp-spinner::after  { width: 30px; height: 30px; animation-duration: 0.7s; border-top-color: rgba(229,255,0,0.35); }
        @keyframes rcp-spin { to { transform: rotate(360deg); } }

        /* Panel overlays */
        .rcp-remote-label {
          position: absolute;
          top: 14px; left: 14px;
          display: flex; align-items: center; gap: 8px;
          z-index: 10;
          pointer-events: none;
        }
        .rcp-live-pill {
          display: flex; align-items: center; gap: 5px;
          background: rgba(239,68,68,0.9);
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: 'Syne', sans-serif;
        }
        .rcp-live-blink {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #fff;
          animation: rcp-pulse 0.9s infinite;
        }
        .rcp-partner-chip {
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
        }
        .rcp-timer-chip {
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(6px);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          font-variant-numeric: tabular-nums;
        }

        /* In-panel actions (top right of remote) */
        .rcp-panel-actions {
          position: absolute;
          top: 14px; right: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 15;
        }
        .rcp-action-btn {
          width: 38px; height: 38px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          border: none;
          transition: transform 0.12s, opacity 0.15s;
        }
        .rcp-action-btn:active { transform: scale(0.88); }
        .rcp-action-btn:disabled { opacity: 0.3; cursor: default; }
        .rcp-action-btn.friend { background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.3); color: #a78bfa; }
        .rcp-action-btn.report { background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.25); color: #fbbf24; }
        .rcp-action-btn.block  { background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.25); color: #f87171; }

        /* Floating reactions */
        .rcp-float-layer {
          position: absolute;
          bottom: 16px; left: 16px;
          pointer-events: none;
          z-index: 20;
          display: flex;
          flex-direction: column-reverse;
          gap: 4px;
        }
        .rcp-float-emoji {
          font-size: 28px;
          animation: rcp-float-up 2.2s ease-out forwards;
        }
        .rcp-float-emoji.own { filter: drop-shadow(0 0 8px rgba(229,255,0,0.5)); }
        @keyframes rcp-float-up {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-100px) scale(1.5); }
        }

        /* Local panel label */
        .rcp-you-label {
          position: absolute;
          bottom: 10px; left: 12px;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(6px);
          border-radius: 6px;
          padding: 3px 9px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
          pointer-events: none;
        }

        /* Swipe hint overlay */
        .rcp-swipe-hint {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 30;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .rcp-swipe-hint.show { opacity: 1; }
        .rcp-swipe-hint-label {
          font-size: 20px;
          font-weight: 700;
          font-family: 'Syne', sans-serif;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0,0,0,0.8);
          padding: 10px 24px;
          border-radius: 12px;
          backdrop-filter: blur(12px);
        }
        .rcp-swipe-hint-label.next { background: rgba(229,255,0,0.2); border: 2px solid rgba(229,255,0,0.5); color: #e5ff00; }
        .rcp-swipe-hint-label.stop { background: rgba(239,68,68,0.2); border: 2px solid rgba(239,68,68,0.5); color: #f87171; }

        /* ─── BOTTOM BAR ─── */
        .rcp-bottom {
          flex-shrink: 0;
          background: #0a0a0b;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 12px 16px max(env(safe-area-inset-bottom), 14px);
          z-index: 50;
        }

        /* Reaction tray */
        .rcp-reaction-row {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 10px;
          animation: rcp-slide-up 0.18s ease;
        }
        @keyframes rcp-slide-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .rcp-emoji-pill {
          padding: 8px 14px;
          border-radius: 100px;
          background: #1a1a20;
          border: 1px solid rgba(255,255,255,0.08);
          font-size: 18px;
          cursor: pointer;
          transition: transform 0.1s, background 0.15s;
        }
        .rcp-emoji-pill:active { transform: scale(0.85); }

        /* Control buttons */
        .rcp-controls-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        /* Desktop: buttons + chat input side by side */
        @media (min-width: 769px) {
          .rcp-controls-row { justify-content: space-between; }
          .rcp-btn-group { display: flex; align-items: center; gap: 10px; }
          .rcp-chat-inline { flex: 1; max-width: 420px; display: flex; gap: 8px; }
          .rcp-chat-inline-input {
            flex: 1;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 11px 16px;
            font-size: 14px;
            color: #fff;
            outline: none;
            font-family: 'DM Sans', sans-serif;
          }
          .rcp-chat-inline-input::placeholder { color: rgba(255,255,255,0.25); }
          .rcp-chat-inline-input:focus { border-color: rgba(229,255,0,0.35); }
          .rcp-chat-inline-send {
            width: 44px; height: 44px;
            border-radius: 12px;
            background: #e5ff00;
            border: none;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            color: #0a0a0b;
            flex-shrink: 0;
            transition: transform 0.1s, background 0.15s;
          }
          .rcp-chat-inline-send:disabled { background: #2a2a30; color: #666; }
          .rcp-chat-inline-send:not(:disabled):active { transform: scale(0.9); }
        }

        /* Mobile: buttons only, chat drawer */
        @media (max-width: 768px) {
          .rcp-controls-row { justify-content: space-around; }
          .rcp-btn-group { display: contents; }
          .rcp-chat-inline { display: none; }
        }

        .rcp-ctrl-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          color: #fff;
          padding: 0;
        }
        .rcp-ctrl-btn:disabled { opacity: 0.3; cursor: default; }
        .rcp-ctrl-icon {
          width: 52px; height: 52px;
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, filter 0.15s;
        }
        .rcp-ctrl-btn:active .rcp-ctrl-icon:not(.nodim) { transform: scale(0.9); filter: brightness(0.85); }
        .rcp-ctrl-label {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.4);
          letter-spacing: 0.5px;
          text-transform: uppercase;
          font-family: 'Syne', sans-serif;
        }

        .icon-start  { background: #e5ff00; color: #0a0a0b; }
        .icon-stop   { background: #dc2626; }
        .icon-next   { background: #1a1a22; border: 1px solid rgba(255,255,255,0.1); }
        .icon-react  { background: #1a1a22; border: 1px solid rgba(255,255,255,0.1); }
        .icon-chat   { background: #1a1a22; border: 1px solid rgba(255,255,255,0.1); }
        .icon-chat.active { background: rgba(229,255,0,0.1); border-color: rgba(229,255,0,0.3); }

        /* Swipe hint for mobile */
        .rcp-swipe-guide {
          display: none;
        }
        @media (max-width: 768px) {
          .rcp-swipe-guide {
            display: flex;
            justify-content: center;
            gap: 24px;
            margin-bottom: 10px;
          }
          .rcp-swipe-tip {
            font-size: 11px;
            color: rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            gap: 4px;
          }
          .rcp-swipe-tip span { font-size: 13px; }
        }

        /* ─── CHAT DRAWER (mobile) ─── */
        .rcp-drawer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          z-index: 80;
          background: rgba(12,12,16,0.98);
          backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px 20px 0 0;
          transform: translateY(100%);
          transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
          max-height: 58%;
          display: flex;
          flex-direction: column;
        }
        .rcp-drawer.open { transform: translateY(0); }
        .rcp-drawer-handle {
          width: 36px; height: 4px;
          background: rgba(255,255,255,0.12);
          border-radius: 2px;
          margin: 12px auto 0;
          flex-shrink: 0;
        }
        .rcp-drawer-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .rcp-drawer-title {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
          font-family: 'Syne', sans-serif;
        }
        .rcp-drawer-close {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.6);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overscroll-behavior: contain;
        }
        .rcp-drawer-empty {
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,0.2);
          padding: 20px 0;
        }
        .rcp-bubble {
          max-width: 80%;
          padding: 9px 13px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.5;
          color: #fff;
        }
        .rcp-bubble.mine   { align-self: flex-end; background: #e5ff00; color: #0a0a0b; border-bottom-right-radius: 4px; }
        .rcp-bubble.theirs { align-self: flex-start; background: #1a1a22; border: 1px solid rgba(255,255,255,0.06); border-bottom-left-radius: 4px; }
        .rcp-bubble-name { font-size: 10px; opacity: 0.55; margin-bottom: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .rcp-drawer-form {
          display: flex; gap: 8px;
          padding: 10px 14px max(env(safe-area-inset-bottom), 14px);
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .rcp-drawer-input {
          flex: 1;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 13px;
          color: #fff;
          outline: none;
          font-family: 'DM Sans', sans-serif;
        }
        .rcp-drawer-input::placeholder { color: rgba(255,255,255,0.25); }
        .rcp-drawer-input:focus { border-color: rgba(229,255,0,0.35); }
        .rcp-drawer-send {
          width: 40px; height: 40px;
          border-radius: 12px;
          background: #e5ff00;
          border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #0a0a0b;
          flex-shrink: 0;
          align-self: flex-end;
          transition: transform 0.1s;
        }
        .rcp-drawer-send:disabled { background: #1a1a22; color: #444; }
        .rcp-drawer-send:active { transform: scale(0.9); }

        /* ─── TOAST ─── */
        .rcp-toast {
          position: absolute;
          top: 70px; left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: rgba(10,10,12,0.9);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 100px;
          padding: 8px 18px;
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          pointer-events: none;
          animation: rcp-toast-in 0.2s ease;
        }
        @keyframes rcp-toast-in { from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

        /* ─── BOTTOM SHEET ─── */
        .rcp-sheet-backdrop {
          position: absolute; inset: 0;
          z-index: 90;
          background: rgba(0,0,0,0.65);
          display: flex; align-items: flex-end;
          animation: rcp-fade-in 0.15s ease;
        }
        @keyframes rcp-fade-in { from{opacity:0} to{opacity:1} }
        .rcp-sheet {
          background: #12121a;
          border-radius: 20px 20px 0 0;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 0 20px max(env(safe-area-inset-bottom), 28px);
          width: 100%;
          animation: rcp-slide-up 0.22s cubic-bezier(0.32,0.72,0,1);
        }
        .rcp-sheet-handle { width: 36px; height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; margin: 12px auto 18px; }
        .rcp-sheet-eyebrow { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.3); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 4px; font-family: 'Syne', sans-serif; }
        .rcp-sheet-name { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 18px; font-family: 'Syne', sans-serif; }
        .rcp-sheet-body { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 18px; line-height: 1.6; }
        .rcp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .rcp-chip {
          padding: 8px 16px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.5);
          cursor: pointer;
          transition: all 0.15s;
        }
        .rcp-chip.active { background: rgba(229,255,0,0.12); border-color: rgba(229,255,0,0.35); color: #e5ff00; }
        .rcp-sheet-textarea {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 13px;
          color: #fff;
          min-height: 76px;
          resize: none;
          outline: none;
          font-family: 'DM Sans', sans-serif;
          margin-bottom: 16px;
          line-height: 1.5;
          box-sizing: border-box;
        }
        .rcp-sheet-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .rcp-sheet-textarea:focus { border-color: rgba(229,255,0,0.3); }
        .rcp-sheet-btn {
          width: 100%;
          padding: 15px;
          border-radius: 14px;
          border: none;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          transition: opacity 0.15s, transform 0.1s;
          letter-spacing: 0.2px;
        }
        .rcp-sheet-btn:disabled { opacity: 0.5; }
        .rcp-sheet-btn:active { transform: scale(0.98); }
        .rcp-sheet-btn.primary { background: #e5ff00; color: #0a0a0b; }
        .rcp-sheet-btn.danger  { background: #dc2626; color: #fff; }
        .rcp-sheet-close-row { display: flex; justify-content: flex-end; margin-bottom: 4px; }
        .rcp-sheet-x {
          background: rgba(255,255,255,0.07);
          border: none; border-radius: 50%;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
        }
      `}</style>

      <div className="rcp-root">

        {/* ─── TOP BAR ─── */}
        <header className="rcp-topbar">
          <div className="rcp-wordmark" onClick={() => navigate("/app")}>
            LPU TV
            <span className="rcp-wordmark-badge">Beta</span>
          </div>
          <div className="rcp-topbar-right">
            <div className="rcp-status-chip">
              <span className={`rcp-status-dot ${isInCall ? "live" : (isMatching || zegoConnecting) ? "searching" : ""}`} />
              {isInCall ? "Connected" : (isMatching || zegoConnecting) ? "Searching…" : "Ready"}
            </div>
            {match && !zegoConnecting && (
              <button className="rcp-report-btn" onClick={() => setShowReportSheet(true)} title="Report">
                <Flag size={15} />
              </button>
            )}
          </div>
        </header>

        {/* ─── TOAST ─── */}
        {actionMessage && match && <div className="rcp-toast">{actionMessage}</div>}
        {connectionIssue && !match && <div className="rcp-toast">{connectionIssue}</div>}

        {/* ─── MAIN PANELS ─── */}
        <div
          className="rcp-main"
          style={swipeStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* REMOTE panel */}
          <div className="rcp-panel rcp-panel-remote">
            {/* Zego video */}
            {zegoRenderMatch && (
              <div style={{ position:"absolute", inset:0, opacity: zegoConnecting ? 0 : 1, transition:"opacity 0.4s ease", zIndex:5 }}>
                <VideoRoom
                  key={zegoRenderMatch.roomId}
                  appId={zegoConfig.appId}
                  serverSecret={zegoConfig.serverSecret}
                  roomId={zegoRenderMatch.roomId}
                  userId={user.id}
                  userName={user.fullName}
                  onJoined={() => {
                    window.setTimeout(() => {
                      if (zegoTimeoutRef.current !== null) { window.clearTimeout(zegoTimeoutRef.current); zegoTimeoutRef.current = null; }
                      setZegoConnecting(false); setRoomRevealPending(false);
                      setCallStartedAt(Date.now()); setConnectionIssue("");
                    }, 1100);
                  }}
                />
              </div>
            )}

            {/* Idle / connecting placeholder */}
            {(!zegoRenderMatch || zegoConnecting) && (
              <div className="rcp-panel-idle">
                {(isMatching || zegoConnecting) ? (
                  <>
                    <div className="rcp-spinner" />
                    <p className="rcp-idle-label">
                      {match && zegoConnecting ? `${upcomingPartnerName} is connecting…` : "Looking for someone…"}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="rcp-panel-idle-icon">
                      <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" viewBox="0 0 24 24">
                        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                      </svg>
                    </div>
                    <p className="rcp-idle-label">{connectionIssue ? "Connection lost" : "Tap Start"}</p>
                    {!connectionIssue && <p className="rcp-idle-sub">Meet LPU students via video</p>}
                  </>
                )}
              </div>
            )}

            {/* Live overlay */}
            {match && !zegoConnecting && (
              <div className="rcp-remote-label">
                <div className="rcp-live-pill"><span className="rcp-live-blink" />Live</div>
                <div className="rcp-partner-chip">{match.partner.fullName.split(" ")[0]}</div>
                <div className="rcp-timer-chip">{liveTimer}</div>
              </div>
            )}

            {/* Action buttons */}
            {match && !zegoConnecting && (
              <div className="rcp-panel-actions">
                <button
                  className="rcp-action-btn friend"
                  title={getFriendLabel()}
                  onClick={() => void handleFriendAction()}
                  disabled={Boolean(actionBusy) || relationship?.isBlocked || relationship?.isBlockedByOther || relationship?.isFriend || relationship?.outgoingRequestPending}
                >
                  <UserPlus size={16} />
                </button>
                <button className="rcp-action-btn block" title="Block" onClick={() => setShowBlockSheet(true)} disabled={Boolean(actionBusy)}>
                  <ShieldBan size={16} />
                </button>
              </div>
            )}

            {/* Floating reactions */}
            <div className="rcp-float-layer">
              {floatingReactions.map((r) => (
                <span key={r.id} className={`rcp-float-emoji ${r.own ? "own" : ""}`}>{r.emoji}</span>
              ))}
            </div>

            {/* Mobile swipe visual hints */}
            <div className={`rcp-swipe-hint ${swipeDir === "right" && Math.abs(swipeDelta) > 40 ? "show" : ""}`}>
              <div className="rcp-swipe-hint-label next">→ Next</div>
            </div>
            <div className={`rcp-swipe-hint ${swipeDir === "left" && Math.abs(swipeDelta) > 40 ? "show" : ""}`}>
              <div className="rcp-swipe-hint-label stop">← Stop</div>
            </div>
          </div>

          {/* LOCAL panel */}
          <div className="rcp-panel rcp-panel-local">
            <video ref={localVideoRef} autoPlay muted playsInline style={{ opacity: match ? 0.7 : 1 }} />
            {!match && !isMatching && !hasStarted && (
              <div className="rcp-panel-idle" style={{ background: "transparent" }}>
                <div className="rcp-panel-idle-icon">
                  <svg width="20" height="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                  </svg>
                </div>
                <p className="rcp-idle-label">Your camera</p>
              </div>
            )}
            <span className="rcp-you-label">You</span>
          </div>
        </div>

        {/* ─── BOTTOM CONTROLS ─── */}
        <div className="rcp-bottom">
          {showReactionTray && match && (
            <div className="rcp-reaction-row">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} className="rcp-emoji-pill" onClick={() => triggerReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          {/* Mobile swipe guide */}
          {hasStarted && (
            <div className="rcp-swipe-guide">
              <span className="rcp-swipe-tip"><span>←</span> Stop</span>
              <span className="rcp-swipe-tip"><span>→</span> Next</span>
            </div>
          )}

          <div className="rcp-controls-row">
            <div className="rcp-btn-group">
              {!hasStarted ? (
                <button className="rcp-ctrl-btn" onClick={startMatching} disabled={isMatching}>
                  <div className="rcp-ctrl-icon icon-start"><Play size={22} fill="#0a0a0b" color="#0a0a0b" /></div>
                  <span className="rcp-ctrl-label">Start</span>
                </button>
              ) : (
                <>
                  <button className="rcp-ctrl-btn" onClick={stopMatching}>
                    <div className="rcp-ctrl-icon icon-stop"><PhoneOff size={20} color="#fff" /></div>
                    <span className="rcp-ctrl-label">Stop</span>
                  </button>

                  <button className="rcp-ctrl-btn" onClick={() => setShowReactionTray((p) => !p)} disabled={!match}>
                    <div className="rcp-ctrl-icon icon-react"><SmilePlus size={20} color="rgba(255,255,255,0.75)" /></div>
                    <span className="rcp-ctrl-label">React</span>
                  </button>

                  {/* Chat button - shows drawer on mobile, no-op on desktop (inline input used) */}
                  <button
                    className="rcp-ctrl-btn"
                    onClick={() => setShowLiveChat((p) => !p)}
                    disabled={!match}
                    style={{ display: undefined }} // always show for mobile
                  >
                    <div className={`rcp-ctrl-icon icon-chat ${showLiveChat ? "active" : ""}`}>
                      <MessageCircle size={20} color={showLiveChat ? "#e5ff00" : "rgba(255,255,255,0.75)"} />
                    </div>
                    <span className="rcp-ctrl-label">Chat</span>
                  </button>

                  <button className="rcp-ctrl-btn" onClick={nextMatch} disabled={!match && !isMatching}>
                    <div className="rcp-ctrl-icon icon-next"><SkipForward size={20} color="rgba(255,255,255,0.75)" /></div>
                    <span className="rcp-ctrl-label">Next</span>
                  </button>
                </>
              )}
            </div>

            {/* Desktop inline chat */}
            {match && !zegoConnecting && (
              <form className="rcp-chat-inline" onSubmit={sendLiveChatMessage}>
                <input
                  className="rcp-chat-inline-input"
                  value={liveChatInput}
                  onChange={(e) => setLiveChatInput(e.target.value)}
                  placeholder="Type your message…"
                />
                <button className="rcp-chat-inline-send" type="submit" disabled={!liveChatInput.trim()}>
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* ─── MOBILE CHAT DRAWER ─── */}
        <div className={`rcp-drawer ${showLiveChat ? "open" : ""}`}>
          <div className="rcp-drawer-handle" />
          <div className="rcp-drawer-head">
            <span className="rcp-drawer-title">Live Chat</span>
            <button className="rcp-drawer-close" onClick={() => setShowLiveChat(false)}>
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="rcp-drawer-body" ref={liveChatBodyRef}>
            {liveMessages.length === 0 ? (
              <p className="rcp-drawer-empty">Messages appear here during the call</p>
            ) : null}
            {liveMessages.map((entry) => (
              <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                <p className="rcp-bubble-name">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
          <form className="rcp-drawer-form" onSubmit={sendLiveChatMessage}>
            <input
              className="rcp-drawer-input"
              value={liveChatInput}
              onChange={(e) => setLiveChatInput(e.target.value)}
              placeholder="Type a message…"
            />
            <button className="rcp-drawer-send" type="submit" disabled={!liveChatInput.trim()}>
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* ─── REPORT SHEET ─── */}
        {showReportSheet && match && (
          <div className="rcp-sheet-backdrop" onClick={() => setShowReportSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-close-row">
                <button className="rcp-sheet-x" onClick={() => setShowReportSheet(false)}><X size={14} /></button>
              </div>
              <p className="rcp-sheet-eyebrow">Report</p>
              <p className="rcp-sheet-name">{match.partner.fullName}</p>
              <div className="rcp-chips">
                {["Spam", "Harassment", "Inappropriate", "Fake profile"].map((reason) => (
                  <span key={reason} className={`rcp-chip ${reportReason === reason ? "active" : ""}`} onClick={() => setReportReason(reason)}>{reason}</span>
                ))}
              </div>
              <textarea className="rcp-sheet-textarea" placeholder="Add context (optional)…" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
              <button className="rcp-sheet-btn primary" onClick={() => void submitReport()} disabled={actionBusy === "report"}>Submit Report</button>
            </div>
          </div>
        )}

        {/* ─── BLOCK SHEET ─── */}
        {showBlockSheet && match && (
          <div className="rcp-sheet-backdrop" onClick={() => setShowBlockSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-close-row">
                <button className="rcp-sheet-x" onClick={() => setShowBlockSheet(false)}><X size={14} /></button>
              </div>
              <p className="rcp-sheet-eyebrow">Block User</p>
              <p className="rcp-sheet-name">Block {match.partner.fullName.split(" ")[0]}?</p>
              <p className="rcp-sheet-body">They'll be removed and skipped in all future random matches.</p>
              <textarea className="rcp-sheet-textarea" placeholder="Optional note for yourself" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className="rcp-sheet-btn danger" onClick={() => void confirmBlock()} disabled={actionBusy === "block"}>Block and Continue</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}