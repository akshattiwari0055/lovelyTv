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

type RandomChatPageProps = { token: string; user: User };
type LiveChatMessage = { id: string; message: string; senderId: string; senderName: string; createdAt: string };
type FloatingReaction = { id: string; emoji: string; own?: boolean };

const QUICK_REACTIONS = ["🔥", "👏", "😂", "❤️", "💯", "👀"];

function emit(event: string, payload?: unknown) {
  const socket = getSocket();
  if (socket?.connected) payload !== undefined ? socket.emit(event, payload) : socket.emit(event);
}

export function RandomChatPage({ token, user }: RandomChatPageProps) {
  const navigate = useNavigate();
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [zegoRenderMatch, setZegoRenderMatch] = useState<MatchResult | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [zegoConnecting, setZegoConnecting] = useState(false);
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
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const vcolRef = useRef<HTMLDivElement>(null);

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

  // FIX: Scroll both sidebar and drawer to bottom on new messages
  useEffect(() => {
    if (liveMessages.length === 0) return;
    liveChatBodyRef.current?.scrollTo({ top: liveChatBodyRef.current.scrollHeight, behavior: "smooth" });
    drawerBodyRef.current?.scrollTo({ top: drawerBodyRef.current.scrollHeight, behavior: "smooth" });
  }, [liveMessages]);

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

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "zego-kill-ui";
    style.textContent = `
      .rcp-zego-fill > div, .rcp-zego-fill > div > div {
        width: 100% !important; height: 100% !important;
        max-width: 100% !important; max-height: 100% !important; background: #08080f !important;
      }
      .rcp-zego-fill video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
      .rcp-zego-fill [class*="footer"],
      .rcp-zego-fill [class*="Footer"],
      .rcp-zego-fill [class*="bottom"],
      .rcp-zego-fill [class*="Bottom"],
      .rcp-zego-fill [class*="leave"],
      .rcp-zego-fill [class*="Leave"],
      .rcp-zego-fill [class*="hang"],
      .rcp-zego-fill [class*="Hang"],
      .rcp-zego-fill [class*="toolbar"],
      .rcp-zego-fill [class*="Toolbar"],
      .rcp-zego-fill [class*="control"],
      .rcp-zego-fill [class*="Control"] {
        display: none !important; visibility: hidden !important;
        pointer-events: none !important; height: 0 !important;
        width: 0 !important; overflow: hidden !important; opacity: 0 !important;
        position: absolute !important; z-index: -9999 !important;
      }
      .rcp-zego-fill button,
      .rcp-zego-fill [role="button"] {
        display: none !important; visibility: hidden !important;
        pointer-events: none !important; opacity: 0 !important;
        width: 0 !important; height: 0 !important;
        position: absolute !important; z-index: -9999 !important;
      }
      .rcp-vcol-inner > div:not(.rcp-zego-fill):not(.rcp-connecting):not(.rcp-idle):not(.rcp-call-badges):not(.rcp-call-actions):not(.rcp-floats):not(.rcp-swipe-hint) {
        display: none !important; visibility: hidden !important; pointer-events: none !important;
        height: 0 !important; overflow: hidden !important; opacity: 0 !important;
      }
      @media (max-width: 768px) {
        .rcp-zego-fill,
        .rcp-zego-fill > div,
        .rcp-zego-fill > div > div {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }
        .rcp-zego-fill > div > div > div {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 50% !important;
          min-height: 0 !important;
          flex: 1 1 50% !important;
          max-width: 100% !important;
          overflow: hidden !important;
        }
        .rcp-zego-fill > div > div > div > div,
        .rcp-zego-fill > div > div > div > div > div {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          flex: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
        }
        .rcp-zego-fill video {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          flex: 1 !important;
          object-fit: cover !important;
          display: block !important;
        }
      }
    `;
    if (!document.getElementById("zego-kill-ui")) document.head.appendChild(style);
    const OUR_CLASSES = ["rcp-zego-fill","rcp-connecting","rcp-idle","rcp-call-badges","rcp-call-actions","rcp-floats","rcp-swipe-hint","rcp-controls","rcp-topbar","rcp-sheet","rcp-drawer","rcp-toast","rcp-backdrop"];
    const isOurEl = (el: Element): boolean => OUR_CLASSES.some((cls) => el.classList.contains(cls) || el.closest("." + cls) !== null);
    const killZegoBar = () => {
      const vcol = vcolRef.current;
      if (!vcol) return;
      Array.from(vcol.children).forEach((child) => {
        if (!isOurEl(child)) {
          (child as HTMLElement).style.setProperty("display", "none", "important");
          (child as HTMLElement).style.setProperty("height", "0", "important");
          (child as HTMLElement).style.setProperty("overflow", "hidden", "important");
          (child as HTMLElement).style.setProperty("pointer-events", "none", "important");
        }
      });
      vcol.querySelectorAll<HTMLElement>("button, [role='button'], [class*='hangup'], [class*='leave'], [class*='footer'], [class*='toolbar'], [class*='bottom-bar']").forEach((btn) => {
        if (!isOurEl(btn)) {
          btn.style.setProperty("display", "none", "important");
          btn.style.setProperty("pointer-events", "none", "important");
          btn.style.setProperty("width", "0", "important");
          btn.style.setProperty("height", "0", "important");
          btn.style.setProperty("opacity", "0", "important");
          btn.style.setProperty("position", "absolute", "important");
          btn.style.setProperty("z-index", "-9999", "important");
        }
      });
      vcol.querySelectorAll<HTMLElement>(".rcp-zego-fill > div > div > div").forEach((el) => {
        if (el.style.position === "absolute" || window.getComputedStyle(el).position === "absolute") {
          const rect = el.getBoundingClientRect();
          const vcolRect = vcol.getBoundingClientRect();
          if (rect.top > vcolRect.top + vcolRect.height * 0.75) {
            el.style.setProperty("display", "none", "important");
          }
        }
      });
      document.body.querySelectorAll<HTMLElement>(":scope > div").forEach((el) => {
        const txt = el.textContent || "";
        if (txt.includes("Media play failed") || txt.includes("Resume")) el.remove();
      });
      if (window.innerWidth <= 768) {
        const zegoFill = vcol.querySelector<HTMLElement>(".rcp-zego-fill");
        if (zegoFill) {
          // Force the fill itself to be a flex column
          zegoFill.style.setProperty("display", "flex", "important");
          zegoFill.style.setProperty("flex-direction", "column", "important");
          zegoFill.style.setProperty("width", "100%", "important");
          zegoFill.style.setProperty("height", "100%", "important");
          zegoFill.style.setProperty("overflow", "hidden", "important");

          // Walk every descendant div — force flex-column + full size on all wrappers
          zegoFill.querySelectorAll<HTMLElement>("div").forEach((div) => {
            if (isOurEl(div)) return;
            div.style.setProperty("min-height", "0", "important");
            div.style.setProperty("overflow", "hidden", "important");

            const children = Array.from(div.children).filter(c => c.tagName === "DIV");
            if (children.length >= 2) {
              // This is the grid row — stack it vertically
              div.style.setProperty("display", "flex", "important");
              div.style.setProperty("flex-direction", "column", "important");
              div.style.setProperty("width", "100%", "important");
              div.style.setProperty("height", "100%", "important");
              children.forEach((child) => {
                const el = child as HTMLElement;
                const pct = `${100 / children.length}%`;
                el.style.setProperty("width", "100%", "important");
                el.style.setProperty("height", pct, "important");
                el.style.setProperty("flex", `1 1 ${pct}`, "important");
                el.style.setProperty("max-width", "100%", "important");
                el.style.setProperty("min-height", "0", "important");
                el.style.setProperty("overflow", "hidden", "important");
              });
            } else {
              div.style.setProperty("width", "100%", "important");
              div.style.setProperty("height", "100%", "important");
              div.style.setProperty("display", "flex", "important");
              div.style.setProperty("flex-direction", "column", "important");
            }
          });

          // Force all videos to fill their container — this kills the black bars
          zegoFill.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
            video.style.setProperty("width", "100%", "important");
            video.style.setProperty("height", "100%", "important");
            video.style.setProperty("min-height", "0", "important");
            video.style.setProperty("flex", "1", "important");
            video.style.setProperty("object-fit", "cover", "important");
            video.style.setProperty("display", "block", "important");
          });
        }
      }
    };
    killZegoBar();
    const observer = new MutationObserver(killZegoBar);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); document.getElementById("zego-kill-ui")?.remove(); };
  }, []);

  useEffect(() => {
    if (!zegoConnecting) return;
    zegoTimeoutRef.current = window.setTimeout(() => {
      setMatch(null); setZegoRenderMatch(null); setZegoConnecting(false);
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
    socket.on("match:found", (payload: MatchResult) => {
      if (zegoTimeoutRef.current !== null) { window.clearTimeout(zegoTimeoutRef.current); zegoTimeoutRef.current = null; }
      setZegoConnecting(true); setMatch(payload);
      setShowLiveChat(false); setLiveMessages([]); setFloatingReactions([]);
      setCallStartedAt(null); setConnectionIssue(""); setIsMatching(false); setHasStarted(true);
    });
    socket.on("match:partner-left", () => {
      socket.emit("match:leave-room");
      setMatch(null); setZegoConnecting(false);
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
    // Server broadcasts match:chat to ALL users in the room (including sender).
    // So both sender and receiver get this event — no need for optimistic inserts.
    socket.on("match:chat", (payload: LiveChatMessage) => {
      setLiveMessages((c) => [...c.slice(-19), payload]);
    });
    return () => {
      socket.off("connect"); socket.off("match:found"); socket.off("match:partner-left");
      socket.off("match:reaction"); socket.off("match:chat");
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
    if (Math.abs(swipeDelta) > 80 && hasStarted) {
      if (swipeDir === "left" && isInCall) nextMatch();
      else if (swipeDir === "right") stopMatching();
    }
    setSwipeDelta(0); setSwipeDir(null);
    swipeStartX.current = null; swipeStartY.current = null;
  }

  async function handleFriendAction() {
    if (!match?.partner || !relationship || actionBusy) return;
    try {
      if (relationship.isFriend) { setActionMessage("Already friends!"); return; }
      if (relationship.incomingRequestPending && relationship.incomingRequestId) {
        setActionBusy("accept");
        await api.post(`/friend-requests/${relationship.incomingRequestId}/accept`);
        setRelationship((c) => c ? { ...c, isFriend: true, incomingRequestPending: false, incomingRequestId: null } : c);
        setActionMessage("Friend request accepted!"); return;
      }
      if (relationship.outgoingRequestPending) { setActionMessage("Request already sent."); return; }
      setActionBusy("friend");
      await api.post("/friend-requests", { receiverId: match.partner.id });
      setRelationship((c) => c ? { ...c, outgoingRequestPending: true } : c);
      setActionMessage("Friend request sent!");
    } catch (error: any) { setActionMessage(error?.response?.data?.message ?? "Could not update friendship."); }
    finally { setActionBusy(null); }
  }

  async function submitReport() {
    if (!match?.partner || actionBusy) return;
    try {
      setActionBusy("report");
      await api.post(`/users/${match.partner.id}/report`, { reason: reportReason, details: reportDetails });
      setActionMessage("Report submitted."); setShowReportSheet(false); setReportDetails("");
    } catch (error: any) { setActionMessage(error?.response?.data?.message ?? "Could not submit report."); }
    finally { setActionBusy(null); }
  }

  async function confirmBlock() {
    if (!match?.partner || actionBusy) return;
    try {
      setActionBusy("block");
      await api.post(`/users/${match.partner.id}/block`, { reason: blockReason });
      setActionMessage(`${match.partner.fullName.split(" ")[0]} blocked.`);
      setShowBlockSheet(false); nextMatch();
    } catch (error: any) { setActionMessage(error?.response?.data?.message ?? "Could not block user."); }
    finally { setActionBusy(null); }
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
    setMatch(null); setZegoConnecting(false); setShowLiveChat(false); setLiveMessages([]);
    setFloatingReactions([]); setCallStartedAt(null); setConnectionIssue("");
    setIsMatching(true); setHasStarted(true); emit("match:join-queue");
  }

  function stopMatching() {
    setHasStarted(false); hasStartedRef.current = false;
    emit("match:leave-room"); emit("match:leave-queue");
    setMatch(null); setZegoConnecting(false); setShowLiveChat(false);
    setLiveMessages([]); setFloatingReactions([]); setCallStartedAt(null);
    setConnectionIssue(""); setIsMatching(false);
  }

  function nextMatch() {
    emit("match:leave-room");
    setMatch(null); setZegoConnecting(false); setShowLiveChat(false);
    setLiveMessages([]); setFloatingReactions([]); setCallStartedAt(null);
    setConnectionIssue(""); setIsMatching(true); setHasStarted(true);
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
    if (!msg || !match) return;
    emit("match:chat", { message: msg });
    setLiveChatInput("");
  }

  const isInCall = Boolean(match) && !zegoConnecting;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;1,400&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:    #080b12;
          --bg2:   #0d1020;
          --bg3:   #111520;
          --bg4:   #0a0d18;
          --cyan:  #22d3ee;
          --pink:  #f472b6;
          --violet:#a78bfa;
          --lime:  #d4f244;
          --text:  #f1f5f9;
          --muted: rgba(241,245,249,0.44);
          --dim:   rgba(241,245,249,0.18);
          --line:  rgba(241,245,249,0.07);
          --font-display: 'Bebas Neue', sans-serif;
          --font-head: 'Cabinet Grotesk', sans-serif;
          --font-body: 'Instrument Sans', sans-serif;
        }

        .rcp-root {
          display: flex; flex-direction: column;
          height: 100dvh; width: 100%;
          background: var(--bg);
          font-family: var(--font-body);
          overflow: hidden; position: relative;
          color: var(--text);
        }

        /* ── TOP BAR ─────────────────────────────── */
        .rcp-topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: max(env(safe-area-inset-top), 10px) 20px 10px;
          background: rgba(8,11,18,0.9); backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--line);
          flex-shrink: 0; z-index: 50; height: 56px;
        }
        .rcp-logo {
          display: flex; align-items: center; gap: 10px;
          cursor: pointer; user-select: none; text-decoration: none;
        }
        .rcp-logo-icon {
          width: 30px; height: 30px; border-radius: 8px;
          background: linear-gradient(135deg, var(--violet), var(--pink));
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-head); font-weight: 900; font-size: 11px; color: #fff;
        }
        .rcp-logo-text {
          font-family: var(--font-head); font-weight: 900; font-size: 16px; color: var(--text);
        }
        .rcp-logo-badge {
          font-family: var(--font-head); font-size: 9px; font-weight: 700;
          letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--cyan); background: rgba(34,211,238,0.1);
          border: 1px solid rgba(34,211,238,0.2);
          border-radius: 4px; padding: 2px 6px;
        }
        .rcp-topbar-right { display: flex; align-items: center; gap: 10px; }
        .rcp-status-pill {
          display: flex; align-items: center; gap: 6px;
          padding: 5px 13px; border-radius: 100px;
          background: rgba(255,255,255,0.04); border: 1px solid var(--line);
          font-family: var(--font-head); font-size: 11px; font-weight: 700;
          color: var(--dim); letter-spacing: 0.05em;
        }
        .rcp-dot { width: 6px; height: 6px; border-radius: 50%; background: #333; flex-shrink: 0; }
        .rcp-dot.live { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.6); }
        .rcp-dot.searching { background: var(--cyan); animation: rcp-blink 1.1s ease-in-out infinite; }
        @keyframes rcp-blink { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.3;transform:scale(0.7)} }
        .rcp-back-btn {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(255,255,255,0.05); border: 1px solid var(--line);
          display: flex; align-items: center; justify-content: center;
          color: var(--dim); cursor: pointer; transition: all 0.15s;
        }
        .rcp-back-btn:hover { background: rgba(255,255,255,0.1); color: var(--text); }
        .rcp-flag-btn {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(244,114,182,0.08); border: 1px solid rgba(244,114,182,0.2);
          display: flex; align-items: center; justify-content: center;
          color: var(--pink); cursor: pointer; transition: background 0.15s;
        }
        .rcp-flag-btn:hover { background: rgba(244,114,182,0.16); }

        /* ── BODY ────────────────────────────────── */
        .rcp-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }

        @media (min-width: 769px) {
          .rcp-body { flex-direction: row; }
          .rcp-vcol { flex: 0 0 62%; position: relative; background: var(--bg4); border-right: 1px solid var(--line); display: flex; flex-direction: column; }
          .rcp-sidebar { flex: 1; display: flex; flex-direction: column; background: var(--bg2); }
        }
        @media (max-width: 768px) {
          .rcp-body { flex-direction: column; }
          .rcp-vcol { flex: 1; position: relative; background: var(--bg4); min-height: 0; }
          .rcp-sidebar { display: none; }
        }

        /* ── ZEGO FILL ───────────────────────────── */
        .rcp-zego-fill {
          position: absolute; inset: 0; width: 100%; height: 100%;
        }
        .rcp-zego-fill [class*="footer"], .rcp-zego-fill [class*="Footer"],
        .rcp-zego-fill [class*="leave"],  .rcp-zego-fill [class*="Leave"],
        .rcp-zego-fill [class*="toolbar"],.rcp-zego-fill [class*="Toolbar"] {
          display: none !important; visibility: hidden !important;
          pointer-events: none !important; height: 0 !important; opacity: 0 !important;
        }
        .rcp-zego-fill > div, .rcp-zego-fill > div > div {
          width: 100% !important; height: 100% !important;
          max-width: 100% !important; max-height: 100% !important;
          background: var(--bg4) !important;
        }
        .rcp-zego-fill video { width: 100% !important; height: 100% !important; object-fit: cover !important; }

        /* ── IDLE ────────────────────────────────── */
        .rcp-idle {
          position: absolute; inset: 0; z-index: 2;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          background: var(--bg4);
        }
        .rcp-idle-video-wrap { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
        .rcp-idle-video-wrap video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .rcp-idle-video-wrap::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(8,11,18,0.2) 0%, rgba(8,11,18,0.05) 50%, rgba(8,11,18,0.5) 100%);
          pointer-events: none;
        }
        .rcp-idle-overlay {
          position: absolute; inset: 0; z-index: 3;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
          pointer-events: none;
        }
        .rcp-idle-orb {
          width: 64px; height: 64px; border-radius: 20px;
          background: rgba(8,11,18,0.6); backdrop-filter: blur(16px);
          border: 1px solid rgba(241,245,249,0.12);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-idle-title {
          font-family: var(--font-head); font-size: 16px; font-weight: 800;
          color: rgba(241,245,249,0.9); letter-spacing: -0.02em;
          text-shadow: 0 2px 12px rgba(0,0,0,0.7);
        }
        .rcp-idle-sub {
          font-size: 12px; color: rgba(241,245,249,0.45);
          text-shadow: 0 1px 8px rgba(0,0,0,0.6);
        }
        .rcp-you-tag {
          position: absolute; bottom: 16px; left: 16px; z-index: 4;
          background: rgba(8,11,18,0.6); backdrop-filter: blur(10px);
          border: 1px solid var(--line); border-radius: 8px; padding: 4px 12px;
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em;
        }

        /* ── SEARCHING ───────────────────────────── */
        .rcp-searching-wrap {
          display: flex; flex-direction: column; align-items: center; gap: 16px; position: relative; z-index: 3;
        }
        .rcp-spin-ring {
          width: 52px; height: 52px; position: relative;
        }
        .rcp-spin-ring::before, .rcp-spin-ring::after {
          content: ''; position: absolute; border-radius: 50%;
          border: 2px solid transparent; animation: rcp-spin 1s linear infinite;
          top: 0; left: 0; width: 100%; height: 100%;
        }
        .rcp-spin-ring::before { border-top-color: var(--cyan); }
        .rcp-spin-ring::after { width: 30px; height: 30px; top: 11px; left: 11px; border-top-color: rgba(167,139,250,0.5); animation-duration: 0.65s; }
        @keyframes rcp-spin { to { transform: rotate(360deg); } }

        /* ── CONNECTING ──────────────────────────── */
        .rcp-connecting {
          position: absolute; inset: 0; z-index: 10;
          background: var(--bg4);
          display: flex; align-items: center; justify-content: center;
          flex-direction: column; gap: 14px;
        }
        .rcp-connecting-name {
          font-family: var(--font-head); font-size: 15px; font-weight: 700;
          color: var(--muted); letter-spacing: -0.01em;
        }

        /* ── CALL BADGES ─────────────────────────── */
        .rcp-call-badges {
          position: absolute; top: 14px; left: 14px;
          display: flex; align-items: center; gap: 8px;
          z-index: 5; pointer-events: none;
        }
        .rcp-live-pill {
          display: flex; align-items: center; gap: 5px;
          background: rgba(220,38,38,0.88); border-radius: 7px; padding: 4px 9px;
          font-family: var(--font-head); font-size: 10px; font-weight: 800;
          color: #fff; letter-spacing: 0.12em; text-transform: uppercase;
        }
        .rcp-live-blink { width: 5px; height: 5px; border-radius: 50%; background: #fff; animation: rcp-blink 0.9s infinite; }
        .rcp-name-chip {
          background: rgba(8,11,18,0.6); backdrop-filter: blur(12px);
          border: 1px solid var(--line); border-radius: 8px; padding: 4px 11px;
          font-family: var(--font-head); font-size: 12px; font-weight: 700; color: var(--text);
        }
        .rcp-timer-chip {
          background: rgba(8,11,18,0.45); backdrop-filter: blur(8px);
          border-radius: 7px; padding: 4px 9px;
          font-family: var(--font-head); font-size: 11px; font-weight: 600; color: var(--muted);
          font-variant-numeric: tabular-nums;
        }

        /* ── CALL ACTIONS ────────────────────────── */
        .rcp-call-actions {
          position: absolute; top: 14px; right: 14px;
          display: flex; flex-direction: column; gap: 8px; z-index: 5;
        }
        .rcp-act-btn {
          width: 40px; height: 40px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; border: none; transition: transform 0.12s, opacity 0.15s;
        }
        .rcp-act-btn:active { transform: scale(0.86); }
        .rcp-act-btn:disabled { opacity: 0.25; cursor: default; }
        .rcp-act-btn.friend { background: rgba(167,139,250,0.12); border: 1px solid rgba(167,139,250,0.28); color: var(--violet); }
        .rcp-act-btn.block  { background: rgba(244,114,182,0.1);  border: 1px solid rgba(244,114,182,0.22); color: var(--pink); }
        .rcp-act-btn.friend:not(:disabled):hover { background: rgba(167,139,250,0.22); }
        .rcp-act-btn.block:not(:disabled):hover  { background: rgba(244,114,182,0.2); }

        /* ── FLOATING REACTIONS ──────────────────── */
        .rcp-floats {
          position: absolute; bottom: 20px; left: 16px;
          pointer-events: none; z-index: 6;
          display: flex; flex-direction: column-reverse; gap: 4px;
        }
        .rcp-emoji { font-size: 30px; animation: rcp-float 2.2s ease-out forwards; }
        .rcp-emoji.own { filter: drop-shadow(0 0 10px rgba(167,139,250,0.7)); }
        @keyframes rcp-float { 0%{opacity:1;transform:translateY(0) scale(1)} 70%{opacity:0.8} 100%{opacity:0;transform:translateY(-110px) scale(1.6)} }

        /* ── SWIPE HINTS ─────────────────────────── */
        .rcp-swipe-hint {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 8; opacity: 0; transition: opacity 0.12s;
        }
        .rcp-swipe-hint.on { opacity: 1; }
        .rcp-swipe-lbl {
          font-family: var(--font-head); font-size: 20px; font-weight: 900;
          padding: 12px 28px; border-radius: 16px; backdrop-filter: blur(16px);
          letter-spacing: -0.02em;
        }
        .rcp-swipe-lbl.next { background: rgba(34,211,238,0.15); border: 2px solid rgba(34,211,238,0.45); color: var(--cyan); }
        .rcp-swipe-lbl.stop { background: rgba(244,114,182,0.15); border: 2px solid rgba(244,114,182,0.45); color: var(--pink); }

        /* ── DESKTOP SIDEBAR ─────────────────────── */
        .rcp-sidebar-head {
          padding: 18px 20px 14px; border-bottom: 1px solid var(--line); flex-shrink: 0;
        }
        .rcp-sidebar-eyebrow {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--cyan);
          display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
        }
        .rcp-sidebar-eyebrow::before { content: ''; width: 14px; height: 1px; background: var(--cyan); opacity: 0.5; }
        .rcp-sidebar-title {
          font-family: var(--font-head); font-size: 18px; font-weight: 900;
          color: var(--text); letter-spacing: -0.03em;
        }
        .rcp-sidebar-msgs {
          flex: 1; overflow-y: auto; padding: 16px;
          display: flex; flex-direction: column; gap: 10px;
          overscroll-behavior: contain;
          scrollbar-width: thin; scrollbar-color: rgba(241,245,249,0.08) transparent;
        }
        .rcp-sidebar-empty {
          text-align: center; font-size: 13px; color: var(--dim);
          padding: 40px 20px; line-height: 1.8;
        }
        .rcp-sidebar-empty svg { display: block; margin: 0 auto 12px; opacity: 0.3; }
        .rcp-sidebar-form {
          display: flex; gap: 8px;
          padding: 14px 16px max(env(safe-area-inset-bottom),16px);
          border-top: 1px solid var(--line); flex-shrink: 0;
        }
        .rcp-sidebar-input {
          flex: 1; background: var(--bg3); border: 1px solid var(--line);
          border-radius: 12px; padding: 11px 14px;
          font-family: var(--font-body); font-size: 13px; color: var(--text); outline: none;
          transition: border-color 0.15s;
        }
        .rcp-sidebar-input::placeholder { color: var(--dim); }
        .rcp-sidebar-input:focus { border-color: rgba(167,139,250,0.4); }
        .rcp-sidebar-send {
          width: 42px; height: 42px; flex-shrink: 0; align-self: flex-end;
          border-radius: 12px; background: linear-gradient(135deg, var(--cyan), var(--violet));
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #080b12; transition: transform 0.1s, opacity 0.15s;
        }
        .rcp-sidebar-send:disabled { background: var(--bg3); color: var(--dim); }
        .rcp-sidebar-send:not(:disabled):active { transform: scale(0.9); }

        /* ── CHAT BUBBLES ────────────────────────── */
        .rcp-bubble {
          max-width: 84%; padding: 9px 13px; border-radius: 14px;
          font-family: var(--font-body); font-size: 13.5px; line-height: 1.5;
        }
        .rcp-bubble.mine {
          align-self: flex-end; background: linear-gradient(135deg, var(--violet), var(--pink));
          color: #fff; border-bottom-right-radius: 4px;
        }
        .rcp-bubble.theirs {
          align-self: flex-start; background: var(--bg3);
          border: 1px solid var(--line); color: var(--text); border-bottom-left-radius: 4px;
        }
        .rcp-bubble-name {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          opacity: 0.6; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.06em;
        }

        /* ── BOTTOM CONTROLS ─────────────────────── */
        .rcp-controls {
          flex-shrink: 0; background: rgba(8,11,18,0.95); backdrop-filter: blur(16px);
          border-top: 1px solid var(--line);
          padding: 12px 20px max(env(safe-area-inset-bottom),14px);
          display: flex; align-items: center; gap: 12px; z-index: 50; position: relative;
        }
        .rcp-react-tray {
          position: absolute; bottom: 100%; left: 0; right: 0;
          display: flex; justify-content: center; gap: 8px; padding: 12px 16px;
          background: rgba(8,11,18,0.97); backdrop-filter: blur(16px);
          border-top: 1px solid var(--line);
          animation: rcp-up 0.18s ease;
        }
        @keyframes rcp-up { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .rcp-emoji-pick {
          padding: 8px 14px; border-radius: 100px;
          background: var(--bg3); border: 1px solid var(--line);
          font-size: 22px; cursor: pointer; transition: transform 0.1s, border-color 0.15s;
        }
        .rcp-emoji-pick:hover { border-color: rgba(167,139,250,0.3); }
        .rcp-emoji-pick:active { transform: scale(0.82); }

        .rcp-ctrl-grp { display: flex; align-items: center; gap: 10px; }

        .rcp-ctrl-btn {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          background: none; border: none; cursor: pointer; padding: 0; min-width: 56px;
        }
        .rcp-ctrl-btn:disabled { opacity: 0.25; cursor: default; }
        .rcp-ctrl-icon {
          width: 54px; height: 54px; border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s, filter 0.15s;
        }
        .rcp-ctrl-btn:not(:disabled):active .rcp-ctrl-icon { transform: scale(0.88); filter: brightness(0.8); }
        .rcp-ctrl-label {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          color: var(--dim); letter-spacing: 0.08em; text-transform: uppercase;
        }

        .ci-start  { background: linear-gradient(135deg, var(--cyan), #06b6d4); color: #080b12; }
        .ci-stop   { background: rgba(244,114,182,0.15); border: 1px solid rgba(244,114,182,0.28); color: var(--pink); }
        .ci-next   { background: var(--bg3); border: 1px solid var(--line); color: var(--muted); }
        .ci-react  { background: var(--bg3); border: 1px solid var(--line); color: var(--muted); }
        .ci-chat   { background: var(--bg3); border: 1px solid var(--line); color: var(--muted); }
        .ci-chat.on { background: rgba(167,139,250,0.1); border-color: rgba(167,139,250,0.3); color: var(--violet); }

        .rcp-swipe-guide { display: none; margin-left: auto; }
        .rcp-ctrl-btn-chat-mobile { display: none; }
        @media (max-width: 768px) {
          .rcp-ctrl-btn-chat-mobile { display: flex; }
          .rcp-swipe-guide {
            display: flex; flex-direction: column; gap: 3px; align-items: flex-end;
          }
          .rcp-swipe-tip {
            font-family: var(--font-head); font-size: 10px; font-weight: 600;
            color: var(--dim); letter-spacing: 0.04em;
          }
        }

        /* ── MOBILE DRAWER ───────────────────────── */
        .rcp-drawer {
          display: none;
        }
        @media (max-width: 768px) {
          .rcp-drawer {
            display: flex;
            position: absolute; bottom: 0; left: 0; right: 0; z-index: 80;
            background: rgba(13,16,32,0.98); backdrop-filter: blur(24px);
            border-top: 1px solid var(--line); border-radius: 20px 20px 0 0;
            transform: translateY(100%); transition: transform 0.28s cubic-bezier(0.32,0.72,0,1);
            max-height: 55%; flex-direction: column;
          }
          .rcp-drawer.open { transform: translateY(0); }
        }
        .rcp-drawer-handle { width: 36px; height: 4px; background: var(--line); border-radius: 2px; margin: 12px auto 0; flex-shrink: 0; }
        .rcp-drawer-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 18px; border-bottom: 1px solid var(--line); flex-shrink: 0;
        }
        .rcp-drawer-title { font-family: var(--font-head); font-size: 15px; font-weight: 900; color: var(--text); letter-spacing: -0.02em; }
        .rcp-drawer-close {
          width: 30px; height: 30px; border-radius: 50%;
          background: var(--bg3); border: 1px solid var(--line);
          cursor: pointer; color: var(--muted);
          display: flex; align-items: center; justify-content: center;
        }
        .rcp-drawer-body {
          flex: 1; overflow-y: auto; padding: 12px 16px;
          display: flex; flex-direction: column; gap: 10px;
          overscroll-behavior: contain;
        }
        .rcp-drawer-empty { text-align: center; font-size: 13px; color: var(--dim); padding: 20px 0; }
        .rcp-drawer-form {
          display: flex; gap: 8px;
          padding: 10px 16px max(env(safe-area-inset-bottom),14px);
          border-top: 1px solid var(--line); flex-shrink: 0;
        }
        .rcp-drawer-input {
          flex: 1; background: var(--bg3); border: 1px solid var(--line);
          border-radius: 12px; padding: 11px 14px;
          font-family: var(--font-body); font-size: 13px; color: var(--text); outline: none;
          transition: border-color 0.15s;
        }
        .rcp-drawer-input::placeholder { color: var(--dim); }
        .rcp-drawer-input:focus { border-color: rgba(167,139,250,0.4); }
        .rcp-drawer-send {
          width: 42px; height: 42px; border-radius: 12px;
          background: linear-gradient(135deg, var(--cyan), var(--violet));
          border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #080b12; flex-shrink: 0; align-self: flex-end;
          transition: transform 0.1s, opacity 0.15s;
        }
        .rcp-drawer-send:disabled { background: var(--bg3); color: var(--dim); }
        .rcp-drawer-send:active { transform: scale(0.9); }

        /* ── NUKE ZEGO HANGUP ────────────────────── */
        .rcp-vcol button:not(.rcp-act-btn):not(.rcp-back-btn):not(.rcp-flag-btn),
        .rcp-vcol [role="button"]:not(.rcp-act-btn) {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important; height: 0 !important; opacity: 0 !important;
        }
        .rcp-call-actions button,
        .rcp-call-actions [role="button"] {
          display: flex !important;
          visibility: visible !important;
          pointer-events: auto !important;
          width: 40px !important; height: 40px !important; opacity: 1 !important;
        }

        /* ── FORCE ZEGO VERTICAL STACK ON MOBILE ── */
        @media (max-width: 768px) {
          /* Force every wrapper div inside zego fill to be a full-height flex column */
          .rcp-zego-fill,
          .rcp-zego-fill > div,
          .rcp-zego-fill > div > div {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            overflow: hidden !important;
          }
          /* Each tile (partner + self) gets exactly half */
          .rcp-zego-fill > div > div > div {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            height: 50% !important;
            min-height: 0 !important;
            flex: 1 1 50% !important;
            overflow: hidden !important;
          }
          /* Inner wrappers inside each tile fill their tile */
          .rcp-zego-fill > div > div > div > div,
          .rcp-zego-fill > div > div > div > div > div {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          /* Videos fill their container completely — no black bars */
          .rcp-zego-fill video {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            flex: 1 !important;
            object-fit: cover !important;
            display: block !important;
          }
        }

        /* ── TOAST ───────────────────────────────── */
        .rcp-toast {
          position: absolute; top: 66px; left: 50%; transform: translateX(-50%);
          z-index: 100; background: rgba(13,16,32,0.95); backdrop-filter: blur(16px);
          border: 1px solid var(--line); border-radius: 100px;
          padding: 8px 20px; font-family: var(--font-head); font-size: 12px; font-weight: 700;
          color: var(--text); white-space: nowrap; pointer-events: none;
          animation: rcp-up 0.2s ease;
        }

        /* ── SHEETS ──────────────────────────────── */
        .rcp-backdrop {
          position: absolute; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.7); display: flex; align-items: flex-end;
          animation: rcp-fade 0.15s ease;
        }
        @keyframes rcp-fade { from{opacity:0} to{opacity:1} }
        .rcp-sheet {
          background: var(--bg2); border-radius: 24px 24px 0 0;
          border-top: 1px solid var(--line);
          padding: 0 22px max(env(safe-area-inset-bottom),32px);
          width: 100%; animation: rcp-up 0.22s cubic-bezier(0.32,0.72,0,1);
        }
        .rcp-sheet-handle { width: 36px; height: 4px; background: var(--line); border-radius: 2px; margin: 14px auto 20px; }
        .rcp-sheet-xrow { display: flex; justify-content: flex-end; margin-bottom: 6px; }
        .rcp-sheet-x {
          background: var(--bg3); border: 1px solid var(--line); border-radius: 50%;
          width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
          color: var(--muted); cursor: pointer; transition: color 0.15s;
        }
        .rcp-sheet-x:hover { color: var(--text); }
        .rcp-sheet-eyebrow {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--pink);
          display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
        }
        .rcp-sheet-eyebrow::before { content: ''; width: 14px; height: 1px; background: var(--pink); opacity: 0.5; }
        .rcp-sheet-name {
          font-family: var(--font-head); font-size: 22px; font-weight: 900;
          color: var(--text); letter-spacing: -0.03em; margin-bottom: 20px;
        }
        .rcp-sheet-txt { font-size: 13px; color: var(--muted); line-height: 1.65; margin-bottom: 18px; }
        .rcp-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .rcp-chip {
          padding: 8px 16px; border-radius: 100px; font-family: var(--font-head);
          font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.15s;
          background: var(--bg3); border: 1px solid var(--line); color: var(--dim);
        }
        .rcp-chip.on { background: rgba(244,114,182,0.1); border-color: rgba(244,114,182,0.35); color: var(--pink); }
        .rcp-sheet-ta {
          width: 100%; background: var(--bg3); border: 1px solid var(--line);
          border-radius: 14px; padding: 12px 15px; font-family: var(--font-body);
          font-size: 13px; color: var(--text); min-height: 80px; resize: none; outline: none;
          margin-bottom: 16px; line-height: 1.55; transition: border-color 0.15s;
        }
        .rcp-sheet-ta::placeholder { color: var(--dim); }
        .rcp-sheet-ta:focus { border-color: rgba(167,139,250,0.4); }
        .rcp-sheet-btn {
          width: 100%; padding: 15px; border-radius: 14px; border: none;
          font-family: var(--font-head); font-size: 15px; font-weight: 900;
          cursor: pointer; transition: opacity 0.15s, transform 0.1s; letter-spacing: -0.01em;
        }
        .rcp-sheet-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .rcp-sheet-btn:active { transform: scale(0.98); }
        .rcp-sheet-btn.report { background: linear-gradient(135deg, var(--violet), var(--cyan)); color: #080b12; }
        .rcp-sheet-btn.block  { background: linear-gradient(135deg, var(--pink), #ef4444); color: #fff; }
      `}</style>

      <div className="rcp-root">

        {/* TOP BAR */}
        <header className="rcp-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="rcp-back-btn" onClick={() => navigate(-1)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            <div className="rcp-logo" onClick={() => navigate("/app")}>
              <div className="rcp-logo-icon">TV</div>
              <span className="rcp-logo-text">CampusTV</span>
              <span className="rcp-logo-badge">Live</span>
            </div>
          </div>
          <div className="rcp-topbar-right">
            <div className="rcp-status-pill">
              <span className={`rcp-dot ${isInCall ? "live" : (isMatching || zegoConnecting) ? "searching" : ""}`} />
              {isInCall ? "Connected" : (isMatching || zegoConnecting) ? "Searching…" : "Ready"}
            </div>
            {isInCall && (
              <button className="rcp-flag-btn" onClick={() => setShowReportSheet(true)}>
                <Flag size={14} />
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
            ref={vcolRef}
            className="rcp-vcol rcp-vcol-inner"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={Math.abs(swipeDelta) > 20
              ? { transform: `translateX(${swipeDelta * 0.1}px)`, transition: "none" }
              : { transform: "translateX(0)", transition: "transform 0.3s ease" }
            }
          >
            {/* Zego */}
            {zegoRenderMatch && (
              <div className="rcp-zego-fill" style={{ opacity: zegoConnecting ? 0 : 1, transition: "opacity 0.4s ease", zIndex: 1 }}>
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
                      setZegoConnecting(false); setCallStartedAt(Date.now()); setConnectionIssue("");
                    }, 1100);
                  }}
                />
              </div>
            )}

            {/* Connecting overlay */}
            {zegoConnecting && (
              <div className="rcp-connecting">
                <div className="rcp-spin-ring" />
                <p className="rcp-connecting-name">
                  {match ? `Connecting to ${upcomingPartnerName}…` : "Connecting…"}
                </p>
              </div>
            )}

            {/* Idle */}
            {!zegoRenderMatch && !zegoConnecting && (
              <div className="rcp-idle">
                {isMatching ? (
                  <div className="rcp-searching-wrap">
                    <div className="rcp-spin-ring" />
                    <p style={{ fontFamily: "var(--font-head)", fontSize: 14, fontWeight: 700, color: "var(--muted)", letterSpacing: "-0.01em" }}>
                      Finding someone…
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rcp-idle-video-wrap">
                      <video ref={localVideoRef} autoPlay muted playsInline />
                    </div>
                    <div className="rcp-idle-overlay">
                      <div className="rcp-idle-orb">
                        <svg width="26" height="26" fill="none" stroke="rgba(241,245,249,0.5)" strokeWidth="1.5" viewBox="0 0 24 24">
                          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                        </svg>
                      </div>
                      <p className="rcp-idle-title">{connectionIssue ? "Connection lost" : "Tap Start below"}</p>
                      {!connectionIssue && <p className="rcp-idle-sub">Meet campus students via video</p>}
                    </div>
                    <span className="rcp-you-tag">You</span>
                  </>
                )}
              </div>
            )}

            {/* Call badges */}
            {isInCall && (
              <div className="rcp-call-badges">
                <div className="rcp-live-pill"><span className="rcp-live-blink" /> Live</div>
                <div className="rcp-name-chip">{match!.partner.fullName.split(" ")[0]}</div>
                <div className="rcp-timer-chip">{liveTimer}</div>
              </div>
            )}

            {/* Call actions */}
            {isInCall && (
              <div className="rcp-call-actions">
                <button
                  className="rcp-act-btn friend" title={getFriendLabel()}
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

            {/* Swipe hints */}
            <div className={`rcp-swipe-hint ${swipeDir === "left" && Math.abs(swipeDelta) > 40 ? "on" : ""}`}>
              <div className="rcp-swipe-lbl next">← Next</div>
            </div>
            <div className={`rcp-swipe-hint ${swipeDir === "right" && Math.abs(swipeDelta) > 40 ? "on" : ""}`}>
              <div className="rcp-swipe-lbl stop">→ Stop</div>
            </div>
          </div>

          {/* DESKTOP SIDEBAR */}
          <div className="rcp-sidebar">
            <div className="rcp-sidebar-head">
              <p className="rcp-sidebar-eyebrow">Messages</p>
              <p className="rcp-sidebar-title">Live Chat</p>
            </div>
            <div className="rcp-sidebar-msgs" ref={liveChatBodyRef}>
              {liveMessages.length === 0 && (
                <div className="rcp-sidebar-empty">
                  <MessageCircle size={28} />
                  <p>{isInCall ? "Say something to start chatting!" : "Chat messages appear here during a call."}</p>
                </div>
              )}
              {liveMessages.map((entry) => (
                <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                  <p className="rcp-bubble-name">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                  <p>{entry.message}</p>
                </div>
              ))}
            </div>
            <form className="rcp-sidebar-form" onSubmit={sendLiveChatMessage}>
              <input className="rcp-sidebar-input" value={liveChatInput}
                onChange={(e) => setLiveChatInput(e.target.value)}
                placeholder={isInCall ? "Type a message…" : "Start a call to chat"}
                disabled={!isInCall} />
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
                <button key={emoji} className="rcp-emoji-pick" onClick={() => triggerReaction(emoji)}>{emoji}</button>
              ))}
            </div>
          )}

          <div className="rcp-ctrl-grp">
            {!hasStarted ? (
              <button className="rcp-ctrl-btn" onClick={startMatching} disabled={isMatching}>
                <div className="rcp-ctrl-icon ci-start"><Play size={22} fill="#080b12" color="#080b12" /></div>
                <span className="rcp-ctrl-label">Start</span>
              </button>
            ) : (
              <>
                <button className="rcp-ctrl-btn" onClick={stopMatching}>
                  <div className="rcp-ctrl-icon ci-stop"><PhoneOff size={20} /></div>
                  <span className="rcp-ctrl-label">Stop</span>
                </button>
                <button className="rcp-ctrl-btn" onClick={() => { setShowReactionTray((p) => !p); }} disabled={!isInCall}>
                  <div className="rcp-ctrl-icon ci-react"><SmilePlus size={20} /></div>
                  <span className="rcp-ctrl-label">React</span>
                </button>
                <button className="rcp-ctrl-btn rcp-ctrl-btn-chat-mobile" onClick={() => setShowLiveChat((p) => !p)} disabled={!isInCall}>
                  <div className={`rcp-ctrl-icon ci-chat ${showLiveChat ? "on" : ""}`}>
                    <MessageCircle size={20} />
                  </div>
                  <span className="rcp-ctrl-label">Chat</span>
                </button>
                <button className="rcp-ctrl-btn" onClick={nextMatch} disabled={!isInCall && !isMatching}>
                  <div className="rcp-ctrl-icon ci-next"><SkipForward size={20} /></div>
                  <span className="rcp-ctrl-label">Next</span>
                </button>
              </>
            )}
          </div>

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
          {/* FIX: Added drawerBodyRef so drawer scrolls to bottom on new messages */}
          <div className="rcp-drawer-body" ref={drawerBodyRef}>
            {liveMessages.length === 0 && <p className="rcp-drawer-empty">Messages appear here during the call</p>}
            {liveMessages.map((entry) => (
              <div key={entry.id} className={`rcp-bubble ${entry.senderId === user.id ? "mine" : "theirs"}`}>
                <p className="rcp-bubble-name">{entry.senderId === user.id ? "You" : entry.senderName.split(" ")[0]}</p>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
          <form className="rcp-drawer-form" onSubmit={sendLiveChatMessage}>
            <input className="rcp-drawer-input" value={liveChatInput}
              onChange={(e) => setLiveChatInput(e.target.value)}
              placeholder={isInCall ? "Type a message…" : "Start a call to chat"}
              disabled={!isInCall} />
            {/* FIX: disabled when no input or not in call, consistent with sidebar */}
            <button className="rcp-drawer-send" type="submit" disabled={!liveChatInput.trim() || !isInCall}>
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* REPORT SHEET */}
        {showReportSheet && match && (
          <div className="rcp-backdrop" onClick={() => setShowReportSheet(false)}>
            <div className="rcp-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="rcp-sheet-handle" />
              <div className="rcp-sheet-xrow"><button className="rcp-sheet-x" onClick={() => setShowReportSheet(false)}><X size={14} /></button></div>
              <p className="rcp-sheet-eyebrow">Report User</p>
              <p className="rcp-sheet-name">{match.partner.fullName}</p>
              <div className="rcp-chips">
                {["Spam", "Harassment", "Inappropriate", "Fake profile"].map((r) => (
                  <span key={r} className={`rcp-chip ${reportReason === r ? "on" : ""}`} onClick={() => setReportReason(r)}>{r}</span>
                ))}
              </div>
              <textarea className="rcp-sheet-ta" placeholder="Add context (optional)…" value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
              <button className="rcp-sheet-btn report" onClick={() => void submitReport()} disabled={actionBusy === "report"}>
                Submit Report
              </button>
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
              <p className="rcp-sheet-txt">They'll be removed and skipped in all future random matches.</p>
              <textarea className="rcp-sheet-ta" placeholder="Optional note for yourself" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
              <button className="rcp-sheet-btn block" onClick={() => void confirmBlock()} disabled={actionBusy === "block"}>
                Block and Continue
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}