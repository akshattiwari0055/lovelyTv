import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthScreen } from "./components/AuthScreen";
import { LandingPage } from "./components/LandingPage";
import { Dashboard } from "./components/Dashboard";
import { RandomChatPage } from "./components/RandomChatPage";
import { setAuthToken } from "./lib/api";
import { User } from "./types";
import { Analytics } from "@vercel/analytics/react";
type SessionState = {
  token: string;
  user: User;
};

const SESSION_KEY = "lputv-session";

function loadStoredSession(): SessionState | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

// ─── Zego createSpan suppressor ──────────────────────────────────────────────
// Zego's internal tracer (Ct) is explicitly nulled during SDK cleanup, but
// componentWillUnmount still tries to call Ct.createSpan() after that point.
// This is a confirmed SDK bug — unfixable from outside the bundle.
//
// The error surfaces via three different paths depending on where in the
// call stack it's thrown, so we patch all three:
//   1. window "error" event   — catches most synchronous throws
//   2. window.onerror         — catches throws inside rAF callbacks (V8-specific)
//   3. unhandledrejection     — catches any async/promise variant
//
// Only errors matching known Zego tracer cleanup signatures and "zego" in source
// filename are suppressed — everything else propagates normally.

function isZegoSpanError(msg?: string | null, filename?: string | null) {
  return (
    typeof msg === "string" &&
    (msg.includes("createSpan") || msg.includes("reading 'end'")) &&
    (filename == null || filename === "" || filename.includes("zego"))
  );
}

function installZegoErrorSuppressor() {
  // Path 1 — standard script errors
  const errorHandler = (event: ErrorEvent) => {
    if (isZegoSpanError(event.message, event.filename)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  };

  // Path 2 — errors thrown inside requestAnimationFrame (missed by path 1 in V8)
  const prevOnError = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    if (isZegoSpanError(String(msg), src)) return true; // returning true suppresses
    return prevOnError ? prevOnError(msg, src, line, col, err) : false;
  };

  // Path 3 — promise rejections
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    if (isZegoSpanError(event.reason?.message, "")) {
      event.preventDefault();
    }
  };

  window.addEventListener("error", errorHandler, true);
  window.addEventListener("unhandledrejection", rejectionHandler, true);

  // Return cleanup in case it's ever needed (e.g. tests)
  return () => {
    window.removeEventListener("error", errorHandler, true);
    window.removeEventListener("unhandledrejection", rejectionHandler, true);
    window.onerror = prevOnError;
  };
}

// Installed at module scope — runs before React renders anything,
// active for the full app lifetime.
installZegoErrorSuppressor();
// ─────────────────────────────────────────────────────────────────────────────

const initialSession = loadStoredSession();
if (initialSession) {
  setAuthToken(initialSession.token);
}

export function App() {
  const [session, setSession] = useState<SessionState | null>(initialSession);

  useEffect(() => {
    setAuthToken(session?.token ?? null);
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  const handleLogout = () => setSession(null);
  return (
  <>
    <Routes>
      <Route
        path="/"
        element={
          session ? (
            <Navigate to="/app" replace />
          ) : (
            <LandingPage
              isLoggedIn={!!session}
              onLogout={handleLogout}
            />
          )
        }
      />

      <Route
        path="/auth"
        element={
          session ? (
            <Navigate to="/app" replace />
          ) : (
            <AuthScreen
              isLoggedIn={!!session}
              onAuthenticated={(payload) => setSession(payload)}
            />
          )
        }
      />

      <Route
        path="/app"
        element={
          session ? (
            <Dashboard
              token={session.token}
              user={session.user}
              onLogout={handleLogout}
            />
          ) : (
            <Navigate to="/auth?mode=login" replace />
          )
        }
      />

      <Route
        path="/app/random"
        element={
          session ? (
            <RandomChatPage token={session.token} user={session.user} />
          ) : (
            <Navigate to="/auth?mode=login" replace />
          )
        }
      />
    </Routes>

    {/* 👇 ADD THIS LINE */}
    <Analytics />
  </>
);
}
