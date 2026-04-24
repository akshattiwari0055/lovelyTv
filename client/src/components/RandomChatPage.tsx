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

  // FIX 2: Reversed swipe — left = next, right = stop
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

  // Local camera preview — ONLY before Zego is active
  useEffect(() => {
    if (hasStarted || zegoConnecting || zegoRenderMatch) return;
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
  }, [hasStarted, zegoConnecting, zegoRenderMatch]);

  useEffect(() => {
    if (match) { const t = setTimeout(() => setZegoRenderMatch(match), 800); return () => clearTimeout(t); }
    setZegoRenderMatch(null);
  }, [match]);

  // FIX 1: Remove Zego's built-in hangup/leave button via DOM observer
  useEffect(() => {
    const removeZegoUI = (node: HTMLElement) => {
      // Remove "Media play failed" / "Resume" overlays
      const text = node.textContent || "";
      if (text.includes("Media play failed") || text.includes("Resume")) {
        let target: HTMLElement = node;
        while (target.parentElement && target.parentElement !== document.body) target = target.parentElement;
        target.remove();
        return;
      }
    };

    // Inject CSS to hide Zego's internal leave/hangup button and footer bar
    const style = document.createElement("style");
    style.id = "zego-overrides";
    style.textContent = `
      /* Hide Zego leave/hangup button and bottom toolbar */
      [class*="ZegoRoomFooter"],
      [class*="zego-room-footer"],
      [class*="ZegoLeaveButton"],
      [class*="zego-leave"],
      [class*="ZegoFooter"],
      [class*="footer-leave"],
      [data-testid*="leave"],
      button[title*="Leave"],
      button[title*="leave"],
      button[aria-label*="Leave"],
      button[aria-label*="leave"],
      button[aria-label*="Hang"],
      button[aria-label*="hang"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
      /* Hide any bottom bar Zego renders */
      [class*="ZegoRoom"] > div > div:last-child:has(button) {
        display: none !important;
      }
    `;
    if (!document.getElementById("zego-overrides")) {
      document.head.appendChild(style);
    }

    const observer = new MutationObserver((mutations) =>
      mutations.forEach((m) => m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) removeZegoUI(n); }))
    );
    observer.observe(document.body, { childList: true, subtree: true });
    document.body.querySelectorAll<HTMLElement>("div").forEach((div) => { if (div.parentElement === document.body) removeZegoUI(div); });
    return () => {
      observer.disconnect();
      document.getElementById("zego-overrides")?.remove();
    };
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

  function handleTouchStart(e: React.TouchEvent) {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
    setSwipeDelta(0); setSwipeDir(null);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.touches[0].clientX - swipeStartX.current;
    const dy = e.touches[0].clientY - swipeStartY.current;
    if (Math.abs(dy) > Math.abs(dx) + 10) return;
    setSwipeDelta(dx); setSwipeDir(dx > 0 ? "right" : "left");
  }
  function handleTouchEnd() {
    // FIX 2: REVERSED — left swipe = next, right swipe = stop
    if (Math.abs(swipeDelta) > 80 && hasStarted) {
      if (swipeDir === "left" && isInCall) nextMatch();       // LEFT = Next
      else if (swipeDir === "right") stopMatching();          // RIGHT = Stop
    }
    setSwipeDelta(0); setSwipeDir(null);
    swipeStartX.current = null; swipeStartY.current = null;
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .rcp-root {
          display: flex; flex-direction: column;
          height: 100dvh; width: 100%;
          background: #0a0a0b;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden; position: relative;
        }

        /* TOP BAR */
        .rcp-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: max(env(safe-area-inset-top), 10px) 20px 10px;
          background: #0a0a0b;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0; z-index: 50; height: 52px;
        }
        .rcp-wordmark {
          font-family: 'Syne', sans-serif; font-weight: 800; font-size: 18px;
          color: #fff; letter-spacing: -0.5px; cursor: pointer;
          display: flex; align-items: center; gap: 8px; user-select: none;
        }
        .rcp-badge {
          font-size: 10px; font-weight: 600; letter-spacing: 1.5px;
          color: #e5ff00; text-transform: uppercase;
          background: rgba(229,255,0,0.1); border: 1px solid rgba(229,255,0,0.25);
          border-radius: 4px; padding: 2px 6px; font-family: 'DM Sans', sans-serif;
        }
        .rcp-topbar-right { display: flex; align-items: center; gap: 10px; }
        .rcp-status-chip {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 12px; border-radius: 100px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.6);
        }
        .rcp-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #555; flex-shrink: 0;
        }
        .rcp-dot.live { background: #4ade80; box-shadow: 0 0 8px #4ade8080; }
        .rcp-dot.searching { background: #e5ff00; animation: rcpPulse 1.2s ease-in-out infinite; }
        @keyframes rcpPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.75)} }
        .rcp-flag-btn {
          width: 34px; height: 34px; border-radius: 10px;
          background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
          display: flex; align-items: center; justify-content: center;
          color: #f87171; cursor: pointer; transition: background 0.15s;
        }
        .rcp-flag-btn:hover { background: rgba(239,68,68,0.2); }

        /* BODY */
        .rcp-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }

        /* Desktop: video | chat sidebar */
        @media (min-width: 769px) {
          .rcp-body { flex-direction: row; }
          .rcp-vcol {
            flex: 0 0 62%; position: relative;
            background: #0d0d10;
            border-right: 1px solid rgba(255,255,255,0.06);
          }
          .rcp-sidebar { flex: 1; display: flex; flex-direction: column; background: #0a0a0c; }
        }
        /* Mobile: video full width, no sidebar */
        @media (max-width: 768px) {
          .rcp-body { flex-direction: column; }
          .rcp-vcol { flex: 1; position: relative; background: #0d0d10; min-height: 0; }
          .rcp-sidebar { display: none; }
        }

        /* Zego fills entire video column — both local + remote inside */
        .rcp-zego-fill {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
        }

        /* FIX 1: Aggressively hide Zego's built-in leave/hangup button */
        .rcp-zego-fill [class*="footer"],
        .rcp-zego-fill [class*="Footer"],
        .rcp-zego-fill [class*="leave"],
        .rcp-zego-fill [class*="Leave"],
        .rcp-zego-fill [class*="hangup"],
        .rcp-zego-fill [class*="Hangup"],
        .rcp-zego-fill [class*="toolbar"],
        .rcp-zego-fill [class*="Toolbar"],
        .rcp-zego-fill [class*="bottom-bar"],
        .rcp-zego-fill button[title*="Leave"],
        .rcp-zego-fill button[aria-label*="Leave"],
        .rcp-zego-fill button[aria-label*="leave"],
        .rcp-zego-fill button[aria-label*="Hang"],
        .rcp-zego-fill svg[class*="phone"] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          opacity: 0 !important;
        }

        /* Idle / connecting screen */
        .rcp-idle {
          position: absolute; inset: 0; z-index: 2;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 0;
          background: linear-gradient(145deg, #0e0e16 0%, #0a0a0f 100%);
          padding: 20px;
        }

        /* FIX 3: Idle video preview — large, full-area layout matching connected state */
        .rcp-idle-video-wrap {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          overflow: hidden;
        }
        .rcp-idle-video-wrap video {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        /* Dark overlay so text is readable over the preview */
        .rcp-idle-video-wrap::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.15) 0%,
            rgba(0,0,0,0.05) 40%,
            rgba(0,0,0,0.35) 100%
          );
          pointer-events: none;
        }
        /* Overlay content on top of the full-screen preview */
        .rcp-idle-overlay {
          position: absolute; inset: 0; z-index: 3;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px;
          pointer-events: none;
        }
        .rcp-idle-icon {
          width: 56px; height: 56px; border-radius: 18px;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.12);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-idle-txt {
          font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.9);
          text-shadow: 0 1px 8px rgba(0,0,0,0.6);
        }
        .rcp-idle-sub {
          font-size: 12px; color: rgba(255,255,255,0.5);
          text-shadow: 0 1px 6px rgba(0,0,0,0.5);
        }
        /* "You" label at bottom-left of preview, like connected state */
        .rcp-you-tag {
          position: absolute; bottom: 14px; left: 14px; z-index: 4;
          background: rgba(0,0,0,0.55); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 4px 12px;
          font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6);
          text-transform: uppercase; letter-spacing: 0.8px;
          font-family: 'Syne', sans-serif;
        }

        /* Spinner */
        .rcp-spin-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; position: relative; z-index: 3; }
        .rcp-spin {
          width: 44px; height: 44px; position: relative;
        }
        .rcp-spin::before, .rcp-spin::after {
          content: ''; position: absolute; border-radius: 50%;
          border: 2px solid transparent; border-top-color: #e5ff00;
          animation: rcpSpin 1s linear infinite;
          top: 0; left: 0; width: 100%; height: 100%;
        }
        .rcp-spin::after {
          width: 28px; height: 28px; top: 8px; left: 8px;
          animation-duration: 0.65s; border-top-color: rgba(229,255,0,0.25);
        }
        @keyframes rcpSpin { to { transform: rotate(360deg); } }

        /* Connecting overlay on top of Zego */
        .rcp-connecting {
          position: absolute; inset: 0; z-index: 10;
          background: #0d0d10;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 14px;
          transition: opacity 0.4s ease;
        }

        /* In-call badges */
        .rcp-call-badges {
          position: absolute; top: 14px; left: 14px;
          display: flex; align-items: center; gap: 8px;
          z-index: 5; pointer-events: none;
        }
        .rcp-live-pill {
          display: flex; align-items: center; gap: 5px;
          background: rgba(220,38,38,0.9); border-radius: 6px; padding: 4px 8px;
          font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 1px;
          text-transform: uppercase; font-family: 'Syne', sans-serif;
        }
        .rcp-live-blink { width: 5px; height: 5px; border-radius: 50%; background: #fff; animation: rcpPulse 0.9s infinite; }
        .rcp-name-chip {
          background: rgba(0,0,0,0.55); backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 4px 10px;
          font-size: 12px; font-weight: 600; color: #fff;
        }
        .rcp-timer-chip {
          background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);
          border-radius: 6px; padding: 3px 8px;
          font-size: 11px; color: rgba(255,255,255,0.55);
          font-variant-numeric: tabular-nums;
        }
        .rcp-call-actions {
          position: absolute; top: 14px; right: 14px;
          display: flex; flex-direction: column; gap: 8px; z-index: 5;
        }
        .rcp-act-btn {
          width: 38px; height: 38px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: none; transition: transform 0.12s, opacity 0.15s;
        }
        .rcp-act-btn:active { transform: scale(0.88); }
        .rcp-act-btn:disabled { opacity: 0.3; cursor: default; }
        .rcp-act-btn.friend { background: rgba(167,139,250,0.15); border: 1px solid rgba(167,139,250,0.3); color: #a78bfa; }
        .rcp-act-btn.block  { background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.25); color: #f87171; }

        /* Floating reactions */
        .rcp-floats {
          position: absolute; bottom: 16px; left: 16px;
          pointer-events: none; z-index: 6;
          display: flex; flex-direction: column-reverse; gap: 4px;
        }
        .rcp-emoji { font-size: 28px; animation: rcpFloat 2.2s ease-out forwards; }
        .rcp-emoji.own { filter: drop-shadow(0 0 8px rgba(229,255,0,0.5)); }
        @keyframes rcpFloat {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-100px) scale(1.5); }
        }

        /* FIX 2: Swipe hints — reversed labels */
        .rcp-swipe-hint {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 8; opacity: 0; transition: opacity 0.15s;
        }
        .rcp-swipe-hint.on { opacity: 1; }
        .rcp-swipe-lbl {
          font-size: 22px; font-weight: 800;
          font-family: 'Syne', sans-serif;
          padding: 10px 24px; border-radius: 14px; backdrop-filter: blur(14px);
        }
        /* LEFT = Next (was right) */
        .rcp-swipe-lbl.next { background: rgba(229,255,0,0.18); border: 2px solid rgba(229,255,0,0.5); color: #e5ff00; }
        /* RIGHT = Stop (was left) */
        .rcp-swipe-lbl.stop { background: rgba(239,68,68,0.18); border: 2px solid rgba(239,68,68,0.5); color: #f87171; }

        /* DESKTOP SIDEBAR */
        .rcp-sidebar-head {
          padding: 16px 18px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;
        }
        .rcp-sidebar-title {
          font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.25);
          letter-spacing: 1.2px; text-transform: uppercase; font-family: 'Syne', sans-serif;
        }
        .rcp-sidebar-msgs {
          flex: 1; overflow-y: auto; padding: 12px 16px;
          display: flex; flex-direction: column; gap: 10px;
          overscroll-behavior: contain;
        }
        .rcp-sidebar-empty {
          text-align: center; font-size: 13px; color: rgba(255,255,255,0.18);
          padding: 30px 0; line-height: 1.7;
        }
        .rcp-sidebar-form {
          display: flex; gap: 8px;
          padding: 12px 16px max(env(safe-area-inset-bottom),14px);
          border-top: 1px solid rgba(255,255,255,0.05); flex-shrink: 0;
        }
        .rcp-sidebar-input {
          flex: 1; background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 12px; padding: 11px 14px;
          font-size: 13px; color: #fff; outline: none; font-family: 'DM Sans', sans-serif;
        }
        .rcp-sidebar-input::placeholder { color: rgba(255,255,255,0.22); }
        .rcp-sidebar-input:focus { border-color: rgba(229,255,0,0.3); }
        .rcp-sidebar-send {
          width: 42px; height: 42px; flex-shrink: 0;
          border-radius: 12px; background: #e5ff00;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #0a0a0b; align-self: flex-end;
          transition: transform 0.1s, opacity 0.15s;
        }
        .rcp-sidebar-send:disabled { background: #1e1e26; color: #444; }
        .rcp-sidebar-send:not(:disabled):active { transform: scale(0.9); }

        /* Bubbles */
        .rcp-bubble {
          max-width: 82%; padding: 9px 13px;
          border-radius: 14px; font-size: 13px; line-height: 1.5; color: #fff;
        }
        .rcp-bubble.mine   { align-self: flex-end; background: #e5ff00; color: #0a0a0b; border-bottom-right-radius: 4px; }
        .rcp-bubble.theirs { align-self: flex-start; background: #17171f; border: 1px solid rgba(255,255,255,0.06); border-bottom-left-radius: 4px; }
        .rcp-bubble-name   { font-size: 10px; opacity: 0.55; margin-bottom: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

        /* BOTTOM CONTROLS */
        .rcp-controls {
          flex-shrink: 0; background: #0a0a0b;
          border-top: 1px solid rgba(255,255,255,0.06);
          padding: 12px 20px max(env(safe-area-inset-bottom),14px);
          display: flex; align-items: center; gap: 10px; z-index: 50;
          position: relative;
        }
        .rcp-react-tray {
          position: absolute; bottom: 100%; left: 0; right: 0;
          display: flex; justify-content: center; gap: 10px; padding: 10px;
          background: #0a0a0b; border-top: 1px solid rgba(255,255,255,0.06);
          animation: rcpUp 0.18s ease;
        }
        @keyframes rcpUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .rcp-emoji-btn {
          padding: 8px 16px; border-radius: 100px;
          background: #17171f; border: 1px solid rgba(255,255,255,0.08);
          font-size: 20px; cursor: pointer; transition: transform 0.1s;
        }
        .rcp-emoji-btn:active { transform: scale(0.85); }

        .rcp-btn-grp { display: flex; align-items: center; gap: 8px; }
        .rcp-cb {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          background: none; border: none; cursor: pointer; color: #fff; padding: 0; min-width: 52px;
        }
        .rcp-cb:disabled { opacity: 0.3; cursor: default; }
        .rcp-ci {
          width: 52px; height: 52px; border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, filter 0.15s;
        }
        .rcp-cb:not(:disabled):active .rcp-ci { transform: scale(0.9); filter: brightness(0.85); }
        .rcp-cl {
          font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.35);
          letter-spacing: 0.8px; text-transform: uppercase; font-family: 'Syne', sans-serif;
        }
        .ci-start { background: #e5ff00; color: #0a0a0b; }
        .ci-stop  { background: #dc2626; }
        .ci-next  { background: #17171f; border: 1px solid rgba(255,255,255,0.09); }
        .ci-react { background: #17171f; border: 1px solid rgba(255,255,255,0.09); }
        .ci-chat  { background: #17171f; border: 1px solid rgba(255,255,255,0.09); }
        .ci-chat.on { background: rgba(229,255,0,0.1); border-color: rgba(229,255,0,0.3); }

        /* FIX 2: Swipe guide labels updated */
        .rcp-swipe-guide { display: none; margin-left: auto; }
        @media (max-width: 768px) {
          .rcp-swipe-guide { display: flex; flex-direction: column; gap: 3px; align-items: flex-end; }
          .rcp-swipe-tip { font-size: 10px; color: rgba(255,255,255,0.18); font-weight: 500; }
        }

        /* MOBILE DRAWER */
        .rcp-drawer {
          position: absolute; bottom: 0; left: 0; right: 0; z-index: 80;
          background: rgba(11,11,15,0.98); backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px 20px 0 0;
          transform: translateY(100%);
          transition: transform 0.28s cubic-bezier(0.32,0.72,0,1);
          max-height: 55%; display: flex; flex-direction: column;
        }
        .rcp-drawer.open { transform: translateY(0); }
        .rcp-drawer-handle { width: 36px; height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; margin: 12px auto 0; flex-shrink: 0; }
        .rcp-drawer-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
        }
        .rcp-drawer-title { font-size: 14px; font-weight: 700; color: #fff; font-family: 'Syne', sans-serif; }
        .rcp-drawer-close {
          width: 30px; height: 30px; border-radius: 50%;
          background: rgba(255,255,255,0.07); border: none;
          cursor: pointer; color: rgba(255,255,255,0.6);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-drawer-body {
          flex: 1; overflow-y: auto; padding: 10px 14px;
          display: flex; flex-direction: column; gap: 10px;
          overscroll-behavior: contain;
        }
        .rcp-drawer-empty { text-align: center; font-size: 13px; color: rgba(255,255,255,0.2); padding: 20px 0; }
        .rcp-drawer-form {
          display: flex; gap: 8px;
          padding: 10px 14px max(env(safe-area-inset-bottom),14px);
          border-top: 1px solid rgba(255,255,255,0.06); flex-shrink: 0;
        }
        .rcp-drawer-input {
          flex: 1; background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
          padding: 10px 14px; font-size: 13px; color: #fff; outline: none;
          font-family: 'DM Sans', sans-serif;
        }
        .rcp-drawer-input::placeholder { color: rgba(255,255,255,0.25); }
        .rcp-drawer-input:focus { border-color: rgba(229,255,0,0.3); }
        .rcp-drawer-send {
          width: 40px; height: 40px; border-radius: 12px; background: #e5ff00;
          border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: #0a0a0b; flex-shrink: 0; align-self: flex-end; transition: transform 0.1s;
        }
        .rcp-drawer-send:disabled { background: #1a1a22; color: #444; }
        .rcp-drawer-send:active { transform: scale(0.9); }

        /* TOAST */
        .rcp-toast {
          position: absolute; top: 62px; left: 50%; transform: translateX(-50%);
          z-index: 100; background: rgba(10,10,12,0.92); backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.1); border-radius: 100px; padding: 8px 18px;
          font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.9); white-space: nowrap;
          pointer-events: none; animation: rcpToast 0.2s ease;
        }
        @keyframes rcpToast { from{opacity:0;transform:translateX(-50%) translateY(6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

        /* SHEETS */
        .rcp-backdrop {
          position: absolute; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.65); display: flex; align-items: flex-end;
          animation: rcpFade 0.15s ease;
        }
        @keyframes rcpFade { from{opacity:0} to{opacity:1} }
        .rcp-sheet {
          background: #12121a; border-radius: 20px 20px 0 0;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 0 20px max(env(safe-area-inset-bottom),28px); width: 100%;
          animation: rcpUp 0.22s cubic-bezier(0.32,0.72,0,1);
        }
        .rcp-sheet-handle { width: 36px; height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; margin: 12px auto 18px; }
        .rcp-sheet-eyebrow { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.3); letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 4px; font-family: 'Syne', sans-serif; }
        .rcp-sheet-name { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 18px; font-family: 'Syne', sans-serif; }
        .rcp-sheet-body-txt { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 18px; line-height: 1.6; }
        .rcp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .rcp-chip {
          padding: 8px 16px; border-radius: 100px; font-size: 12px; font-weight: 600;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s;
        }
        .rcp-chip.on { background: rgba(229,255,0,0.12); border-color: rgba(229,255,0,0.35); color: #e5ff00; }
        .rcp-sheet-ta {
          width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px; padding: 12px 14px; font-size: 13px; color: #fff;
          min-height: 76px; resize: none; outline: none; font-family: 'DM Sans', sans-serif;
          margin-bottom: 16px; line-height: 1.5; box-sizing: border-box;
        }
        .rcp-sheet-ta::placeholder { color: rgba(255,255,255,0.2); }
        .rcp-sheet-ta:focus { border-color: rgba(229,255,0,0.3); }
        .rcp-sheet-btn {
          width: 100%; padding: 15px; border-radius: 14px; border: none;
          font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Syne', sans-serif;
          transition: opacity 0.15s, transform 0.1s; letter-spacing: 0.2px;
        }
        .rcp-sheet-btn:disabled { opacity: 0.5; }
        .rcp-sheet-btn:active { transform: scale(0.98); }
        .rcp-sheet-btn.primary { background: #e5ff00; color: #0a0a0b; }
        .rcp-sheet-btn.danger  { background: #dc2626; color: #fff; }
        .rcp-sheet-xrow { display: flex; justify-content: flex-end; margin-bottom: 4px; }
        .rcp-sheet-x {
          background: rgba(255,255,255,0.07); border: none; border-radius: 50%;
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.5); cursor: pointer;
        }
      `}</style>

      <div className="rcp-root">

        {/* TOP BAR */}
        <header className="rcp-topbar">
          <div className="rcp-wordmark" onClick={() => navigate("/app")}>
            LPU TV <span className="rcp-badge">Beta</span>
          </div>
          <div className="rcp-topbar-right">
            <div className="rcp-status-chip">
              <span className={`rcp-dot ${isInCall ? "live" : (isMatching || zegoConnecting) ? "searching" : ""}`} />
              {isInCall ? "Connected" : (isMatching || zegoConnecting) ? "Searching…" : "Ready"}
            </div>
            {isInCall && (
              <button className="rcp-flag-btn" onClick={() => setShowReportSheet(true)}>
                <Flag size={15} />
              </button>
            )}
          </div>
        </header>

        {/* TOAST */}
        {actionMessage && match && <div className="rcp-toast">{actionMessage}</div>}
        {connectionIssue && !match && <div className="rcp-toast">{connectionIssue}</div>}

        {/* BODY */}
        <div className="rcp-body">

          {/* VIDEO COLUMN */}
          <div
            className="rcp-vcol"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={Math.abs(swipeDelta) > 20
              ? { transform: `translateX(${swipeDelta * 0.12}px)`, transition: "none" }
              : { transform: "translateX(0)", transition: "transform 0.3s ease" }
            }
          >
            {/* Zego VideoRoom — fills entire column */}
            {zegoRenderMatch && (
              <div
                className="rcp-zego-fill"
                style={{ opacity: zegoConnecting ? 0 : 1, transition: "opacity 0.4s ease", zIndex: 1 }}
              >
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

            {/* Connecting overlay */}
            {zegoConnecting && (
              <div className="rcp-connecting">
                <div className="rcp-spin" />
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                  {match ? `${upcomingPartnerName} is connecting…` : "Connecting…"}
                </p>
              </div>
            )}

            {/* FIX 3: Idle screen — full-area video preview matching connected-state layout */}
            {!zegoRenderMatch && !zegoConnecting && (
              <div className="rcp-idle">
                {isMatching ? (
                  <div className="rcp-spin-wrap">
                    <div className="rcp-spin" />
                    <p className="rcp-idle-txt">Looking for someone…</p>
                  </div>
                ) : (
                  <>
                    {/* Full-area camera preview */}
                    <div className="rcp-idle-video-wrap">
                      <video ref={localVideoRef} autoPlay muted playsInline />
                    </div>

                    {/* Centered overlay: icon + text */}
                    <div className="rcp-idle-overlay">
                      <div className="rcp-idle-icon">
                        <svg width="24" height="24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                      <p className="rcp-idle-txt">{connectionIssue ? "Connection lost" : "Tap Start to begin"}</p>
                      {!connectionIssue && <p className="rcp-idle-sub">Meet LPU students via video</p>}
                    </div>

                    {/* "You" label — bottom-left, same as connected state */}
                    <span className="rcp-you-tag">You</span>
                  </>
                )}
              </div>
            )}

            {/* In-call badges */}
            {isInCall && (
              <div className="rcp-call-badges">
                <div className="rcp-live-pill"><span className="rcp-live-blink" />Live</div>
                <div className="rcp-name-chip">{match!.partner.fullName.split(" ")[0]}</div>
                <div className="rcp-timer-chip">{liveTimer}</div>
              </div>
            )}

            {/* In-call actions */}
            {isInCall && (
              <div className="rcp-call-actions">
                <button
                  className="rcp-act-btn friend"
                  title={getFriendLabel()}
                  onClick={() => void handleFriendAction()}
                  disabled={Boolean(actionBusy) || relationship?.isBlocked || relationship?.isBlockedByOther || relationship?.isFriend || relationship?.outgoingRequestPending}
                >
                  <UserPlus size={16} />
                </button>
                <button className="rcp-act-btn block" onClick={() => setShowBlockSheet(true)} disabled={Boolean(actionBusy)}>
                  <ShieldBan size={16} />
                </button>
              </div>
            )}

            {/* Floating reactions */}
            <div className="rcp-floats">
              {floatingReactions.map((r) => (
                <span key={r.id} className={`rcp-emoji ${r.own ? "own" : ""}`}>{r.emoji}</span>
              ))}
            </div>

            {/* FIX 2: Swipe hints — left = next, right = stop */}
            <div className={`rcp-swipe-hint ${swipeDir === "left" && Math.abs(swipeDelta) > 40 ? "on" : ""}`}>
              <div className="rcp-swipe-lbl next">← Next</div>
            </div>
            <div className={`rcp-swipe-hint ${swipeDir === "right" && Math.abs(swipeDelta) > 40 ? "on" : ""}`}>
              <div className="rcp-swipe-lbl stop">→ Stop</div>
            </div>
          </div>

          {/* DESKTOP CHAT SIDEBAR */}
          <div className="rcp-sidebar">
            <div className="rcp-sidebar-head">
              <p className="rcp-sidebar-title">Live Chat</p>
            </div>
            <div className="rcp-sidebar-msgs" ref={liveChatBodyRef}>
              {liveMessages.length === 0 && (
                <p className="rcp-sidebar-empty">
                  {isInCall ? "Say something!\nMessages appear here." : "Chat messages will\nappear here during a call."}
                </p>
              )}
              {liveMessages.map((entry) => (
                <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                  <p className="rcp-bubble-name">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                  <p>{entry.message}</p>
                </div>
              ))}
            </div>
            <form className="rcp-sidebar-form" onSubmit={sendLiveChatMessage}>
              <input
                className="rcp-sidebar-input"
                value={liveChatInput}
                onChange={(e) => setLiveChatInput(e.target.value)}
                placeholder={isInCall ? "Type your message…" : "Start a call to chat"}
                disabled={!isInCall}
              />
              <button className="rcp-sidebar-send" type="submit" disabled={!liveChatInput.trim() || !isInCall}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* BOTTOM CONTROLS */}
        <div className="rcp-controls">
          {showReactionTray && isInCall && (
            <div className="rcp-react-tray">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} className="rcp-emoji-btn" onClick={() => triggerReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          <div className="rcp-btn-grp">
            {!hasStarted ? (
              <button className="rcp-cb" onClick={startMatching} disabled={isMatching}>
                <div className="rcp-ci ci-start"><Play size={22} fill="#0a0a0b" color="#0a0a0b" /></div>
                <span className="rcp-cl">Start</span>
              </button>
            ) : (
              <>
                <button className="rcp-cb" onClick={stopMatching}>
                  <div className="rcp-ci ci-stop"><PhoneOff size={20} color="#fff" /></div>
                  <span className="rcp-cl">Stop</span>
                </button>
                <button className="rcp-cb" onClick={() => setShowReactionTray((p) => !p)} disabled={!isInCall}>
                  <div className="rcp-ci ci-react"><SmilePlus size={20} color="rgba(255,255,255,0.75)" /></div>
                  <span className="rcp-cl">React</span>
                </button>
                <button className="rcp-cb" onClick={() => setShowLiveChat((p) => !p)} disabled={!isInCall}>
                  <div className={`rcp-ci ci-chat ${showLiveChat ? "on" : ""}`}>
                    <MessageCircle size={20} color={showLiveChat ? "#e5ff00" : "rgba(255,255,255,0.75)"} />
                  </div>
                  <span className="rcp-cl">Chat</span>
                </button>
                <button className="rcp-cb" onClick={nextMatch} disabled={!isInCall && !isMatching}>
                  <div className="rcp-ci ci-next"><SkipForward size={20} color="rgba(255,255,255,0.75)" /></div>
                  <span className="rcp-cl">Next</span>
                </button>
              </>
            )}
          </div>

          {/* FIX 2: Swipe guide labels — reversed */}
          {hasStarted && (
            <div className="rcp-swipe-guide">
              <span className="rcp-swipe-tip">→ Swipe right to stop</span>
              <span className="rcp-swipe-tip">← Swipe left for next</span>
            </div>
          )}
        </div>

        {/* MOBILE CHAT DRAWER */}
        <div className={`rcp-drawer ${showLiveChat ? "open" : ""}`}>
          <div className="rcp-drawer-handle" />
          <div className="rcp-drawer-head">
            <span className="rcp-drawer-title">Live Chat</span>
            <button className="rcp-drawer-close" onClick={() => setShowLiveChat(false)}><ChevronDown size={16} /></button>
          </div>
          <div className="rcp-drawer-body">
            {liveMessages.length === 0 && <p className="rcp-drawer-empty">Messages appear here during the call</p>}
            {liveMessages.map((entry) => (
              <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                <p className="rcp-bubble-name">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
          <form className="rcp-drawer-form" onSubmit={sendLiveChatMessage}>
            <input className="rcp-drawer-input" value={liveChatInput} onChange={(e) => setLiveChatInput(e.target.value)} placeholder="Type a message…" />
            <button className="rcp-drawer-send" type="submit" disabled={!liveChatInput.trim()}><Send size={15} /></button>
          </form>
        </div>

        {/* REPORT SHEET */}
        {showReportSheet && match && (
          <div className="rcp-backdrop" onClick={() => setShowReportSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-xrow"><button className="rcp-sheet-x" onClick={() => setShowReportSheet(false)}><X size={14} /></button></div>
              <p className="rcp-sheet-eyebrow">Report</p>
              <p className="rcp-sheet-name">{match.partner.fullName}</p>
              <div className="rcp-chips">
                {["Spam", "Harassment", "Inappropriate", "Fake profile"].map((r) => (
                  <span key={r} className={`rcp-chip ${reportReason === r ? "on" : ""}`} onClick={() => setReportReason(r)}>{r}</span>
                ))}
              </div>
              <textarea className="rcp-sheet-ta" placeholder="Add context (optional)…" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
              <button className="rcp-sheet-btn primary" onClick={() => void submitReport()} disabled={actionBusy === "report"}>Submit Report</button>
            </div>
          </div>
        )}

        {/* BLOCK SHEET */}
        {showBlockSheet && match && (
          <div className="rcp-backdrop" onClick={() => setShowBlockSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-xrow"><button className="rcp-sheet-x" onClick={() => setShowBlockSheet(false)}><X size={14} /></button></div>
              <p className="rcp-sheet-eyebrow">Block User</p>
              <p className="rcp-sheet-name">Block {match.partner.fullName.split(" ")[0]}?</p>
              <p className="rcp-sheet-body-txt">They'll be removed and skipped in all future random matches.</p>
              <textarea className="rcp-sheet-ta" placeholder="Optional note for yourself" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className="rcp-sheet-btn danger" onClick={() => void confirmBlock()} disabled={actionBusy === "block"}>Block and Continue</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}