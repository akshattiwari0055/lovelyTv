import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  XCircle
} from "lucide-react";
import { api } from "../lib/api";
import { User } from "../types";
import { Header } from "./Header";
import { Footer } from "./Footer";

type AuthScreenProps = {
  onAuthenticated: (payload: { token: string; user: User }) => void;
  isLoggedIn: boolean;
};

const initialRegisterForm = {
  fullName: "",
  email: "",
  password: "",
  registrationNo: "",
  bio: "",
  interests: ""
};

function getRequestErrorMessage(err: any, fallback: string) {
  const responseMessage = err?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }

  if (err?.code === "ECONNABORTED") {
    return "Request timed out. Please try again.";
  }

  if (err?.request) {
    return "Could not reach the backend. Check Railway backend CORS, public URL, and SMTP variables.";
  }

  return fallback;
}

export function AuthScreen({ onAuthenticated, isLoggedIn }: AuthScreenProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const modeParam = searchParams.get("mode") as "login" | "register" | null;
  const [mode, setMode] = useState<"login" | "register">(modeParam || "register");
  const [registerForm, setRegisterForm] = useState(initialRegisterForm);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [otpLoginForm, setOtpLoginForm] = useState({ email: "", otp: "" });
  const [registerOtp, setRegisterOtp] = useState("");
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
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

  useEffect(() => {
    if (modeParam) {
      setMode(modeParam);
    }
  }, [modeParam]);

  useEffect(() => {
    if (!registerOtp.trim()) {
      setRegisterOtpStatus("idle");
      return;
    }

    if (!hasRegisterEmail || registerOtp.trim().length !== 6) {
      setRegisterOtpStatus("idle");
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setRegisterOtpStatus("checking");
        const response = await api.post("/auth/check-otp", {
          email: registerForm.email,
          purpose: "register",
          otp: registerOtp
        });
        setRegisterOtpStatus(response.data.valid ? "valid" : "invalid");
      } catch {
        setRegisterOtpStatus("invalid");
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [registerForm.email, registerOtp, hasRegisterEmail]);

  useEffect(() => {
    if (!otpLoginForm.otp.trim()) {
      setOtpLoginStatus("idle");
      return;
    }

    if (!hasOtpLoginEmail || otpLoginForm.otp.trim().length !== 6) {
      setOtpLoginStatus("idle");
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setOtpLoginStatus("checking");
        const response = await api.post("/auth/check-otp", {
          email: otpLoginForm.email,
          purpose: "login",
          otp: otpLoginForm.otp
        });
        setOtpLoginStatus(response.data.valid ? "valid" : "invalid");
      } catch {
        setOtpLoginStatus("invalid");
      }
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [otpLoginForm.email, otpLoginForm.otp, hasOtpLoginEmail]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".auth-reveal", {
        y: 24,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out"
      });
    }, authLayoutRef);

    return () => ctx.revert();
  }, [mode, loginMethod]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let mounted = true;

    const renderGoogleButton = () => {
      if (!mounted || !window.google || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => void handleGoogleAuth(credential)
      });

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        width: "360",
        text: mode === "register" ? "signup_with" : "signin_with",
        shape: "pill"
      });
    };

    if (window.google) {
      renderGoogleButton();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = renderGoogleButton;
      document.body.appendChild(script);
    }

    return () => {
      mounted = false;
    };
  }, [mode, registerForm.registrationNo, registerForm.bio, registerForm.interests]);

  const authHighlights = useMemo(
    () => [
      "Verified access using official LPU identity",
      "Quick profile setup with OTP or Google",
      "Cleaner sign-in flow for faster onboarding"
    ],
    []
  );

  async function handleGoogleAuth(credential: string) {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await api.post("/auth/google", {
        credential,
        registrationNo: registerForm.registrationNo,
        bio: registerForm.bio,
        interests: registerForm.interests
      });
      onAuthenticated(response.data);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, "Google sign-in failed"));
    } finally {
      setLoading(false);
    }
  }

  async function requestOtp(email: string, purpose: "register" | "login") {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await api.post("/auth/request-otp", { email, purpose });
      setInfo(response.data.message ?? "OTP sent.");
    } catch (err: any) {
      setError(getRequestErrorMessage(err, "Could not send OTP."));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await api.post("/auth/register", { ...registerForm, otp: registerOtp });
      onAuthenticated(response.data);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, "Could not create account"));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", loginForm);
      onAuthenticated(response.data);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, "Could not log in"));
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login-otp", otpLoginForm);
      onAuthenticated(response.data);
      navigate("/app", { replace: true });
    } catch (err: any) {
      setError(getRequestErrorMessage(err, "Could not log in with OTP"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-shell">
      <Header isLoggedIn={isLoggedIn} />

      <main className="auth-main">
        <div className="auth-layout" ref={authLayoutRef}>
          <section className="auth-aside auth-reveal">
            <button className="back-link" onClick={() => navigate("/")}>
              <ArrowLeft size={18} />
              Back to Home
            </button>

            <div className="auth-aside-copy">
              <p className="eyebrow">WELCOME TO LPU TV</p>
              <h1>{mode === "register" ? "Create your campus profile in minutes." : "Login and jump back into the community."}</h1>
              <p>
                {mode === "register"
                  ? "Use your official LPU identity to unlock verified conversations, better matches, and a cleaner first impression."
                  : "Pick password or OTP login and get straight into your verified student network without friction."}
              </p>
            </div>

            <div className="auth-highlight-list">
              {authHighlights.map((item) => (
                <div className="auth-highlight-item" key={item}>
                  <Sparkles size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="auth-aside-card">
              <div className="auth-aside-metric">
                <strong>LPU-only</strong>
                <span>Students join with verified campus identity.</span>
              </div>
              <div className="auth-aside-metric">
                <strong>One profile</strong>
                <span>Use email, password, OTP, or Google for flexible access.</span>
              </div>
            </div>
          </section>

          <section className="auth-card-standalone auth-reveal">
            <div className="auth-header">
              <p className="eyebrow">{mode === "register" ? "NEW ACCOUNT" : "SIGN IN"}</p>
              <h2>{mode === "register" ? "Create account" : "Login to continue"}</h2>
              <p className="auth-lead">
                {mode === "register"
                  ? "Add your details once and start meeting other LPU students."
                  : "Choose your preferred login method and continue where you left off."}
              </p>
            </div>

            <div className="auth-switch auth-reveal">
              <button
                className={mode === "register" ? "active" : ""}
                onClick={() => {
                  setMode("register");
                  navigate("/auth?mode=register", { replace: true });
                }}
                type="button"
              >
                <UserPlus size={18} />
                Sign Up
              </button>
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  navigate("/auth?mode=login", { replace: true });
                }}
                type="button"
              >
                <Lock size={18} />
                Login
              </button>
            </div>

            {mode === "register" ? (
              <form className="auth-form" onSubmit={handleRegister}>
                <label className="form-field auth-reveal">
                  <span>Full name</span>
                  <div className="input-group">
                    <Users className="input-icon" size={18} />
                    <input
                      placeholder="Your full name"
                      value={registerForm.fullName}
                      onChange={(e) => setRegisterForm((current) => ({ ...current, fullName: e.target.value }))}
                      required
                    />
                  </div>
                </label>

                <label className="form-field auth-reveal">
                  <span>Official LPU email</span>
                  <div className="input-group">
                    <Mail className="input-icon" size={18} />
                    <input
                      placeholder="name@lpu.in"
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm((current) => ({ ...current, email: e.target.value }))}
                      required
                    />
                  </div>
                </label>

                <div className="otp-action-row auth-reveal">
                  <p className="field-hint">
                    OTP is sent only to your official <strong>@lpu.in</strong> email.
                  </p>
                  <button
                    className="secondary-button otp-btn otp-inline-btn"
                    type="button"
                    disabled={loading || !hasRegisterEmail}
                    onClick={() => void requestOtp(registerForm.email, "register")}
                  >
                    {loading ? "Sending..." : "Send OTP"}
                    <ArrowRight size={16} />
                  </button>
                </div>

                <div className="auth-grid auth-reveal">
                  <label className="form-field">
                    <span>OTP</span>
                    <div className="input-group">
                      <ShieldCheck className="input-icon" size={18} />
                      <input
                        placeholder="6-digit OTP"
                        value={registerOtp}
                        onChange={(e) => setRegisterOtp(e.target.value)}
                        required
                      />
                      {registerOtpStatus === "valid" ? <CheckCircle2 className="input-status success" size={18} /> : null}
                      {registerOtpStatus === "invalid" ? <XCircle className="input-status error" size={18} /> : null}
                    </div>
                    <span className="otp-status-text">
                      {registerOtpStatus === "checking" ? "Checking OTP..." : null}
                      {registerOtpStatus === "valid" ? "OTP verified and locked for signup." : null}
                      {registerOtpStatus === "invalid" ? "OTP is invalid or expired." : null}
                    </span>
                  </label>

                  <label className="form-field">
                    <span>Password</span>
                    <div className="input-group">
                      <Lock className="input-icon" size={18} />
                      <input
                        placeholder="Create password"
                        type="password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm((current) => ({ ...current, password: e.target.value }))}
                        required
                      />
                    </div>
                  </label>
                </div>

                <div className="auth-grid auth-reveal">
                  <label className="form-field">
                    <span>Registration number</span>
                    <div className="input-group">
                      <KeyRound className="input-icon" size={18} />
                      <input
                        placeholder="Registration number"
                        value={registerForm.registrationNo}
                        onChange={(e) => setRegisterForm((current) => ({ ...current, registrationNo: e.target.value }))}
                        required
                      />
                    </div>
                  </label>

                  <label className="form-field">
                    <span>Interests</span>
                    <div className="input-group">
                      <Sparkles className="input-icon" size={18} />
                      <input
                        placeholder="Coding, music, sports"
                        value={registerForm.interests}
                        onChange={(e) => setRegisterForm((current) => ({ ...current, interests: e.target.value }))}
                      />
                    </div>
                  </label>
                </div>

                <label className="form-field auth-reveal">
                  <span>Short bio</span>
                  <textarea
                    placeholder="Tell other students a little about yourself"
                    value={registerForm.bio}
                    onChange={(e) => setRegisterForm((current) => ({ ...current, bio: e.target.value }))}
                  />
                </label>

                <div className="submit-row auth-reveal">
                  <button className="primary-button submit-btn" type="submit" disabled={loading}>
                    {loading ? "Setting up..." : "Join LPU TV"}
                  </button>
                </div>

                <div className="auth-divider auth-reveal"><span>or continue with</span></div>
                <div className="google-wrap auth-reveal">
                  <div ref={googleButtonRef} />
                  {hasGoogleClientId ? (
                    <p className="field-hint google-hint">
                      Continue with your verified Google account to speed up signup.
                    </p>
                  ) : (
                    <p className="field-hint google-hint">
                      Add <strong>VITE_GOOGLE_CLIENT_ID</strong> in the client env file to enable Google sign-in.
                    </p>
                  )}
                </div>
              </form>
            ) : (
              <div className="login-container">
                <div className="method-switch auth-reveal">
                  <button
                    className={loginMethod === "password" ? "active" : ""}
                    onClick={() => setLoginMethod("password")}
                    type="button"
                  >
                    Password
                  </button>
                  <button
                    className={loginMethod === "otp" ? "active" : ""}
                    onClick={() => setLoginMethod("otp")}
                    type="button"
                  >
                    Email OTP
                  </button>
                </div>

                {loginMethod === "password" ? (
                  <form className="auth-form" onSubmit={handleLogin}>
                    <label className="form-field auth-reveal">
                      <span>Email</span>
                      <div className="input-group">
                        <Mail className="input-icon" size={18} />
                        <input
                          placeholder="name@lpu.in"
                          type="email"
                          value={loginForm.email}
                          onChange={(e) => setLoginForm((current) => ({ ...current, email: e.target.value }))}
                          required
                        />
                      </div>
                    </label>

                    <label className="form-field auth-reveal">
                      <span>Password</span>
                      <div className="input-group">
                        <Lock className="input-icon" size={18} />
                        <input
                          placeholder="Your password"
                          type="password"
                          value={loginForm.password}
                          onChange={(e) => setLoginForm((current) => ({ ...current, password: e.target.value }))}
                          required
                        />
                      </div>
                    </label>

                    <button className="primary-button submit-btn auth-reveal" type="submit" disabled={loading}>
                      {loading ? "Authenticating..." : "Enter campus"}
                    </button>
                  </form>
                ) : (
                  <form className="auth-form" onSubmit={handleOtpLogin}>
                    <label className="form-field auth-reveal">
                      <span>Email</span>
                      <div className="input-group">
                        <Mail className="input-icon" size={18} />
                        <input
                          placeholder="name@lpu.in"
                          type="email"
                          value={otpLoginForm.email}
                          onChange={(e) => setOtpLoginForm((current) => ({ ...current, email: e.target.value }))}
                          required
                    />
                  </div>
                </label>

                    <div className="otp-action-row auth-reveal">
                      <p className="field-hint">
                        Use your verified <strong>@lpu.in</strong> email to receive the login OTP.
                      </p>
                      <button
                        className="secondary-button otp-btn otp-inline-btn"
                        type="button"
                        disabled={loading || !hasOtpLoginEmail}
                        onClick={() => void requestOtp(otpLoginForm.email, "login")}
                      >
                        {loading ? "Sending..." : "Send OTP"}
                        <ArrowRight size={16} />
                      </button>
                    </div>

                    <label className="form-field auth-reveal">
                      <span>OTP</span>
                    <div className="input-group">
                      <ShieldCheck className="input-icon" size={18} />
                      <input
                        placeholder="6-digit OTP"
                        value={otpLoginForm.otp}
                        onChange={(e) => setOtpLoginForm((current) => ({ ...current, otp: e.target.value }))}
                        required
                      />
                      {otpLoginStatus === "valid" ? <CheckCircle2 className="input-status success" size={18} /> : null}
                      {otpLoginStatus === "invalid" ? <XCircle className="input-status error" size={18} /> : null}
                    </div>
                    <span className="otp-status-text">
                      {otpLoginStatus === "checking" ? "Checking OTP..." : null}
                      {otpLoginStatus === "valid" ? "OTP verified. Ready to login." : null}
                      {otpLoginStatus === "invalid" ? "OTP is invalid or expired." : null}
                    </span>
                  </label>

                    <div className="submit-row auth-reveal">
                      <button className="primary-button submit-btn" type="submit" disabled={loading}>
                        {loading ? "Verifying..." : "Login with OTP"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="auth-divider auth-reveal"><span>or continue with</span></div>
                <div className="google-wrap auth-reveal">
                  <div ref={googleButtonRef} />
                  {hasGoogleClientId ? (
                    <p className="field-hint google-hint">
                      Continue with your verified Google account for faster login.
                    </p>
                  ) : (
                    <p className="field-hint google-hint">
                      Add <strong>VITE_GOOGLE_CLIENT_ID</strong> in the client env file to enable Google sign-in.
                    </p>
                  )}
                </div>
              </div>
            )}

            {error && <div className="error-box auth-reveal"><p className="error-text">{error}</p></div>}
            {info && <div className="info-box auth-reveal"><p className="success-text">{info}</p></div>}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
