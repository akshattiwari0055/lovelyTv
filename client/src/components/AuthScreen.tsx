import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Mail,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import { api } from "../lib/api";
import { User } from "../types";
import { Header } from "./Header";

type AuthScreenProps = {
  onAuthenticated: (payload: { token: string; user: User }) => void;
  isLoggedIn: boolean;
};

const initialRegisterForm = {
  fullName: "",
  email: "",
  registrationNo: ""
};

function getRequestErrorMessage(err: any, fallback: string) {
  const responseMessage = err?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }
  if (err?.code === "ECONNABORTED") return "Request timed out. Please try again.";
  if (err?.request) return "Could not reach the backend. Check Railway backend CORS, public URL, and SMTP variables.";
  return fallback;
}

export function AuthScreen({ onAuthenticated, isLoggedIn }: AuthScreenProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const modeParam = searchParams.get("mode") as "login" | "register" | null;
  const [mode, setMode] = useState<"login" | "register">(modeParam || "register");
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [otpLoginForm, setOtpLoginForm] = useState({ email: "", otp: "" });
  const [registerOtp, setRegisterOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [registerOtpStatus, setRegisterOtpStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [otpLoginStatus, setOtpLoginStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const authLayoutRef = useRef<HTMLDivElement>(null);
  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const hasRegisterEmail = registerForm.email.trim().length > 0;
  const hasOtpLoginEmail = otpLoginForm.email.trim().length > 0;

  useEffect(() => { if (modeParam) setMode(modeParam); }, [modeParam]);

  useEffect(() => {
    if (!registerOtp.trim() || !hasRegisterEmail || registerOtp.trim().length !== 6) {
      setRegisterOtpStatus("idle"); return;
    }
    const id = window.setTimeout(async () => {
      try {
        setRegisterOtpStatus("checking");
        const r = await api.post("/auth/check-otp", { email: registerForm.email, purpose: "register", otp: registerOtp });
        setRegisterOtpStatus(r.data.valid ? "valid" : "invalid");
      } catch { setRegisterOtpStatus("invalid"); }
    }, 350);
    return () => window.clearTimeout(id);
  }, [registerForm.email, registerOtp, hasRegisterEmail]);

  useEffect(() => {
    if (!otpLoginForm.otp.trim() || !hasOtpLoginEmail || otpLoginForm.otp.trim().length !== 6) {
      setOtpLoginStatus("idle"); return;
    }
    const id = window.setTimeout(async () => {
      try {
        setOtpLoginStatus("checking");
        const r = await api.post("/auth/check-otp", { email: otpLoginForm.email, purpose: "login", otp: otpLoginForm.otp });
        setOtpLoginStatus(r.data.valid ? "valid" : "invalid");
      } catch { setOtpLoginStatus("invalid"); }
    }, 350);
    return () => window.clearTimeout(id);
  }, [otpLoginForm.email, otpLoginForm.otp, hasOtpLoginEmail]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".ar", { y: 18, opacity: 0, duration: 0.6, stagger: 0.06, ease: "power3.out" });
    }, authLayoutRef);
    return () => ctx.revert();
  }, [mode]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    let mounted = true;
    const render = () => {
      if (!mounted || !window.google || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => void handleGoogleAuth(credential)
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline", size: "large", width: "340",
        text: mode === "register" ? "signup_with" : "signin_with", shape: "pill"
      });
    };
    if (window.google) render();
    else {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true; s.onload = render;
      document.body.appendChild(s);
    }
    return () => { mounted = false; };
  }, [mode, registerForm.registrationNo]);

  async function handleGoogleAuth(credential: string) {
    setError(""); setInfo(""); setLoading(true);
    try {
      const r = await api.post("/auth/google", { credential, registrationNo: registerForm.registrationNo });
      onAuthenticated(r.data); navigate("/app", { replace: true });
    } catch (err: any) { setError(getRequestErrorMessage(err, "Google sign-in failed")); }
    finally { setLoading(false); }
  }

  async function requestOtp(email: string, purpose: "register" | "login") {
    setError(""); setInfo(""); setLoading(true);
    try {
      const r = await api.post("/auth/request-otp", { email, purpose });
      setInfo(r.data.message ?? "OTP sent.");
    } catch (err: any) { setError(getRequestErrorMessage(err, "Could not send OTP.")); }
    finally { setLoading(false); }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault(); setError(""); setInfo(""); setLoading(true);
    try {
      const r = await api.post("/auth/register", { ...registerForm, otp: registerOtp });
      onAuthenticated(r.data); navigate("/app", { replace: true });
    } catch (err: any) { setError(getRequestErrorMessage(err, "Could not create account")); }
    finally { setLoading(false); }
  }

  async function handleOtpLogin(event: FormEvent) {
    event.preventDefault(); setError(""); setInfo(""); setLoading(true);
    try {
      const r = await api.post("/auth/login-otp", otpLoginForm);
      onAuthenticated(r.data); navigate("/app", { replace: true });
    } catch (err: any) { setError(getRequestErrorMessage(err, "Could not log in with OTP")); }
    finally { setLoading(false); }
  }

  const switchMode = (m: "login" | "register") => {
    setMode(m); setError(""); setInfo("");
    navigate(`/auth?mode=${m}`, { replace: true });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;1,400&display=swap');

        :root {
          --bg:    #08080c;
          --bg2:   #0e0e16;
          --bg3:   #14141f;
          --acc:   #d4f244;
          --acc2:  #ff6b35;
          --txt:   #efefef;
          --muted: rgba(239,239,239,0.42);
          --line:  rgba(239,239,239,0.08);
          --fd: 'Cabinet Grotesk', sans-serif;
          --fb: 'Instrument Sans', sans-serif;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .auth-shell {
          min-height: 100dvh;
          background: var(--bg);
          color: var(--txt);
          font-family: var(--fb);
          -webkit-font-smoothing: antialiased;
          display: flex;
          flex-direction: column;
        }

        /* ─────────────────────────────────────────
           DESKTOP LAYOUT
        ───────────────────────────────────────── */
        .auth-main {
          flex: 1;
          display: flex;
          align-items: stretch;
          position: relative;
        }

        /* Single back button — absolute top-left on desktop, aligned with navbar */
        .back-link {
          position: absolute;
          top: 20px;
          left: 28px;
          z-index: 10;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 500;
          color: var(--muted);
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.15s;
          padding: 0;
          text-decoration: none;
        }
        .back-link:hover { color: var(--txt); }

        .auth-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          min-height: calc(100dvh - 72px);
        }

        /* ── LEFT ASIDE ── */
        .auth-aside {
          background: var(--bg2);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 80px 52px 52px;
          gap: 32px;
          position: relative;
          overflow: hidden;
        }
        .auth-aside::before {
          content: '';
          position: absolute;
          bottom: -160px; left: -120px;
          width: 480px; height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,242,68,0.055) 0%, transparent 70%);
          pointer-events: none;
        }
        .auth-aside::after {
          content: '';
          position: absolute;
          top: -80px; right: -60px;
          width: 280px; height: 280px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,107,53,0.04) 0%, transparent 70%);
          pointer-events: none;
        }

        .aside-eyebrow {
          font-family: var(--fd);
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 2.8px;
          text-transform: uppercase;
          color: var(--acc);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .aside-eyebrow::before { content: ''; width: 16px; height: 1px; background: var(--acc); opacity: 0.55; }

        .aside-copy h1 {
          font-family: var(--fd);
          font-size: clamp(22px, 2.4vw, 34px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.1;
          color: var(--txt);
          margin-bottom: 10px;
        }
        .aside-copy p {
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.68;
          font-weight: 400;
          max-width: 340px;
        }

        .aside-highlights {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .aside-hi-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--muted);
          font-weight: 400;
        }
        .aside-hi-item svg { color: var(--acc); flex-shrink: 0; }

        .aside-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .aside-metric {
          background: rgba(239,239,239,0.03);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .aside-metric strong {
          font-family: var(--fd);
          font-size: 13px;
          font-weight: 800;
          color: var(--txt);
          display: block;
          letter-spacing: -0.015em;
          margin-bottom: 3px;
        }
        .aside-metric span { font-size: 12px; color: var(--muted); line-height: 1.5; }

        /* ── RIGHT CARD ── */
        .auth-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 80px 52px 52px;
          overflow-y: auto;
          background: var(--bg);
        }

        .auth-card-inner {
          max-width: 420px;
          width: 100%;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .auth-card-head {}
        .card-eyebrow {
          font-family: var(--fd);
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 2.8px;
          text-transform: uppercase;
          color: var(--acc);
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .card-eyebrow::before { content: ''; width: 14px; height: 1px; background: var(--acc); opacity: 0.55; }

        .auth-card-head h2 {
          font-family: var(--fd);
          font-size: clamp(22px, 2.2vw, 30px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.1;
          color: var(--txt);
          margin-bottom: 6px;
        }
        .auth-card-head p {
          font-size: 13.5px;
          color: var(--muted);
          line-height: 1.6;
        }

        /* ── Tab switch ── */
        .auth-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          background: var(--bg3);
          border: 1px solid var(--line);
          border-radius: 100px;
          padding: 3px;
        }
        .auth-tabs button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-family: var(--fd);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: -0.01em;
          padding: 10px 16px;
          border-radius: 100px;
          border: none;
          background: none;
          color: var(--muted);
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .auth-tabs button.active {
          background: var(--acc);
          color: #08080c;
        }

        /* ── Google ── */
        .google-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .google-btn-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg3);
          border: 1px solid var(--line);
          border-radius: 100px;
          padding: 6px 8px;
          min-height: 52px;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .google-btn-wrap:hover { border-color: rgba(239,239,239,0.18); }
        .google-placeholder {
          font-size: 13.5px;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ── Divider ── */
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .auth-divider::before, .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--line);
        }
        .auth-divider span {
          font-size: 11.5px;
          color: var(--muted);
          white-space: nowrap;
          letter-spacing: 0.3px;
        }

        /* ── Form ── */
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          cursor: text;
        }
        .form-field > span {
          font-size: 12px;
          font-weight: 500;
          color: rgba(239,239,239,0.55);
          letter-spacing: 0.2px;
        }
        .input-wrap {
          display: flex;
          align-items: center;
          background: var(--bg3);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 0 12px;
          gap: 9px;
          transition: border-color 0.15s;
        }
        .input-wrap:focus-within { border-color: rgba(212,242,68,0.35); }
        .input-wrap svg.ico { color: rgba(239,239,239,0.3); flex-shrink: 0; }
        .input-wrap input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-family: var(--fb);
          font-size: 14px;
          color: var(--txt);
          padding: 12px 0;
          min-width: 0;
        }
        .input-wrap input::placeholder { color: rgba(239,239,239,0.25); }

        .status-icon { flex-shrink: 0; }
        .status-icon.ok  { color: #4ade80; }
        .status-icon.err { color: #f87171; }

        .otp-status {
          font-size: 11.5px;
          line-height: 1.4;
          padding-left: 2px;
        }
        .otp-status.ok  { color: #4ade80; }
        .otp-status.err { color: #f87171; }
        .otp-status.chk { color: var(--muted); }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .otp-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: rgba(212,242,68,0.04);
          border: 1px solid rgba(212,242,68,0.1);
          border-radius: 10px;
          padding: 10px 14px;
        }
        .otp-row-hint {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.5;
        }
        .otp-row-hint strong { color: var(--acc); font-weight: 600; }
        .send-otp-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--fd);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: -0.01em;
          color: var(--acc);
          background: rgba(212,242,68,0.1);
          border: 1px solid rgba(212,242,68,0.18);
          border-radius: 100px;
          padding: 8px 14px;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .send-otp-btn:hover:not(:disabled) { background: rgba(212,242,68,0.18); }
        .send-otp-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .submit-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          width: 100%;
          padding: 14px 24px;
          background: var(--acc);
          color: #08080c;
          font-family: var(--fd);
          font-size: 15px;
          font-weight: 900;
          letter-spacing: -0.02em;
          border: none;
          border-radius: 100px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(212,242,68,0.25);
        }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .alert {
          border-radius: 10px;
          padding: 11px 14px;
          font-size: 13px;
          line-height: 1.55;
        }
        .alert-err { background: rgba(248,113,113,0.08); border: 1px solid rgba(248,113,113,0.18); color: #fca5a5; }
        .alert-ok  { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.18); color: #86efac; }

        /* ─────────────────────────────────────────
           MOBILE LAYOUT  (≤ 860px)
           - Login form FIRST (top)
           - Branding/aside AFTER (below on scroll)
           - Single back button above form
           - No duplicate back button
        ───────────────────────────────────────── */
        @media (max-width: 860px) {
          .auth-main {
            align-items: flex-start;
          }

          /* Hide the absolute back button on mobile — we show one inside the card */
          .back-link {
            display: none;
          }

          .auth-layout {
            /* Stack: form first, then aside below */
            display: flex;
            flex-direction: column;
            min-height: auto;
            width: 100%;
            max-width: 100%;
          }

          /* RIGHT card (form) comes first visually */
          .auth-card {
            order: 1;
            padding: 20px 20px 28px;
            justify-content: flex-start;
          }

          /* LEFT aside comes second */
          .auth-aside {
            order: 2;
            border-right: none;
            border-top: 1px solid var(--line);
            padding: 28px 20px 36px;
            gap: 24px;
          }

          .auth-card-inner {
            max-width: 100%;
            gap: 16px;
          }

          /* Mobile back button — shown inside the card, above heading */
          .mobile-back-btn {
            display: inline-flex !important;
          }

          /* Larger touch targets */
          .auth-tabs button {
            padding: 11px 16px;
            font-size: 14px;
          }

          .input-wrap input {
            padding: 13px 0;
            font-size: 15px;
          }

          .submit-btn {
            padding: 15px 24px;
            font-size: 15px;
          }

          .send-otp-btn {
            padding: 9px 14px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .aside-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .auth-aside::before,
          .auth-aside::after {
            display: none;
          }
        }

        /* Mobile back button — hidden on desktop */
        .mobile-back-btn {
          display: none;
          align-items: center;
          gap: 7px;
          font-size: 13px;
          font-weight: 500;
          color: var(--muted);
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          width: fit-content;
          transition: color 0.15s;
        }
        .mobile-back-btn:hover { color: var(--txt); }
      `}</style>

      <div className="auth-shell">
        <Header isLoggedIn={isLoggedIn} onLogout={() => {}} />

        <main className="auth-main">
          {/* Desktop-only back button — absolute top-left, outside both columns */}
          <button className="back-link ar" onClick={() => navigate("/")}>
            <ArrowLeft size={15} /> Back to Home
          </button>

          <div className="auth-layout" ref={authLayoutRef}>

            {/* ── LEFT ASIDE ── */}
            <aside className="auth-aside ar">
              <div className="aside-copy ar">
                <p className="aside-eyebrow">Welcome to LPU TV</p>
                <h1>
                  {mode === "register"
                    ? "Join campus conversations in one step."
                    : "Get back inside fast."}
                </h1>
                <p>
                  {mode === "register"
                    ? "Name, LPU email, registration number, OTP. No clutter, no long forms."
                    : "Use your LPU email OTP or Google account to re-enter your verified student network."}
                </p>
              </div>

              <div className="aside-highlights ar">
                {[
                  "Verified access using official LPU identity",
                  "Fast OTP onboarding with just the essentials",
                  "Google sign-in for one-tap entry"
                ].map((item) => (
                  <div className="aside-hi-item" key={item}>
                    <Sparkles size={14} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="aside-metrics ar">
                <div className="aside-metric">
                  <strong>LPU-only</strong>
                  <span>Students join with verified campus identity.</span>
                </div>
                <div className="aside-metric">
                  <strong>Quick setup</strong>
                  <span>Name, email OTP &amp; registration number.</span>
                </div>
              </div>
            </aside>

            {/* ── RIGHT CARD (form — comes FIRST on mobile via order:1) ── */}
            <div className="auth-card">
              <div className="auth-card-inner">

                {/* Mobile-only back button — single, at top of form */}
                <button className="mobile-back-btn ar" onClick={() => navigate("/")}>
                  <ArrowLeft size={15} /> Back to Home
                </button>

                {/* heading */}
                <div className="auth-card-head ar">
                  <p className="card-eyebrow">{mode === "register" ? "New Account" : "Sign In"}</p>
                  <h2>{mode === "register" ? "Create account" : "Login to continue"}</h2>
                  <p>{mode === "register" ? "A shorter signup built for fast onboarding." : "Use OTP or Google and jump straight back in."}</p>
                </div>

                {/* tabs */}
                <div className="auth-tabs ar">
                  <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")} type="button">
                    <UserPlus size={15} /> Sign Up
                  </button>
                  <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} type="button">
                    <ShieldCheck size={15} /> Login
                  </button>
                </div>

                {/* Google */}
                <div className="google-section ar">
                  <div className="google-btn-wrap">
                    <div ref={googleButtonRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                      {!hasGoogleClientId && (
                        <span className="google-placeholder">
                          <svg width="18" height="18" viewBox="0 0 18 18">
                            <path d="M17.64 9.2a10.3 10.3 0 0 0-.16-1.84H9v3.48h4.84A4.14 4.14 0 0 1 12.07 13v2.26h2.88A8.78 8.78 0 0 0 17.64 9.2Z" fill="#4285F4"/>
                            <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.88-2.26a5.4 5.4 0 0 1-8.06-2.85H1.07v2.33A9 9 0 0 0 9 18Z" fill="#34A853"/>
                            <path d="M4.02 10.71A5.4 5.4 0 0 1 4.02 7.29V4.96H1.07a9 9 0 0 0 0 8.08l2.95-2.33Z" fill="#FBBC05"/>
                            <path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 1.07 4.96L4.02 7.3A5.4 5.4 0 0 1 9 3.58Z" fill="#EA4335"/>
                          </svg>
                          {mode === "register" ? "Sign up with Google" : "Sign in with Google"}
                        </span>
                      )}
                    </div>
                  </div>
                  {!hasGoogleClientId && (
                    <p style={{ fontSize: "11px", color: "var(--muted)", textAlign: "center" }}>
                      Add <strong style={{ color: "var(--txt)" }}>VITE_GOOGLE_CLIENT_ID</strong> to enable Google auth
                    </p>
                  )}
                </div>

                {/* divider */}
                <div className="auth-divider ar"><span>or use email OTP</span></div>

                {/* REGISTER FORM */}
                {mode === "register" ? (
                  <form className="auth-form ar" onSubmit={handleRegister}>
                    <label className="form-field">
                      <span>Full name</span>
                      <div className="input-wrap">
                        <Users className="ico" size={16} />
                        <input placeholder="Your full name" value={registerForm.fullName}
                          onChange={(e) => setRegisterForm(c => ({ ...c, fullName: e.target.value }))} required />
                      </div>
                    </label>

                    <label className="form-field">
                      <span>Official LPU email</span>
                      <div className="input-wrap">
                        <Mail className="ico" size={16} />
                        <input placeholder="name@lpu.in" type="email" value={registerForm.email}
                          onChange={(e) => setRegisterForm(c => ({ ...c, email: e.target.value }))} required />
                      </div>
                    </label>

                    <div className="otp-row">
                      <p className="otp-row-hint">OTP sent only to <strong>@lpu.in</strong> email.</p>
                      <button className="send-otp-btn" type="button"
                        disabled={loading || !hasRegisterEmail}
                        onClick={() => void requestOtp(registerForm.email, "register")}>
                        {loading ? "Sending…" : "Send OTP"} <ArrowRight size={13} />
                      </button>
                    </div>

                    <div className="form-grid">
                      <label className="form-field">
                        <span>Registration no.</span>
                        <div className="input-wrap">
                          <NotebookPen className="ico" size={16} />
                          <input placeholder="8 digits" value={registerForm.registrationNo}
                            inputMode="numeric" pattern="[0-9]{8}" maxLength={8}
                            onChange={(e) => setRegisterForm(c => ({ ...c, registrationNo: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                            required />
                        </div>
                      </label>

                      <label className="form-field">
                        <span>OTP</span>
                        <div className="input-wrap">
                          <ShieldCheck className="ico" size={16} />
                          <input placeholder="6-digit OTP" value={registerOtp}
                            inputMode="numeric" maxLength={6}
                            onChange={(e) => setRegisterOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
                          {registerOtpStatus === "valid"   && <CheckCircle2 className="status-icon ok"  size={16} />}
                          {registerOtpStatus === "invalid" && <XCircle      className="status-icon err" size={16} />}
                        </div>
                        {registerOtpStatus === "checking" && <span className="otp-status chk">Checking…</span>}
                        {registerOtpStatus === "valid"    && <span className="otp-status ok">Verified ✓</span>}
                        {registerOtpStatus === "invalid"  && <span className="otp-status err">Invalid or expired</span>}
                      </label>
                    </div>

                    <button className="submit-btn" type="submit" disabled={loading}>
                      {loading ? "Setting up…" : "Join LPU TV"} <ArrowRight size={15} />
                    </button>
                  </form>
                ) : (
                  /* LOGIN FORM */
                  <form className="auth-form ar" onSubmit={handleOtpLogin}>
                    <label className="form-field">
                      <span>Official LPU email</span>
                      <div className="input-wrap">
                        <Mail className="ico" size={16} />
                        <input placeholder="name@lpu.in" type="email" value={otpLoginForm.email}
                          onChange={(e) => setOtpLoginForm(c => ({ ...c, email: e.target.value }))} required />
                      </div>
                    </label>

                    <div className="otp-row">
                      <p className="otp-row-hint">Use your <strong>@lpu.in</strong> email to receive OTP.</p>
                      <button className="send-otp-btn" type="button"
                        disabled={loading || !hasOtpLoginEmail}
                        onClick={() => void requestOtp(otpLoginForm.email, "login")}>
                        {loading ? "Sending…" : "Send OTP"} <ArrowRight size={13} />
                      </button>
                    </div>

                    <label className="form-field">
                      <span>OTP</span>
                      <div className="input-wrap">
                        <ShieldCheck className="ico" size={16} />
                        <input placeholder="6-digit OTP" value={otpLoginForm.otp}
                          inputMode="numeric" maxLength={6}
                          onChange={(e) => setOtpLoginForm(c => ({ ...c, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))} required />
                        {otpLoginStatus === "valid"   && <CheckCircle2 className="status-icon ok"  size={16} />}
                        {otpLoginStatus === "invalid" && <XCircle      className="status-icon err" size={16} />}
                      </div>
                      {otpLoginStatus === "checking" && <span className="otp-status chk">Checking…</span>}
                      {otpLoginStatus === "valid"    && <span className="otp-status ok">Verified. Ready to login ✓</span>}
                      {otpLoginStatus === "invalid"  && <span className="otp-status err">Invalid or expired</span>}
                    </label>

                    <button className="submit-btn" type="submit" disabled={loading}>
                      {loading ? "Verifying…" : "Login with OTP"} <ArrowRight size={15} />
                    </button>
                  </form>
                )}

                {error && <div className="alert alert-err ar">{error}</div>}
                {info  && <div className="alert alert-ok  ar">{info}</div>}

              </div>
            </div>

          </div>
        </main>
      </div>
    </>
  );
}