import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Flag, PhoneOff, Play, ShieldBan, SkipForward, UserPlus, X } from "lucide-react";
import { api } from "../lib/api";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { MatchResult, RelationshipStatus, User } from "../types";
import { VideoRoom } from "./VideoRoom";

type RandomChatPageProps = {
  token: string;
  user: User;
};

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

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const hasStartedRef = useRef(hasStarted);
  const previewRetryTimerRef = useRef<number | null>(null);
  const upcomingPartnerName = match?.partner.fullName?.split(" ")[0] ?? "Someone";

  useEffect(() => {
    hasStartedRef.current = hasStarted;
  }, [hasStarted]);

  useEffect(() => {
    // Release the camera when matched so Zego can acquire it
    if (match || zegoRenderMatch || zegoConnecting) return;

    let cancelled = false;
    let currentStream: MediaStream | null = null;

    const startPreview = () => {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((track) => track.stop());
            return;
          }
          currentStream = s;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = currentStream;
          }
        })
        .catch((error: DOMException) => {
          if (cancelled) return;

          if (error.name === "NotReadableError") {
            previewRetryTimerRef.current = window.setTimeout(() => {
              if (!cancelled) {
                startPreview();
              }
            }, 1000);
            return;
          }

          console.error(error);
        });
    };

    startPreview();

    return () => {
      cancelled = true;
      if (previewRetryTimerRef.current !== null) {
        window.clearTimeout(previewRetryTimerRef.current);
        previewRetryTimerRef.current = null;
      }
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    };
  }, [match, zegoConnecting, zegoRenderMatch]);

  useEffect(() => {
    // Add an 800ms delay before mounting Zego.
    // This gives the browser's hardware layer enough time to fully release 
    // the camera lock from the previous local video stream, avoiding 
    // "Starting videoinput failed" or 1000002 errors.
    if (match) {
      const timer = setTimeout(() => {
        setZegoRenderMatch(match);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setZegoRenderMatch(null);
    }
  }, [match]);

  useEffect(() => {
    // Zego UIKit Prebuilt aggressively attaches an annoying "Media play failed" 
    // white popup directly to document.body, which survives even after VideoRoom unmounts.
    // This global observer hunts it down and deletes it permanently.
    const bodyObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const text = node.textContent || "";
            if (text.includes("Media play failed") || text.includes("Resume")) {
              // Find the top-level wrapper attached to the body
              let target: HTMLElement = node;
              while (target.parentElement && target.parentElement !== document.body) {
                target = target.parentElement;
              }
              target.remove();
            }
          }
        });
      });
    });

    bodyObserver.observe(document.body, { childList: true, subtree: true });
    
    // Also do a quick sweep right now in case it's already there
    document.body.querySelectorAll("div").forEach(div => {
      if (div.parentElement === document.body) {
        const text = div.textContent || "";
        if (text.includes("Media play failed") || text.includes("Resume")) {
          div.remove();
        }
      }
    });

    return () => bodyObserver.disconnect();
  }, []);

  useEffect(() => {
    const socket = connectSocket(token);

    socket.on("match:waiting", () => {
      // Waiting for match
    });

    socket.on("match:found", (payload: MatchResult) => {
      setZegoConnecting(true);
      setRoomRevealPending(true);
      setMatch(payload);
      setIsMatching(false);
      setHasStarted(true);
    });

    socket.on("match:partner-left", () => {
      setMatch(null);
      setZegoConnecting(false);
      setRoomRevealPending(false);
      
      // Auto-search for next partner if the session hasn't been explicitly stopped
      if (hasStartedRef.current) {
        setIsMatching(true);
        window.setTimeout(() => {
          getSocket()?.emit("match:join-queue");
        }, 120);
      }
    });

    return () => {
      socket.off("match:waiting");
      socket.off("match:found");
      socket.off("match:partner-left");
      socket.emit("match:leave-room");
      socket.emit("match:leave-queue");
      disconnectSocket();
    };
  }, [token]);

  useEffect(() => {
    // If Zego gets stuck connecting (e.g. ICE failures, network issues),
    // automatically skip to the next partner after 12 seconds
    if (zegoConnecting) {
      const timer = setTimeout(() => {
        console.warn("Zego connection timed out, skipping to next partner...");
        nextMatch();
      }, 12000);
      return () => clearTimeout(timer);
    }
  }, [zegoConnecting]);

  useEffect(() => {
    api.get("/zego-config").then(res => setZegoConfig(res.data));
  }, []);

  useEffect(() => {
    if (!match) {
      setRelationship(null);
      setActionMessage("");
      setShowReportSheet(false);
      setShowBlockSheet(false);
      setReportDetails("");
      setBlockReason("");
      return;
    }

    api
      .get(`/relationships/${match.partner.id}`)
      .then((res) => setRelationship(res.data))
      .catch(() => setRelationship(null));
  }, [match]);

  async function handleFriendAction() {
    if (!match?.partner || !relationship || actionBusy) return;

    try {
      if (relationship.isFriend) {
        setActionMessage("You are already friends.");
        return;
      }

      if (relationship.incomingRequestPending && relationship.incomingRequestId) {
        setActionBusy("accept");
        await api.post(`/friend-requests/${relationship.incomingRequestId}/accept`);
        setRelationship((current) =>
          current
            ? {
                ...current,
                isFriend: true,
                incomingRequestPending: false,
                incomingRequestId: null
              }
            : current
        );
        setActionMessage("Friend request accepted.");
        return;
      }

      if (relationship.outgoingRequestPending) {
        setActionMessage("Friend request already sent.");
        return;
      }

      setActionBusy("friend");
      await api.post("/friend-requests", { receiverId: match.partner.id });
      setRelationship((current) =>
        current
          ? {
              ...current,
              outgoingRequestPending: true
            }
          : current
      );
      setActionMessage("Friend request sent.");
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not update friendship.");
    } finally {
      setActionBusy(null);
    }
  }

  async function submitReport() {
    if (!match?.partner || actionBusy) return;

    try {
      setActionBusy("report");
      await api.post(`/users/${match.partner.id}/report`, {
        reason: reportReason,
        details: reportDetails
      });
      setActionMessage("Report submitted. Thanks for helping keep the chat safe.");
      setShowReportSheet(false);
      setReportDetails("");
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not submit report.");
    } finally {
      setActionBusy(null);
    }
  }

  async function confirmBlock() {
    if (!match?.partner || actionBusy) return;

    try {
      setActionBusy("block");
      await api.post(`/users/${match.partner.id}/block`, {
        reason: blockReason
      });
      setActionMessage(`${match.partner.fullName.split(" ")[0]} has been blocked.`);
      setShowBlockSheet(false);
      nextMatch();
    } catch (error: any) {
      setActionMessage(error?.response?.data?.message ?? "Could not block this user.");
    } finally {
      setActionBusy(null);
    }
  }

  function getFriendActionLabel() {
    if (!relationship) return "Add Friend";
    if (relationship.isBlocked || relationship.isBlockedByOther) return "Unavailable";
    if (relationship.isFriend) return "Friends";
    if (relationship.incomingRequestPending) return "Accept Request";
    if (relationship.outgoingRequestPending) return "Request Sent";
    return "Add Friend";
  }

  function startMatching() {
    setMatch(null);
    setZegoConnecting(false);
    setRoomRevealPending(false);
    setIsMatching(true);
    setHasStarted(true);
    getSocket()?.emit("match:join-queue");
  }

  function stopMatching() {
    getSocket()?.emit("match:leave-room");
    getSocket()?.emit("match:leave-queue");
    setMatch(null);
    setZegoConnecting(false);
    setRoomRevealPending(false);
    setIsMatching(false);
    setHasStarted(false);
  }

  function nextMatch() {
    getSocket()?.emit("match:leave-room");
    setMatch(null);
    setZegoConnecting(false);
    setRoomRevealPending(false);
    setIsMatching(true);
    setHasStarted(true);
    window.setTimeout(() => {
      getSocket()?.emit("match:join-queue");
    }, 120);
  }

  return (
    <div className="random-page-container">
      <header className="random-minimal-header">
        <div className="random-header-copy">
          <h2 onClick={() => navigate("/app")}>LPU TV</h2>
          {match ? <p>{match.partner.fullName}</p> : null}
        </div>
        <div className="random-header-actions">
          {match ? (
            <div className="call-action-cluster">
              <button
                className="call-action-btn"
                onClick={() => void handleFriendAction()}
                disabled={Boolean(actionBusy) || relationship?.isBlocked || relationship?.isBlockedByOther || relationship?.isFriend || relationship?.outgoingRequestPending}
              >
                <UserPlus size={16} />
                <span>{getFriendActionLabel()}</span>
              </button>
              <button className="call-action-btn subtle" onClick={() => setShowReportSheet(true)} disabled={Boolean(actionBusy)}>
                <Flag size={16} />
                <span>Report</span>
              </button>
              <button className="call-action-btn danger" onClick={() => setShowBlockSheet(true)} disabled={Boolean(actionBusy)}>
                <ShieldBan size={16} />
                <span>Block</span>
              </button>
            </div>
          ) : null}
          <div className="status-indicator">
            <span className={`status-dot ${isMatching || zegoConnecting ? "searching" : match ? "connected" : ""}`}></span>
            {match && !zegoConnecting ? "Connected" : isMatching || zegoConnecting ? "Searching" : "Ready"}
          </div>
        </div>
      </header>

      <div className="video-blocks-container" style={{ position: "relative" }}>
        {match && actionMessage ? <div className="call-inline-status">{actionMessage}</div> : null}
        {zegoRenderMatch && (
          <div className="video-room-wrapper" style={{ opacity: zegoConnecting ? 0 : 1, transition: "opacity 0.3s ease" }}>
            <VideoRoom
              key={zegoRenderMatch.roomId}
              appId={zegoConfig.appId}
              serverSecret={zegoConfig.serverSecret}
              roomId={zegoRenderMatch.roomId}
              userId={user.id}
              userName={user.fullName}
              onJoined={() => {
                window.setTimeout(() => {
                  setZegoConnecting(false);
                  setRoomRevealPending(false);
                }, 1100);
              }}
            />
          </div>
        )}

        {(!zegoRenderMatch || zegoConnecting) && (
          <div className="video-blocks-layout" style={{ position: match ? "absolute" : "relative", inset: 0, zIndex: 10 }}>
            <div className="video-block local">
              <video ref={localVideoRef} autoPlay muted playsInline style={{ opacity: match ? 0 : 1 }} />
              {match && (
                <div className="placeholder-overlay">
                  <div className="arrival-buffer">
                    <div className="arrival-pulse"></div>
                    <div className="placeholder-text">Getting your side ready...</div>
                  </div>
                </div>
              )}
            </div>
            <div className="video-block remote placeholder">
              {isMatching ? (
                <div className="arrival-buffer">
                  <div className="arrival-pulse"></div>
                  <div className="placeholder-text">Looking for someone...</div>
                </div>
              ) : (match || zegoConnecting || roomRevealPending) ? (
                <div className="arrival-buffer">
                  <div className="arrival-pulse"></div>
                  <div className="placeholder-text">{upcomingPartnerName} is almost here...</div>
                  <div className="arrival-subtext">Joining your card in a moment</div>
                </div>
              ) : (
                <div className="placeholder-text">Press Start to begin video chat.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {showReportSheet && match ? (
        <div className="call-sheet-backdrop" onClick={() => setShowReportSheet(false)}>
          <div className="call-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="call-sheet-close" onClick={() => setShowReportSheet(false)}>
              <X size={18} />
            </button>
            <p className="call-sheet-eyebrow">Report User</p>
            <h3>{match.partner.fullName}</h3>
            <div className="call-sheet-options">
              {["Spam", "Harassment", "Inappropriate behavior", "Fake profile"].map((reason) => (
                <button
                  key={reason}
                  className={reportReason === reason ? "sheet-chip active" : "sheet-chip"}
                  onClick={() => setReportReason(reason)}
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              className="call-sheet-textarea"
              placeholder="Add context if you want..."
              value={reportDetails}
              onChange={(event) => setReportDetails(event.target.value)}
            />
            <button className="sheet-submit-btn" onClick={() => void submitReport()} disabled={actionBusy === "report"}>
              Submit Report
            </button>
          </div>
        </div>
      ) : null}

      {showBlockSheet && match ? (
        <div className="call-sheet-backdrop" onClick={() => setShowBlockSheet(false)}>
          <div className="call-sheet danger-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="call-sheet-close" onClick={() => setShowBlockSheet(false)}>
              <X size={18} />
            </button>
            <p className="call-sheet-eyebrow">Block User</p>
            <h3>Block {match.partner.fullName}?</h3>
            <p className="call-sheet-copy">They will be removed from this chat and skipped in future random matches.</p>
            <textarea
              className="call-sheet-textarea"
              placeholder="Optional note for yourself"
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
            />
            <button className="sheet-submit-btn danger" onClick={() => void confirmBlock()} disabled={actionBusy === "block"}>
              Block and Continue
            </button>
          </div>
        </div>
      ) : null}

      <div className="random-controls">
        {!hasStarted ? (
          <button className="control-btn start" onClick={startMatching} disabled={isMatching}>
            <Play size={24} />
            <span>Start</span>
          </button>
        ) : (
          <>
            <button className="control-btn stop" onClick={stopMatching}>
              <PhoneOff size={24} />
              <span>Stop</span>
            </button>
            <button className="control-btn next" onClick={nextMatch} disabled={!match && !isMatching}>
              <SkipForward size={24} />
              <span>Next</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
