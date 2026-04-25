import { FormEvent, useEffect, useRef, useState } from "react";
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
  XCircle,
  Zap,
  Globe,
  Lock,
} from "lucide-react";
import { api } from "../lib/api";
import { User } from "../types";
import { Header } from "./Header";

type AuthScreenProps = {
  onAuthenticated: (payload: { token: string; user: User }) => void;
  isLoggedIn: boolean;
};

const initialRegisterForm = { fullName: "", email: "", registrationNo: "" };

function getRequestErrorMessage(err: any, fallback: string) {
  const msg = err?.response?.data?.message;
  if (typeof msg === "string" && msg.trim()) return msg;
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
  const rootRef = useRef<HTMLDivElement>(null);
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
      gsap.from(".ar", {
        y: 24, opacity: 0, duration: 0.7,
        stagger: 0.055, ease: "expo.out", delay: 0.05,
      });
    }, rootRef);
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
        callback: ({ credential }) => void handleGoogleAuth(credential),
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "filled_black", size: "large", width: "360",
        text: mode === "register" ? "signup_with" : "signin_with", shape: "pill",
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
  }, [mode]);

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
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;1,400&display=swap');

        :root {
          --bg:     #080b12;
          --bg2:    #0d1020;
          --bg3:    #111520;
          --bg4:    #161b2e;
          --cyan:   #22d3ee;
          --pink:   #f472b6;
          --violet: #a78bfa;
          --lime:   #d4f244;
          --text:   #f1f5f9;
          --muted:  rgba(241,245,249,0.44);
          --dim:    rgba(241,245,249,0.18);
          --line:   rgba(241,245,249,0.07);
          --font-display: 'Bebas Neue', sans-serif;
          --font-head:    'Cabinet Grotesk', sans-serif;
          --font-body:    'Instrument Sans', sans-serif;
          --header-h: 64px;
        }

        html, body { margin: 0; padding: 0; background: var(--bg); }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── SHELL ─────────────────────────────────── */
        .as-shell {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          min-height: 100dvh;
          -webkit-font-smoothing: antialiased;
          position: relative;
          overflow: hidden;
        }
          @media (max-width: 860px) {
  .as-shell {
    padding-top: 0;
  }
}

        /* Ambient background blobs */
        .as-shell::before {
          content: '';
          position: fixed; top: -100px; right: -200px;
          width: 700px; height: 700px; border-radius: 50%;
          background: radial-gradient(circle, rgba(167,139,250,0.07) 0%, transparent 65%);
          pointer-events: none; filter: blur(60px); z-index: 0;
        }
        .as-shell::after {
          content: '';
          position: fixed; bottom: -150px; left: -100px;
          width: 600px; height: 600px; border-radius: 50%;
          background: radial-gradient(circle, rgba(244,114,182,0.06) 0%, transparent 65%);
          pointer-events: none; filter: blur(60px); z-index: 0;
        }

        /* Noise grain */
        .as-grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 160px;
        }

        /* Grid lines */
        .as-grid {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image:
            linear-gradient(rgba(241,245,249,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(241,245,249,0.025) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 30%, black 0%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 30%, black 0%, transparent 100%);
        }

        /* ── MAIN LAYOUT ───────────────────────────── */
        .as-main {
          position: relative; z-index: 2;
          display: grid;
          grid-template-columns: 1fr 1fr;
          max-width: 1160px;
          margin: 0 auto;
          min-height: calc(100dvh - var(--header-h));
          gap: 0;
        }

        /* ── LEFT — BRANDING PANEL ─────────────────── */
        .as-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 56px 52px 56px 40px;
          position: relative;
          border-right: 1px solid var(--line);
        }

        /* Decorative accent line on left edge */
        .as-left::before {
          content: '';
          position: absolute; top: 15%; left: 0; bottom: 15%;
          width: 2px;
          background: linear-gradient(180deg, transparent, var(--violet), var(--pink), transparent);
          opacity: 0.4;
        }

        .as-back-btn {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: var(--font-head); font-size: 12px; font-weight: 600;
          color: var(--dim); background: none; border: none; cursor: pointer;
          padding: 0; margin-bottom: 48px;
          transition: color 0.15s; letter-spacing: 0.02em;
          width: fit-content;
        }
        .as-back-btn:hover { color: var(--muted); }

        /* Big display headline */
        .as-display {
          font-family: var(--font-display);
          font-size: clamp(56px, 6.5vw, 96px);
          line-height: 0.88;
          letter-spacing: 0.01em;
          color: var(--text);
          margin-bottom: 6px;
        }
        .as-display-grad {
          font-family: var(--font-display);
          font-size: clamp(52px, 6vw, 88px);
          line-height: 0.88;
          letter-spacing: 0.01em;
          background: linear-gradient(90deg, #f472b6 0%, #a78bfa 40%, #818cf8 70%, #f472b6 100%);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: as-grad 5s linear infinite;
          margin-bottom: 28px;
          display: block;
        }
        @keyframes as-grad { 0%{background-position:0%} 100%{background-position:300%} }

        .as-tagline {
          font-size: 14px; color: var(--muted); line-height: 1.7;
          max-width: 360px; margin-bottom: 40px; font-weight: 400;
        }

        /* Feature pills */
        .as-features {
          display: flex; flex-direction: column; gap: 12px;
          margin-bottom: 44px;
        }
        .as-feat-item {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--line);
          border-radius: 12px; padding: 12px 16px;
          transition: border-color 0.2s;
        }
        .as-feat-item:hover { border-color: rgba(167,139,250,0.2); }
        .as-feat-icon {
          width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .as-feat-icon.cyan  { background: rgba(34,211,238,0.1);  color: var(--cyan);  border: 1px solid rgba(34,211,238,0.15); }
        .as-feat-icon.pink  { background: rgba(244,114,182,0.1); color: var(--pink);  border: 1px solid rgba(244,114,182,0.15); }
        .as-feat-icon.violet{ background: rgba(167,139,250,0.1); color: var(--violet);border: 1px solid rgba(167,139,250,0.15); }
        .as-feat-text strong {
          font-family: var(--font-head); font-size: 13px; font-weight: 800;
          color: var(--text); display: block; letter-spacing: -0.01em; margin-bottom: 2px;
        }
        .as-feat-text span { font-size: 12px; color: var(--dim); }

        /* Stats row */
        .as-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
        }
        .as-stat {
          padding: 16px 14px; text-align: center;
          border-right: 1px solid var(--line);
        }
        .as-stat:last-child { border-right: none; }
        .as-stat-val {
          font-family: var(--font-display); font-size: 28px;
          color: var(--text); line-height: 1; display: block;
        }
        .as-stat-label {
          font-family: var(--font-head); font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.14em;
          color: var(--dim); margin-top: 4px; display: block;
        }

        /* ── RIGHT — FORM PANEL ────────────────────── */
        .as-right {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 56px 40px 56px 52px;
        }

        .as-form-wrap {
          max-width: 400px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* Mode badge */
        .as-mode-badge {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(244,114,182,0.08);
          border: 1px solid rgba(244,114,182,0.18);
          border-radius: 100px; padding: 5px 14px 5px 10px;
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          letter-spacing: 0.18em; text-transform: uppercase; color: var(--pink);
          margin-bottom: 20px; width: fit-content;
        }
        .as-mode-dot {
          width: 6px; height: 6px; border-radius: 50%; background: var(--pink);
          box-shadow: 0 0 8px var(--pink); animation: as-blink 1.4s ease-in-out infinite;
        }
        @keyframes as-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

        .as-form-title {
          font-family: var(--font-head);
          font-size: clamp(24px, 3vw, 36px);
          font-weight: 900; letter-spacing: -0.035em;
          line-height: 1.05; color: var(--text);
          margin-bottom: 6px;
        }
        .as-form-sub {
          font-size: 13.5px; color: var(--muted); line-height: 1.65;
          margin-bottom: 28px;
        }

        /* Tab switcher */
        .as-tabs {
          display: grid; grid-template-columns: 1fr 1fr;
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 12px; padding: 3px; margin-bottom: 24px;
        }
        .as-tab {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-family: var(--font-head); font-size: 13px; font-weight: 700;
          padding: 10px 16px; border-radius: 9px; border: none;
          background: none; color: var(--dim); cursor: pointer;
          transition: all 0.2s; letter-spacing: -0.01em;
        }
        .as-tab.active {
          background: linear-gradient(135deg, var(--violet), var(--pink));
          color: #fff;
          box-shadow: 0 4px 16px rgba(167,139,250,0.25);
        }
        .as-tab:not(.active):hover { color: var(--muted); }

        /* Google button */
        .as-google-wrap {
          display: flex; align-items: center; justify-content: center;
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 12px; padding: 6px 8px; min-height: 50px;
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
          margin-bottom: 20px;
        }
        .as-google-wrap:hover { border-color: rgba(241,245,249,0.18); background: var(--bg4); }
        .as-google-placeholder {
          font-family: var(--font-head); font-size: 14px; font-weight: 700;
          color: var(--muted); display: flex; align-items: center; gap: 9px;
        }

        /* Divider */
        .as-divider {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
        }
        .as-divider::before, .as-divider::after {
          content: ''; flex: 1; height: 1px; background: var(--line);
        }
        .as-divider span {
          font-family: var(--font-head); font-size: 11px; font-weight: 600;
          color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em;
          white-space: nowrap;
        }

        /* Form */
        .as-form { display: flex; flex-direction: column; gap: 12px; }

        .as-field { display: flex; flex-direction: column; gap: 5px; }
        .as-field-label {
          font-family: var(--font-head); font-size: 11px; font-weight: 700;
          color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em;
        }

        .as-input-wrap {
          display: flex; align-items: center; gap: 10px;
          height: 46px; padding: 0 14px;
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 11px; transition: border-color 0.15s, box-shadow 0.15s;
          overflow: hidden;
        }
        .as-input-wrap:focus-within {
          border-color: rgba(167,139,250,0.45);
          box-shadow: 0 0 0 3px rgba(167,139,250,0.08);
        }
        .as-input-icon { color: var(--dim); flex-shrink: 0; }
        .as-input-wrap input {
          flex: 1; background: none; border: none; outline: none;
          font-family: var(--font-body); font-size: 14px; color: var(--text);
          height: 100%; padding: 0; min-width: 0;
        }
        .as-input-wrap input::placeholder { color: rgba(241,245,249,0.5); }

        .as-status-ok  { color: #4ade80; flex-shrink: 0; }
        .as-status-err { color: #f87171; flex-shrink: 0; }

        .as-otp-hint {
          font-size: 11px; color: var(--dim); padding-left: 2px; margin-top: 2px;
        }
        .as-otp-hint.ok  { color: #4ade80; }
        .as-otp-hint.err { color: #f87171; }
        .as-otp-hint.chk { color: var(--muted); }

        /* OTP send row */
        .as-otp-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: rgba(167,139,250,0.04);
          border: 1px solid rgba(167,139,250,0.1);
          border-radius: 11px; padding: 10px 14px;
        }
        .as-otp-row-text { font-size: 12px; color: var(--muted); line-height: 1.45; }
        .as-otp-row-text strong { color: var(--violet); font-weight: 700; }

        .as-send-otp {
          display: inline-flex; align-items: center; gap: 5px;
          font-family: var(--font-head); font-size: 11px; font-weight: 800;
          letter-spacing: 0.04em; text-transform: uppercase;
          color: var(--violet); background: rgba(167,139,250,0.1);
          border: 1px solid rgba(167,139,250,0.4);
          border-radius: 100px; padding: 7px 13px;
          cursor: pointer; transition: background 0.15s; white-space: nowrap; flex-shrink: 0;
        }
        .as-send-otp:hover:not(:disabled) { background: rgba(167,139,250,0.4); }
        .as-send-otp:disabled { opacity: 0.4; cursor: not-allowed; }

        /* 2-col grid for register */
        .as-form-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }

        /* Submit */
        .as-submit {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 15px 24px; margin-top: 4px;
          background: linear-gradient(135deg, var(--cyan) 0%, var(--violet) 100%);
          color: #080b12; font-family: var(--font-head); font-size: 15px;
          font-weight: 900; letter-spacing: -0.02em;
          border: none; border-radius: 12px; cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          position: relative; overflow: hidden;
        }
        .as-submit::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, var(--violet) 0%, var(--pink) 100%);
          opacity: 0; transition: opacity 0.3s;
        }
        .as-submit:hover:not(:disabled)::before { opacity: 1; }
        .as-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 36px rgba(34,211,238,0.25); }
        .as-submit:active:not(:disabled) { transform: scale(0.98); }
        .as-submit:disabled { opacity: 0.45; cursor: not-allowed; }
        .as-submit > * { position: relative; z-index: 1; }

        /* Alerts */
        .as-alert {
          border-radius: 11px; padding: 11px 14px;
          font-size: 13px; line-height: 1.55; margin-top: 4px;
        }
        .as-alert-err { background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.18); color: #fca5a5; }
        .as-alert-ok  { background: rgba(34,211,238,0.07);  border: 1px solid rgba(34,211,238,0.18);  color: #67e8f9; }

        /* Switch link */
        .as-switch {
          text-align: center; font-size: 12.5px; color: var(--dim);
          margin-top: 16px; font-family: var(--font-body);
        }
        .as-switch button {
          background: none; border: none; cursor: pointer;
          color: var(--violet); font-weight: 700; font-size: 12.5px;
          font-family: var(--font-head); padding: 0; margin-left: 4px;
          transition: color 0.15s; letter-spacing: -0.01em;
        }
        .as-switch button:hover { color: var(--pink); }

        /* ── MOBILE ────────────────────────────────── */
        @media (max-width: 860px) {
          .as-main {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .as-left {
            display: none;
          }
          .as-right {
            padding: 24px 16px 40px;
            justify-content: flex-start;
          }
          .as-form-wrap { max-width: 100%; }
          .as-back-btn-mobile {
            display: inline-flex !important;
            margin-bottom: 24px;
          }
          .as-form-title { font-size: 26px; }
          .as-form-grid { grid-template-columns: 1fr; }
          .as-tab { padding: 11px 14px; }
        }

        .as-back-btn-mobile {
          display: none;
          align-items: center; gap: 7px;
          font-family: var(--font-head); font-size: 12px; font-weight: 600;
          color: var(--dim); background: none; border: none; cursor: pointer;
          padding: 0; transition: color 0.15s; width: fit-content;
        }
        .as-back-btn-mobile:hover { color: var(--muted); }
      `}</style>

      <div className="as-shell" ref={rootRef}>
        <div className="as-grain" />
        <div className="as-grid" />
        <Header isLoggedIn={isLoggedIn} onLogout={() => {}} />

        <main className="as-main">

          {/* ── LEFT BRANDING PANEL ── */}
          <div className="as-left">
            <button className="as-back-btn ar" onClick={() => navigate("/")}>
              <ArrowLeft size={14} /> Back to home
            </button>

            <h1 className="as-display ar">RE-IMAGINE</h1>
            <span className="as-display-grad ar">CAMPUS LIFE.</span>

            <p className="as-tagline ar">
              The high-frequency social layer of your university — built for real students, real moments, real connections.
            </p>

            <div className="as-features ar">
              {[
                { icon: <ShieldCheck size={16} />, cls: "cyan",   title: "Campus-verified only",   sub: "Access gated to official campus emails" },
                { icon: <Zap         size={16} />, cls: "pink",   title: "OTP in seconds",          sub: "Instant one-time password — no passwords to remember" },
                { icon: <Globe       size={16} />, cls: "violet", title: "Google sign-in supported", sub: "One tap and you're in with your campus account" },
              ].map((f) => (
                <div className="as-feat-item" key={f.title}>
                  <div className={`as-feat-icon ${f.cls}`}>{f.icon}</div>
                  <div className="as-feat-text">
                    <strong>{f.title}</strong>
                    <span>{f.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="as-stats ar">
              {[
                { val: "50k+", label: "Students" },
                { val: "45+",  label: "Campuses" },
                { val: "2.4k", label: "Online Now" },
              ].map((s) => (
                <div className="as-stat" key={s.label}>
                  <span className="as-stat-val">{s.val}</span>
                  <span className="as-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── RIGHT FORM PANEL ── */}
          <div className="as-right">
            <div className="as-form-wrap">

              {/* Mobile back */}
              <button className="as-back-btn-mobile ar" onClick={() => navigate("/")}>
                <ArrowLeft size={14} /> Back
              </button>

              {/* Mode badge */}
              <div className="as-mode-badge ar">
                <span className="as-mode-dot" />
                {mode === "register" ? "New Account" : "Sign In"}
              </div>

              <h2 className="as-form-title ar">
                {mode === "register" ? "Create your account" : "Welcome back"}
              </h2>
              <p className="as-form-sub ar">
                {mode === "register"
                  ? "Join your campus network. Takes under a minute."
                  : "Use OTP or Google to jump straight back in."}
              </p>

              {/* Tabs */}
              <div className="as-tabs ar">
                <button
                  className={`as-tab${mode === "register" ? " active" : ""}`}
                  onClick={() => switchMode("register")} type="button"
                >
                  <UserPlus size={14} /> Sign Up
                </button>
                <button
                  className={`as-tab${mode === "login" ? " active" : ""}`}
                  onClick={() => switchMode("login")} type="button"
                >
                  <Lock size={14} /> Login
                </button>
              </div>

              {/* Google */}
              <div className="as-google-wrap ar">
                <div ref={googleButtonRef} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
                  {!hasGoogleClientId && (
                    <span className="as-google-placeholder">
                      <svg width="18" height="18" viewBox="0 0 18 18">
                        <path d="M17.64 9.2a10.3 10.3 0 0 0-.16-1.84H9v3.48h4.84A4.14 4.14 0 0 1 12.07 13v2.26h2.88A8.78 8.78 0 0 0 17.64 9.2Z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.88-2.26a5.4 5.4 0 0 1-8.06-2.85H1.07v2.33A9 9 0 0 0 9 18Z" fill="#34A853"/>
                        <path d="M4.02 10.71A5.4 5.4 0 0 1 4.02 7.29V4.96H1.07a9 9 0 0 0 0 8.08l2.95-2.33Z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 1.07 4.96L4.02 7.3A5.4 5.4 0 0 1 9 3.58Z" fill="#EA4335"/>
                      </svg>
                      {mode === "register" ? "Continue with Google" : "Sign in with Google"}
                    </span>
                  )}
                </div>
              </div>

              <div className="as-divider ar"><span>or with email OTP</span></div>

              {/* REGISTER */}
              {mode === "register" ? (
                <form className="as-form ar" onSubmit={handleRegister}>
                  <div className="as-field">
                    <span className="as-field-label">Full name</span>
                    <div className="as-input-wrap">
                      <Users className="as-input-icon" size={15} />
                      <input placeholder="Your full name" value={registerForm.fullName}
                        onChange={(e) => setRegisterForm(c => ({ ...c, fullName: e.target.value }))} required />
                    </div>
                  </div>

                  <div className="as-field">
                    <span className="as-field-label">Campus email</span>
                    <div className="as-input-wrap">
                      <Mail className="as-input-icon" size={15} />
                      <input placeholder="name@gmail.com" type="email" value={registerForm.email}
                        onChange={(e) => setRegisterForm(c => ({ ...c, email: e.target.value }))} required />
                    </div>
                  </div>

                  <div className="as-otp-row">
                    <p className="as-otp-row-text">OTP sent to <strong>@gmail.com</strong> emails only.</p>
                    <button className="as-send-otp" type="button"
                      disabled={loading || !hasRegisterEmail}
                      onClick={() => void requestOtp(registerForm.email, "register")}>
                      {loading ? "Sending…" : "Send OTP"} <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="as-form-grid">
                    <div className="as-field">
                      <span className="as-field-label">Reg. No. (optional)</span>
                      <div className="as-input-wrap">
                        <NotebookPen className="as-input-icon" size={15} />
                        <input placeholder="8 digits" value={registerForm.registrationNo}
                          inputMode="numeric" pattern="[0-9]{8}" maxLength={8}
                          onChange={(e) => setRegisterForm(c => ({ ...c, registrationNo: e.target.value.replace(/\D/g, "").slice(0, 8) }))} />
                      </div>
                    </div>

                    <div className="as-field">
                      <span className="as-field-label">OTP</span>
                      <div className="as-input-wrap">
                        <ShieldCheck className="as-input-icon" size={15} />
                        <input placeholder="6-digit OTP" value={registerOtp}
                          inputMode="numeric" maxLength={6}
                          onChange={(e) => setRegisterOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} required />
                        {registerOtpStatus === "valid"   && <CheckCircle2 className="as-status-ok"  size={15} />}
                        {registerOtpStatus === "invalid" && <XCircle      className="as-status-err" size={15} />}
                      </div>
                      {registerOtpStatus === "checking" && <span className="as-otp-hint chk">Checking…</span>}
                      {registerOtpStatus === "valid"    && <span className="as-otp-hint ok">Verified ✓</span>}
                      {registerOtpStatus === "invalid"  && <span className="as-otp-hint err">Invalid or expired</span>}
                    </div>
                  </div>

                  <button className="as-submit" type="submit" disabled={loading}>
                    <span>{loading ? "Setting up…" : "Join CampusTV"}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>
              ) : (
                /* LOGIN */
                <form className="as-form ar" onSubmit={handleOtpLogin}>
                  <div className="as-field">
                    <span className="as-field-label">Campus email</span>
                    <div className="as-input-wrap">
                      <Mail className="as-input-icon" size={15} />
                      <input placeholder="name@gmail.com" type="email" value={otpLoginForm.email}
                        onChange={(e) => setOtpLoginForm(c => ({ ...c, email: e.target.value }))} required />
                    </div>
                  </div>

                  <div className="as-otp-row">
                    <p className="as-otp-row-text">Use your <strong>@gmail.com</strong> to receive OTP.</p>
                    <button className="as-send-otp" type="button"
                      disabled={loading || !hasOtpLoginEmail}
                      onClick={() => void requestOtp(otpLoginForm.email, "login")}>
                      {loading ? "Sending…" : "Send OTP"} <ArrowRight size={12} />
                    </button>
                  </div>

                  <div className="as-field">
                    <span className="as-field-label">OTP</span>
                    <div className="as-input-wrap">
                      <ShieldCheck className="as-input-icon" size={15} />
                      <input placeholder="6-digit OTP" value={otpLoginForm.otp}
                        inputMode="numeric" maxLength={6}
                        onChange={(e) => setOtpLoginForm(c => ({ ...c, otp: e.target.value.replace(/\D/g, "").slice(0, 6) }))} required />
                      {otpLoginStatus === "valid"   && <CheckCircle2 className="as-status-ok"  size={15} />}
                      {otpLoginStatus === "invalid" && <XCircle      className="as-status-err" size={15} />}
                    </div>
                    {otpLoginStatus === "checking" && <span className="as-otp-hint chk">Checking…</span>}
                    {otpLoginStatus === "valid"    && <span className="as-otp-hint ok">Verified — ready to login ✓</span>}
                    {otpLoginStatus === "invalid"  && <span className="as-otp-hint err">Invalid or expired</span>}
                  </div>

                  <button className="as-submit" type="submit" disabled={loading}>
                    <span>{loading ? "Verifying…" : "Login with OTP"}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>
              )}

              {error && <div className="as-alert as-alert-err ar">{error}</div>}
              {info  && <div className="as-alert as-alert-ok  ar">{info}</div>}

              <p className="as-switch ar">
                {mode === "register" ? "Already have an account?" : "Don't have an account?"}
                <button onClick={() => switchMode(mode === "register" ? "login" : "register")}>
                  {mode === "register" ? "Login" : "Sign Up"}
                </button>
              </p>

            </div>
          </div>

        </main>
      </div>
    </>
  );
}