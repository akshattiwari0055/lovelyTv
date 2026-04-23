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
            return;
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
      setConnectionIssue("Video connection timed out. Tap Next to try another partner.");
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
      setActionMessage("Report submitted. Thanks for helping keep the chat safe.");
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
      {/* ── Global styles ── */}
      <style>{`
        .rcp-root {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          background: #0d0d0f;
          position: relative;
          overflow: hidden;
          font-family: -apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif;
        }

        /* ── Header ── */
        .rcp-header {
          position: absolute;
          top: 0; left: 0; right: 0;
          z-index: 40;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: env(safe-area-inset-top, 12px) 16px 12px;
          padding-top: max(env(safe-area-inset-top), 12px);
          background: linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%);
        }
        .rcp-logo {
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .rcp-logo-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #a78bfa;
        }
        .rcp-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .rcp-status-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 5px 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.85);
          font-weight: 500;
        }
        .rcp-status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #6b7280;
          transition: background 0.3s;
        }
        .rcp-status-dot.live { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
        .rcp-status-dot.searching {
          background: #fb923c;
          animation: rcp-blink 1s ease-in-out infinite;
        }
        @keyframes rcp-blink { 0%,100%{opacity:1} 50%{opacity:0.35} }

        /* ── Two-block video layout ── */
        .rcp-video-stack {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .rcp-block {
          position: relative;
          overflow: hidden;
          flex: 1;
        }
        .rcp-block-remote { flex: 1.15; }
        .rcp-block-local  { flex: 0.85; border-top: 2px solid #1a1a1f; }

        .rcp-block video {
          width: 100%; height: 100%;
          object-fit: cover;
          display: block;
        }
        .rcp-block-bg {
          width: 100%; height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 12px;
        }
        .rcp-block-remote .rcp-block-bg { background: linear-gradient(165deg, #141428 0%, #0f1f35 100%); }
        .rcp-block-local .rcp-block-bg  { background: linear-gradient(165deg, #1a1a1a 0%, #111 100%); }

        /* pulse rings for waiting */
        .rcp-pulse-wrap {
          position: relative;
          width: 60px; height: 60px;
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-pulse-ring {
          position: absolute;
          border-radius: 50%;
          border: 1.5px solid rgba(167,139,250,0.4);
          animation: rcp-pulse-out 2s ease-out infinite;
        }
        .rcp-pulse-ring:nth-child(1) { width: 60px; height: 60px; animation-delay: 0s; }
        .rcp-pulse-ring:nth-child(2) { width: 44px; height: 44px; animation-delay: 0.5s; }
        @keyframes rcp-pulse-out {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .rcp-pulse-icon {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: rgba(167,139,250,0.15);
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 1;
        }
        .rcp-idle-text {
          font-size: 14px;
          color: rgba(255,255,255,0.45);
          font-weight: 400;
          letter-spacing: 0.1px;
        }
        .rcp-idle-sub {
          font-size: 12px;
          color: rgba(255,255,255,0.22);
        }

        /* partner name + timer overlay on remote block */
        .rcp-remote-overlay {
          position: absolute;
          top: 0; left: 0; right: 0;
          padding: 56px 14px 12px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%);
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: none;
        }
        .rcp-live-pill {
          display: flex; align-items: center; gap: 4px;
          background: rgba(239,68,68,0.85);
          border-radius: 6px;
          padding: 3px 7px;
          font-size: 11px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .rcp-live-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #fff;
          animation: rcp-blink 1s infinite;
        }
        .rcp-partner-name {
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 4px rgba(0,0,0,0.5);
        }
        .rcp-timer {
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          font-variant-numeric: tabular-nums;
          margin-left: auto;
        }

        /* action buttons on remote block (top-right) */
        .rcp-block-actions {
          position: absolute;
          top: 52px; right: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          z-index: 20;
        }
        .rcp-icon-btn {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: rgba(0,0,0,0.45);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.12);
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.85);
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .rcp-icon-btn:active { transform: scale(0.92); }
        .rcp-icon-btn.friend  { color: #a78bfa; }
        .rcp-icon-btn.report  { color: #fbbf24; }
        .rcp-icon-btn.block   { color: #f87171; }
        .rcp-icon-btn.chat-active { background: rgba(167,139,250,0.25); border-color: rgba(167,139,250,0.4); }

        /* local block label */
        .rcp-local-label {
          position: absolute;
          bottom: 8px; left: 10px;
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          background: rgba(0,0,0,0.35);
          border-radius: 6px;
          padding: 2px 7px;
        }

        /* floating reactions */
        .rcp-reactions-layer {
          position: absolute;
          bottom: 0; left: 14px;
          display: flex;
          flex-direction: column-reverse;
          gap: 4px;
          pointer-events: none;
          z-index: 30;
        }
        .rcp-float-emoji {
          font-size: 26px;
          animation: rcp-float 2.2s ease-out forwards;
        }
        .rcp-float-emoji.own { filter: drop-shadow(0 0 6px rgba(167,139,250,0.7)); }
        @keyframes rcp-float {
          0%   { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-90px) scale(1.4); }
        }

        /* toast */
        .rcp-toast {
          position: absolute;
          top: 56px; left: 50%;
          transform: translateX(-50%);
          z-index: 50;
          background: rgba(10,10,15,0.85);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          pointer-events: none;
          animation: rcp-fade-in 0.2s ease;
        }
        @keyframes rcp-fade-in { from{opacity:0;transform:translateX(-50%) translateY(4px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }

        /* ── Bottom controls ── */
        .rcp-controls {
          flex-shrink: 0;
          background: #0d0d0f;
          border-top: 1px solid #1a1a1f;
          padding: 12px 16px max(env(safe-area-inset-bottom), 16px);
        }
        .rcp-reaction-tray {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
          animation: rcp-slide-up 0.2s ease;
        }
        @keyframes rcp-slide-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .rcp-emoji-btn {
          width: 44px; height: 44px;
          border-radius: 50%;
          background: #1c1c24;
          border: 1px solid #2a2a35;
          font-size: 20px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.1s, background 0.15s;
        }
        .rcp-emoji-btn:active { transform: scale(0.88); background: #252535; }

        .rcp-btn-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }
        .rcp-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          background: none;
          border: none;
          cursor: pointer;
          color: #fff;
          padding: 0;
          min-width: 56px;
        }
        .rcp-btn:disabled { opacity: 0.35; cursor: default; }
        .rcp-btn-circle {
          width: 56px; height: 56px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, filter 0.15s;
        }
        .rcp-btn:active .rcp-btn-circle { transform: scale(0.92); }
        .rcp-btn-label {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          font-weight: 500;
          letter-spacing: 0.2px;
        }

        .rcp-btn-start .rcp-btn-circle  { background: #7c3aed; }
        .rcp-btn-stop .rcp-btn-circle   { background: #dc2626; }
        .rcp-btn-next .rcp-btn-circle   { background: #1c1c28; border: 1px solid #2a2a3a; }
        .rcp-btn-react .rcp-btn-circle  { background: #1c1c28; border: 1px solid #2a2a3a; }
        .rcp-btn-chat .rcp-btn-circle   { background: #1c1c28; border: 1px solid #2a2a3a; }
        .rcp-btn-chat.active .rcp-btn-circle { background: rgba(167,139,250,0.18); border-color: rgba(167,139,250,0.35); }
        .rcp-btn-chat.active .rcp-btn-label  { color: #a78bfa; }

        /* ── Live chat drawer ── */
        .rcp-chat-drawer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          z-index: 60;
          background: rgba(13,13,18,0.97);
          backdrop-filter: blur(16px);
          border-top: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px 20px 0 0;
          transform: translateY(100%);
          transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
          max-height: 60%;
          display: flex;
          flex-direction: column;
        }
        .rcp-chat-drawer.open { transform: translateY(0); }
        .rcp-chat-handle {
          width: 36px; height: 4px;
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
          margin: 10px auto 0;
          flex-shrink: 0;
        }
        .rcp-chat-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .rcp-chat-title { font-size: 14px; font-weight: 600; color: #fff; }
        .rcp-chat-close {
          width: 28px; height: 28px; border-radius: 50%;
          background: rgba(255,255,255,0.08);
          border: none; cursor: pointer; color: rgba(255,255,255,0.7);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-chat-body {
          flex: 1;
          overflow-y: auto;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          overscroll-behavior: contain;
        }
        .rcp-chat-empty {
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,0.25);
          padding: 24px 0;
        }
        .rcp-bubble {
          max-width: 78%;
          padding: 8px 12px;
          border-radius: 16px;
          font-size: 13px;
          line-height: 1.45;
          color: #fff;
        }
        .rcp-bubble.mine    { align-self: flex-end; background: #6d28d9; border-bottom-right-radius: 4px; }
        .rcp-bubble.theirs  { align-self: flex-start; background: #1e1e28; border: 1px solid rgba(255,255,255,0.06); border-bottom-left-radius: 4px; }
        .rcp-bubble-sender  { font-size: 10px; opacity: 0.55; margin-bottom: 3px; font-weight: 500; }
        .rcp-chat-form {
          display: flex; gap: 8px;
          padding: 10px 14px max(env(safe-area-inset-bottom), 14px);
          border-top: 1px solid rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        .rcp-chat-input {
          flex: 1;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 22px;
          padding: 9px 14px;
          font-size: 13px;
          color: #fff;
          outline: none;
          font-family: inherit;
        }
        .rcp-chat-input::placeholder { color: rgba(255,255,255,0.25); }
        .rcp-chat-input:focus { border-color: rgba(167,139,250,0.4); }
        .rcp-chat-send {
          width: 38px; height: 38px; flex-shrink: 0;
          border-radius: 50%;
          background: #6d28d9;
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          align-self: flex-end;
          transition: background 0.15s, transform 0.1s;
        }
        .rcp-chat-send:disabled { background: #2a2a3a; }
        .rcp-chat-send:not(:disabled):active { transform: scale(0.9); }

        /* ── Report / Block sheets ── */
        .rcp-sheet-backdrop {
          position: absolute; inset: 0;
          z-index: 70;
          background: rgba(0,0,0,0.6);
          display: flex; align-items: flex-end;
          animation: rcp-fade-in 0.15s ease;
        }
        .rcp-sheet {
          background: #141420;
          border-radius: 20px 20px 0 0;
          border-top: 1px solid rgba(255,255,255,0.08);
          padding: 0 20px max(env(safe-area-inset-bottom), 28px);
          width: 100%;
          animation: rcp-slide-up 0.22s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .rcp-sheet-handle {
          width: 36px; height: 4px;
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
          margin: 10px auto 18px;
        }
        .rcp-sheet-eyebrow { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.35); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px; }
        .rcp-sheet-name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 16px; }
        .rcp-sheet-copy { font-size: 13px; color: rgba(255,255,255,0.45); margin-bottom: 16px; line-height: 1.5; }
        .rcp-chips {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 14px;
        }
        .rcp-chip {
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
          cursor: pointer;
          transition: all 0.15s;
        }
        .rcp-chip.active { background: rgba(167,139,250,0.2); border-color: rgba(167,139,250,0.5); color: #c4b5fd; }
        .rcp-sheet-textarea {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 11px 13px;
          font-size: 13px;
          color: #fff;
          min-height: 72px;
          resize: none;
          outline: none;
          font-family: inherit;
          margin-bottom: 14px;
          line-height: 1.5;
        }
        .rcp-sheet-textarea::placeholder { color: rgba(255,255,255,0.2); }
        .rcp-sheet-textarea:focus { border-color: rgba(167,139,250,0.35); }
        .rcp-sheet-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: opacity 0.15s;
        }
        .rcp-sheet-btn:disabled { opacity: 0.5; }
        .rcp-sheet-btn.primary { background: #6d28d9; color: #fff; }
        .rcp-sheet-btn.danger  { background: #dc2626; color: #fff; }
        .rcp-sheet-close-row {
          display: flex; justify-content: flex-end;
          margin-bottom: 2px;
        }
        .rcp-sheet-x {
          background: rgba(255,255,255,0.07);
          border: none; border-radius: 50%;
          width: 30px; height: 30px;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.5);
          cursor: pointer;
        }

        /* connecting shimmer */
        .rcp-connecting-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(165deg, #141428 0%, #0f1f35 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        }
        .rcp-connecting-text { font-size: 14px; color: rgba(255,255,255,0.5); }
        .rcp-connecting-sub  { font-size: 12px; color: rgba(255,255,255,0.25); }
      `}</style>

      <div className="rcp-root">

        {/* ── Header ── */}
        <header className="rcp-header">
          <div className="rcp-logo" onClick={() => navigate("/app")}>
            <span className="rcp-logo-dot" />
            LPU TV
          </div>
          <div className="rcp-header-right">
            <div className="rcp-status-badge">
              <span className={`rcp-status-dot ${isInCall ? "live" : isMatching || zegoConnecting ? "searching" : ""}`} />
              {isInCall ? "Connected" : isMatching || zegoConnecting ? "Searching" : "Ready"}
            </div>
          </div>
        </header>

        {/* ── Toast ── */}
        {(actionMessage && match) ? (
          <div className="rcp-toast">{actionMessage}</div>
        ) : null}
        {connectionIssue && !match ? (
          <div className="rcp-toast">{connectionIssue}</div>
        ) : null}

        {/* ── Two-block video stack ── */}
        <div className="rcp-video-stack">

          {/* Remote (top, larger) */}
          <div className="rcp-block rcp-block-remote">
            {zegoRenderMatch ? (
              <div style={{ position: "absolute", inset: 0, opacity: zegoConnecting ? 0 : 1, transition: "opacity 0.35s ease", zIndex: 5 }}>
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
            ) : null}

            {/* Placeholder when no remote */}
            {(!zegoRenderMatch || zegoConnecting) && (
              <div className="rcp-block-bg">
                {isMatching || (zegoConnecting && !match) ? (
                  <>
                    <div className="rcp-pulse-wrap">
                      <div className="rcp-pulse-ring" />
                      <div className="rcp-pulse-ring" />
                      <div className="rcp-pulse-icon">
                        <svg width="18" height="18" fill="none" stroke="#a78bfa" strokeWidth="1.8" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                    </div>
                    <p className="rcp-idle-text">Looking for someone…</p>
                  </>
                ) : match && (zegoConnecting || roomRevealPending) ? (
                  <>
                    <div className="rcp-pulse-wrap">
                      <div className="rcp-pulse-ring" />
                      <div className="rcp-pulse-ring" />
                      <div className="rcp-pulse-icon">
                        <svg width="18" height="18" fill="none" stroke="#4ade80" strokeWidth="1.8" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                    </div>
                    <p className="rcp-idle-text">{upcomingPartnerName} is connecting…</p>
                  </>
                ) : (
                  <>
                    <svg width="32" height="32" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    </svg>
                    <p className="rcp-idle-text">
                      {connectionIssue ? "Connection failed" : "Tap Start to meet someone"}
                    </p>
                    {!connectionIssue && <p className="rcp-idle-sub">Video chat with LPU students</p>}
                  </>
                )}
              </div>
            )}

            {/* Overlay: live badge + partner name + timer */}
            {match && !zegoConnecting && (
              <div className="rcp-remote-overlay">
                <div className="rcp-live-pill"><span className="rcp-live-dot" />Live</div>
                <span className="rcp-partner-name">{match.partner.fullName.split(" ")[0]}</span>
                <span className="rcp-timer">{liveTimer}</span>
              </div>
            )}

            {/* Friend / Report / Block icon buttons */}
            {match && !zegoConnecting && (
              <div className="rcp-block-actions">
                <button
                  className="rcp-icon-btn friend"
                  title={getFriendLabel()}
                  onClick={() => void handleFriendAction()}
                  disabled={Boolean(actionBusy) || relationship?.isBlocked || relationship?.isBlockedByOther || relationship?.isFriend || relationship?.outgoingRequestPending}
                >
                  <UserPlus size={16} />
                </button>
                <button className="rcp-icon-btn report" title="Report" onClick={() => setShowReportSheet(true)} disabled={Boolean(actionBusy)}>
                  <Flag size={16} />
                </button>
                <button className="rcp-icon-btn block" title="Block" onClick={() => setShowBlockSheet(true)} disabled={Boolean(actionBusy)}>
                  <ShieldBan size={16} />
                </button>
              </div>
            )}

            {/* Floating reactions layer */}
            <div className="rcp-reactions-layer">
              {floatingReactions.map((r) => (
                <span key={r.id} className={`rcp-float-emoji ${r.own ? "own" : ""}`}>{r.emoji}</span>
              ))}
            </div>
          </div>

          {/* Local (bottom, smaller) */}
          <div className="rcp-block rcp-block-local">
            <video ref={localVideoRef} autoPlay muted playsInline style={{ opacity: match ? 0.6 : 1 }} />
            {(!match && !isMatching && !hasStarted) && (
              <div className="rcp-block-bg" style={{ position: "absolute", inset: 0, background: "transparent" }}>
                <svg width="24" height="24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                </svg>
                <p className="rcp-idle-sub" style={{ fontSize: 11 }}>Your camera</p>
              </div>
            )}
            <span className="rcp-local-label">You</span>
          </div>
        </div>

        {/* ── Bottom controls ── */}
        <div className="rcp-controls">
          {showReactionTray && match && (
            <div className="rcp-reaction-tray">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} className="rcp-emoji-btn" onClick={() => triggerReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          <div className="rcp-btn-row">
            {!hasStarted ? (
              <button className="rcp-btn rcp-btn-start" onClick={startMatching} disabled={isMatching}>
                <div className="rcp-btn-circle"><Play size={22} fill="#fff" color="#fff" /></div>
                <span className="rcp-btn-label">Start</span>
              </button>
            ) : (
              <>
                <button className="rcp-btn rcp-btn-stop" onClick={stopMatching}>
                  <div className="rcp-btn-circle"><PhoneOff size={20} color="#fff" /></div>
                  <span className="rcp-btn-label">Stop</span>
                </button>

                <button
                  className={`rcp-btn rcp-btn-react`}
                  onClick={() => setShowReactionTray((p) => !p)}
                  disabled={!match}
                >
                  <div className="rcp-btn-circle"><SmilePlus size={20} color="rgba(255,255,255,0.8)" /></div>
                  <span className="rcp-btn-label">React</span>
                </button>

                <button
                  className={`rcp-btn rcp-btn-chat ${showLiveChat ? "active" : ""}`}
                  onClick={() => setShowLiveChat((p) => !p)}
                  disabled={!match}
                >
                  <div className="rcp-btn-circle"><MessageCircle size={20} color={showLiveChat ? "#a78bfa" : "rgba(255,255,255,0.8)"} /></div>
                  <span className="rcp-btn-label">Chat</span>
                </button>

                <button
                  className="rcp-btn rcp-btn-next"
                  onClick={nextMatch}
                  disabled={!match && !isMatching}
                >
                  <div className="rcp-btn-circle"><SkipForward size={20} color="rgba(255,255,255,0.8)" /></div>
                  <span className="rcp-btn-label">Next</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Live chat drawer ── */}
        <div className={`rcp-chat-drawer ${showLiveChat ? "open" : ""}`}>
          <div className="rcp-chat-handle" />
          <div className="rcp-chat-head">
            <span className="rcp-chat-title">Live Chat</span>
            <button className="rcp-chat-close" onClick={() => setShowLiveChat(false)}>
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="rcp-chat-body" ref={liveChatBodyRef}>
            {liveMessages.length === 0 ? (
              <p className="rcp-chat-empty">Send a quick message without covering the video</p>
            ) : null}
            {liveMessages.map((entry) => (
              <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                <p className="rcp-bubble-sender">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
          <form className="rcp-chat-form" onSubmit={sendLiveChatMessage}>
            <input
              className="rcp-chat-input"
              value={liveChatInput}
              onChange={(e) => setLiveChatInput(e.target.value)}
              placeholder="Type a message…"
            />
            <button className="rcp-chat-send" type="submit" disabled={!liveChatInput.trim()}>
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* ── Report sheet ── */}
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
                {["Spam", "Harassment", "Inappropriate behavior", "Fake profile"].map((reason) => (
                  <span
                    key={reason}
                    className={`rcp-chip ${reportReason === reason ? "active" : ""}`}
                    onClick={() => setReportReason(reason)}
                  >{reason}</span>
                ))}
              </div>
              <textarea
                className="rcp-sheet-textarea"
                placeholder="Add context if you want…"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
              />
              <button className="rcp-sheet-btn primary" onClick={() => void submitReport()} disabled={actionBusy === "report"}>
                Submit Report
              </button>
            </div>
          </div>
        )}

        {/* ── Block sheet ── */}
        {showBlockSheet && match && (
          <div className="rcp-sheet-backdrop" onClick={() => setShowBlockSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-close-row">
                <button className="rcp-sheet-x" onClick={() => setShowBlockSheet(false)}><X size={14} /></button>
              </div>
              <p className="rcp-sheet-eyebrow">Block User</p>
              <p className="rcp-sheet-name">Block {match.partner.fullName.split(" ")[0]}?</p>
              <p className="rcp-sheet-copy">They'll be removed from this chat and skipped in all future random matches.</p>
              <textarea
                className="rcp-sheet-textarea"
                placeholder="Optional note for yourself"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
              <button className="rcp-sheet-btn danger" onClick={() => void confirmBlock()} disabled={actionBusy === "block"}>
                Block and Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}