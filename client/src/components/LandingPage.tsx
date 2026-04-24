import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { PublicStats } from "../types";
import { Header } from "./Header";
import { Footer } from "./Footer";

gsap.registerPlugin(ScrollTrigger);

type LandingPageProps = {
  isLoggedIn: boolean;
  onLogout: () => void;
};

const initialStats: PublicStats = {
  onlineNow: 0,
  registeredStudents: 0,
  verifiedStudents: 0,
};

export function LandingPage({ isLoggedIn, onLogout }: LandingPageProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PublicStats>(initialStats);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const res = await api.get<PublicStats>("/public/stats");
        if (active) setStats(res.data);
      } catch {
        if (active) setStats(initialStats);
      }
    };
    void fetchStats();
    const id = window.setInterval(fetchStats, 15000);
    return () => { active = false; window.clearInterval(id); };
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".lp-reveal", {
        y: 28, opacity: 0, duration: 0.8,
        stagger: 0.09, ease: "expo.out", delay: 0.1,
      });
      gsap.to(".lp-grain", {
        backgroundPosition: "100% 100%",
        duration: 0.08, repeat: -1, yoyo: true, ease: "none",
      });
      gsap.to(".lp-float-a", {
        y: -10, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut",
      });
      gsap.to(".lp-float-b", {
        y: 8, duration: 3.5, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.8,
      });
      gsap.utils.toArray<HTMLElement>(".lp-feat-card").forEach((card, i) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 88%", once: true },
          y: 28, opacity: 0, duration: 0.65, delay: i * 0.07, ease: "power3.out",
        });
      });
      gsap.from(".lp-about-panel", {
        scrollTrigger: { trigger: ".lp-about-panel", start: "top 85%", once: true },
        y: 36, opacity: 0, duration: 0.85, ease: "expo.out",
      });
      gsap.from(".lp-cta-card", {
        scrollTrigger: { trigger: ".lp-cta-card", start: "top 85%", once: true },
        scale: 0.97, opacity: 0, duration: 0.75, ease: "expo.out",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleCta = () => navigate(isLoggedIn ? "/app" : "/auth?mode=register");

  const statItems = useMemo(() => [
    { value: stats.verifiedStudents.toLocaleString(), label: "Verified" },
    { value: stats.registeredStudents.toLocaleString(), label: "Profiles" },
    { value: stats.onlineNow.toLocaleString(), label: "Online now" },
  ], [stats]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;1,400&display=swap');

        :root {
          --c-bg:    #08080c;
          --c-bg2:   #0e0e15;
          --c-bg3:   #13131c;
          --c-acc:   #d4f244;
          --c-acc2:  #ff6b35;
          --c-text:  #efefef;
          --c-muted: rgba(239,239,239,0.42);
          --c-line:  rgba(239,239,239,0.07);
          --font-display: 'Cabinet Grotesk', sans-serif;
          --font-body:    'Instrument Sans', sans-serif;
          --r-lg: 14px;
          --r-xl: 22px;
          --r-2xl: 32px;
          /* match your actual Header height here */
          --header-h: 64px;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-shell {
          background: var(--c-bg);
          color: var(--c-text);
          font-family: var(--font-body);
          overflow-x: hidden;
          min-height: 100dvh;
          position: relative;
          font-size: 16px;
          -webkit-font-smoothing: antialiased;
        }

        .lp-grain {
          position: fixed; inset: 0;
          pointer-events: none; z-index: 100;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 180px;
        }

        /* ── Hero ── */
        .lp-hero {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          position: relative;
          overflow: hidden;
        }

        @media (max-width: 860px) {
          .lp-hero {
            grid-template-columns: 1fr;
            /* don't force full screen height on mobile — let content dictate */
            min-height: unset;
          }
          .lp-hero-visual { display: none; }
        }

        /* DESKTOP: vertically center with room for fixed header */
        .lp-hero-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 110px 52px 64px 6vw;
          position: relative;
          z-index: 2;
        }

        /* MOBILE: stick directly under the header — no wasted space */
        @media (max-width: 860px) {
          .lp-hero-left {
            justify-content: flex-start;
            /* top = header height + small breathing room (16px) */
            padding: calc(var(--header-h) + 16px) 22px 52px;
          }
        }

        .lp-hero-left::before {
          content: '';
          position: absolute;
          bottom: -140px; left: -140px;
          width: 520px; height: 520px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(212,242,68,0.065) 0%, transparent 70%);
          pointer-events: none;
        }

        /* live pill */
        .lp-live-pill {
          display: inline-flex; align-items: center; gap: 7px;
          background: rgba(212,242,68,0.08);
          border: 1px solid rgba(212,242,68,0.2);
          border-radius: 100px;
          padding: 5px 14px 5px 10px;
          font-size: 12px; font-weight: 500; color: var(--c-acc);
          margin-bottom: 20px; width: fit-content; letter-spacing: 0.15px;
        }
        .lp-live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--c-acc); box-shadow: 0 0 8px var(--c-acc);
          animation: lp-blink 1.4s ease-in-out infinite;
        }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        /* h1 */
        .lp-h1 {
          font-family: var(--font-display);
          font-size: clamp(34px, 4.6vw, 60px);
          font-weight: 900; line-height: 1.03;
          letter-spacing: -0.035em; color: var(--c-text);
          margin: 0 0 18px;
        }
        @media (max-width: 860px) {
          .lp-h1 { font-size: clamp(30px, 9vw, 46px); margin-bottom: 14px; }
        }

        .lp-h1 .lp-acc-word {
          color: var(--c-acc); position: relative; display: inline-block;
        }
        .lp-h1 .lp-acc-word::after {
          content: ''; position: absolute;
          bottom: 3px; left: 0; right: 0;
          height: 2px; background: var(--c-acc); border-radius: 2px; opacity: 0.45;
        }

        .lp-subtitle {
          font-size: 15px; color: var(--c-muted);
          line-height: 1.7; max-width: 390px;
          margin: 0 0 26px; font-weight: 400;
        }
        @media (max-width: 860px) {
          .lp-subtitle { font-size: 14px; margin-bottom: 20px; }
        }

        .lp-btn-row {
          display: flex; align-items: center; gap: 10px;
          flex-wrap: wrap; margin-bottom: 24px;
        }

        .lp-btn-primary {
          display: inline-flex; align-items: center; gap: 7px;
          background: var(--c-acc); color: #08080c;
          font-family: var(--font-display); font-size: 14px; font-weight: 800;
          padding: 12px 22px; border-radius: 100px; border: none; cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: -0.01em; text-decoration: none;
        }
        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(212,242,68,0.28); }
        .lp-btn-primary:active { transform: scale(0.97); }

        .lp-btn-secondary {
          display: inline-flex; align-items: center; gap: 6px;
          background: transparent; color: var(--c-text);
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          padding: 11px 20px; border-radius: 100px;
          border: 1px solid rgba(239,239,239,0.12); cursor: pointer;
          transition: border-color 0.15s, background 0.15s; text-decoration: none;
        }
        .lp-btn-secondary:hover { border-color: rgba(239,239,239,0.22); background: rgba(239,239,239,0.04); }

        .lp-trust-row { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 26px; }
        .lp-trust-tag {
          font-size: 10px; font-weight: 500;
          color: rgba(239,239,239,0.38);
          background: rgba(239,239,239,0.04);
          border: 1px solid rgba(239,239,239,0.07);
          border-radius: 6px; padding: 4px 10px;
          letter-spacing: 0.4px; text-transform: uppercase;
        }

        .lp-stat-row { display: flex; gap: 20px; flex-wrap: wrap; }
        .lp-stat-item { display: flex; flex-direction: column; gap: 3px; }
        .lp-stat-val {
          font-family: var(--font-display);
          font-size: 20px; font-weight: 900; color: var(--c-text);
          line-height: 1; letter-spacing: -0.03em;
        }
        .lp-stat-label { font-size: 10px; color: var(--c-muted); text-transform: uppercase; letter-spacing: 0.6px; }
        .lp-stat-divider { width: 1px; background: var(--c-line); align-self: stretch; }

        /* right visual */
        .lp-hero-visual {
          position: relative; overflow: hidden; background: var(--c-bg2);
        }
        .lp-hero-visual::before {
          content: ''; position: absolute; top: -100px; right: -100px;
          width: 580px; height: 580px; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,107,53,0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-hero-img {
          width: 100%; height: 100%; object-fit: cover;
          object-position: center top; opacity: 0.55; mix-blend-mode: luminosity;
        }
        .lp-hero-img-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to right, var(--c-bg) 0%, transparent 28%),
                      linear-gradient(to top, var(--c-bg) 0%, transparent 22%);
        }

        .lp-float-card {
          position: absolute; background: rgba(14,14,21,0.9);
          backdrop-filter: blur(16px); border: 1px solid rgba(239,239,239,0.09);
          border-radius: var(--r-lg); padding: 11px 15px;
          display: flex; align-items: center; gap: 10px; z-index: 3;
        }
        .lp-float-card-icon {
          width: 32px; height: 32px; border-radius: 9px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .lp-float-card strong { font-size: 12.5px; font-weight: 600; color: var(--c-text); display: block; line-height: 1.3; }
        .lp-float-card span  { font-size: 11px; color: var(--c-muted); display: flex; align-items: center; gap: 4px; }
        .lp-float-a { top: 22%; left: -24px; }
        .lp-float-b { bottom: 28%; right: 24px; }

        .lp-vert-label {
          position: absolute; right: 18px; top: 50%;
          transform: translateY(-50%) rotate(90deg);
          font-family: var(--font-display); font-size: 9.5px; font-weight: 700;
          letter-spacing: 3px; text-transform: uppercase;
          color: rgba(239,239,239,0.12); white-space: nowrap; z-index: 2;
        }

        /* scroll hint — desktop only */
        .lp-scroll-hint {
          position: absolute; bottom: 26px; left: 6vw;
          display: flex; align-items: center; gap: 8px;
          font-size: 11px; color: rgba(239,239,239,0.18);
          letter-spacing: 0.5px; z-index: 2;
        }
        @media (max-width: 860px) { .lp-scroll-hint { display: none; } }
        .lp-scroll-arrow { display: flex; flex-direction: column; gap: 2px; }
        .lp-scroll-arrow span {
          width: 1px; height: 13px; background: rgba(239,239,239,0.15);
          animation: lp-scroll-drop 1.5s ease infinite;
        }
        .lp-scroll-arrow span:nth-child(2) { animation-delay: 0.2s; opacity: 0.6; }
        @keyframes lp-scroll-drop { 0%{transform:scaleY(0);transform-origin:top} 50%{transform:scaleY(1)} 100%{transform:scaleY(0);transform-origin:bottom} }

        /* ── Shared sections ── */
        .lp-section-wrap { max-width: 1140px; margin: 0 auto; padding: 0 6vw; }

        .lp-eyebrow {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 2.5px; text-transform: uppercase; color: var(--c-acc);
          margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
        }
        .lp-eyebrow::before { content: ''; width: 18px; height: 1px; background: var(--c-acc); opacity: 0.55; flex-shrink: 0; }

        .lp-section-h2 {
          font-family: var(--font-display); font-size: clamp(24px, 3.2vw, 42px);
          font-weight: 900; letter-spacing: -0.03em; line-height: 1.08;
          color: var(--c-text); margin-bottom: 12px;
        }
        .lp-section-p { font-size: 15px; color: var(--c-muted); line-height: 1.7; max-width: 500px; font-weight: 400; }

        /* Features */
        .lp-features { padding: 80px 0; background: var(--c-bg); border-top: 1px solid var(--c-line); }
        .lp-features-head {
          display: flex; align-items: flex-end; justify-content: space-between;
          gap: 32px; margin-bottom: 48px; flex-wrap: wrap;
        }
        .lp-features-head .lp-section-p { max-width: 320px; }
        .lp-feat-grid {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 1px; background: var(--c-line); border: 1px solid var(--c-line);
          border-radius: var(--r-xl); overflow: hidden;
        }
        @media (max-width: 900px) { .lp-feat-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 540px) { .lp-feat-grid { grid-template-columns: 1fr; } }

        .lp-feat-card {
          background: var(--c-bg2); padding: 28px 24px;
          display: flex; flex-direction: column; gap: 10px;
          transition: background 0.2s; position: relative; overflow: hidden;
        }
        .lp-feat-card:hover { background: var(--c-bg3); }
        .lp-feat-card::after {
          content: ''; position: absolute; bottom: 0; left: 0; right: 0;
          height: 2px; background: var(--c-acc); transform: scaleX(0);
          transform-origin: left; transition: transform 0.3s ease;
        }
        .lp-feat-card:hover::after { transform: scaleX(1); }

        .lp-feat-icon {
          width: 42px; height: 42px; border-radius: 11px;
          background: rgba(212,242,68,0.07); border: 1px solid rgba(212,242,68,0.11);
          display: flex; align-items: center; justify-content: center; color: var(--c-acc);
        }
        .lp-feat-card h3 {
          font-family: var(--font-display); font-size: 14.5px; font-weight: 800;
          color: var(--c-text); letter-spacing: -0.02em; line-height: 1.3;
        }
        .lp-feat-card p { font-size: 13px; color: var(--c-muted); line-height: 1.65; font-weight: 400; }

        /* About */
        .lp-about { padding: 80px 0; background: var(--c-bg2); border-top: 1px solid var(--c-line); }
        .lp-about-panel {
          background: var(--c-bg3); border: 1px solid rgba(239,239,239,0.055);
          border-radius: var(--r-2xl); padding: 48px 48px 42px;
          display: flex; flex-direction: column; gap: 36px;
          position: relative; overflow: hidden;
        }
        .lp-about-panel::before {
          content: ''; position: absolute; top: -80px; right: -80px;
          width: 340px; height: 340px; border-radius: 50%;
          background: radial-gradient(circle, rgba(212,242,68,0.045) 0%, transparent 70%);
          pointer-events: none;
        }
        @media (max-width: 640px) { .lp-about-panel { padding: 28px 20px; } }
        .lp-about-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        @media (max-width: 700px) { .lp-about-grid { grid-template-columns: 1fr; } }
        .lp-about-card {
          display: flex; flex-direction: column; gap: 10px; padding: 18px;
          background: rgba(239,239,239,0.025); border: 1px solid var(--c-line);
          border-radius: var(--r-lg);
        }
        .lp-about-card-icon {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(255,107,53,0.1); border: 1px solid rgba(255,107,53,0.14);
          display: flex; align-items: center; justify-content: center; color: var(--c-acc2);
        }
        .lp-about-card strong {
          font-family: var(--font-display); font-size: 14px; font-weight: 800;
          color: var(--c-text); letter-spacing: -0.015em;
        }
        .lp-about-card p { font-size: 13px; color: var(--c-muted); line-height: 1.65; font-weight: 400; }

        /* CTA */
        .lp-cta { padding: 80px 0 72px; background: var(--c-bg); border-top: 1px solid var(--c-line); }
        .lp-cta-card {
          background: var(--c-acc); border-radius: var(--r-2xl);
          padding: 64px 60px; display: grid;
          grid-template-columns: 1fr auto; gap: 48px;
          align-items: center; position: relative; overflow: hidden;
        }
        @media (max-width: 760px) {
          .lp-cta-card { grid-template-columns: 1fr; padding: 40px 28px; gap: 28px; }
        }
        .lp-cta-card::before {
          content: ''; position: absolute; top: -120px; right: -80px;
          width: 420px; height: 420px; border-radius: 50%;
          background: rgba(255,255,255,0.1); pointer-events: none;
        }
        .lp-cta-card::after {
          content: ''; position: absolute; bottom: -100px; left: 38%;
          width: 300px; height: 300px; border-radius: 50%;
          background: rgba(0,0,0,0.055); pointer-events: none;
        }
        .lp-cta-left { display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 1; }
        .lp-cta-eyebrow {
          font-family: var(--font-display); font-size: 10px; font-weight: 700;
          letter-spacing: 2.5px; text-transform: uppercase; color: rgba(8,8,12,0.5);
          display: flex; align-items: center; gap: 8px;
        }
        .lp-cta-eyebrow::before { content: ''; width: 18px; height: 1px; background: rgba(8,8,12,0.3); }
        .lp-cta-h2 {
          font-family: var(--font-display); font-size: clamp(24px, 3vw, 42px);
          font-weight: 900; letter-spacing: -0.035em; line-height: 1.07;
          color: #08080c; max-width: 480px;
        }
        .lp-cta-p {
          font-size: 15px; color: rgba(8,8,12,0.55); line-height: 1.68;
          max-width: 380px; font-weight: 400;
        }
        .lp-cta-right { position: relative; z-index: 1; flex-shrink: 0; }
        .lp-cta-btn {
          display: inline-flex; align-items: center; gap: 8px;
          background: #08080c; color: var(--c-acc);
          font-family: var(--font-display); font-size: 14px; font-weight: 800;
          padding: 14px 26px; border-radius: 100px; border: none; cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: -0.01em; white-space: nowrap;
        }
        .lp-cta-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(8,8,12,0.28); }
        .lp-cta-btn:active { transform: scale(0.97); }
      `}</style>

      <div className="lp-shell" ref={rootRef}>
        <div className="lp-grain" />
        <Header isLoggedIn={isLoggedIn} onLogout={onLogout} />

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-left">
            <div className="lp-live-pill lp-reveal">
              <span className="lp-live-dot" />
              {stats.onlineNow > 0 ? `${stats.onlineNow.toLocaleString()} students online` : "LPU campus network"}
            </div>

            <h1 className="lp-h1 lp-reveal">
              Meet your next<br /><span className="lp-acc-word">campus</span><br />connection.
            </h1>

            <p className="lp-subtitle lp-reveal">
              Verified random video chat — exclusively for LPU students. Sign in with your university email and start a real conversation in seconds.
            </p>

            <div className="lp-btn-row lp-reveal">
              <button className="lp-btn-primary" onClick={handleCta}>
                Start video chat <ArrowRight size={15} />
              </button>
              <a className="lp-btn-secondary" href={isLoggedIn ? "/app" : "/auth?mode=login"}>
                <Zap size={14} /> Login with OTP
              </a>
            </div>

            <div className="lp-trust-row lp-reveal">
              {["OTP or Google sign-in", "LPU email only", "Free to join"].map((t) => (
                <span key={t} className="lp-trust-tag">{t}</span>
              ))}
            </div>

            <div className="lp-stat-row lp-reveal">
              {statItems.map((s, i) => (
                <>
                  <div className="lp-stat-item" key={s.label}>
                    <span className="lp-stat-val">{s.value || "—"}</span>
                    <span className="lp-stat-label">{s.label}</span>
                  </div>
                  {i < statItems.length - 1 && <div className="lp-stat-divider" key={`div-${i}`} />}
                </>
              ))}
            </div>
          </div>

          {/* Right visual */}
          <div className="lp-hero-visual lp-reveal">
            <img className="lp-hero-img"
              src="https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Students connecting" />
            <div className="lp-hero-img-overlay" />

            <div className="lp-float-card lp-float-a">
              <div className="lp-float-card-icon" style={{ background: "rgba(212,242,68,0.1)" }}>
                <Clock3 size={16} color="#d4f244" />
              </div>
              <div>
                <strong>Fast onboarding</strong>
                <span>Name + LPU email OTP</span>
              </div>
            </div>

            <div className="lp-float-card lp-float-b">
              <div className="lp-float-card-icon" style={{ background: "rgba(255,107,53,0.1)" }}>
                <ShieldCheck size={16} color="#ff6b35" />
              </div>
              <div>
                <strong>Verified students only</strong>
                <span><BadgeCheck size={11} />LPU-only entries</span>
              </div>
            </div>

            <span className="lp-vert-label">LPU TV — Campus Connect</span>
          </div>

          <div className="lp-scroll-hint">
            <div className="lp-scroll-arrow"><span /><span /></div>
            Scroll to explore
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section className="lp-features" id="features">
          <div className="lp-section-wrap">
            <div className="lp-features-head">
              <div>
                <p className="lp-eyebrow">Why students use it</p>
                <h2 className="lp-section-h2">Built for real campus<br />conversations.</h2>
              </div>
              <p className="lp-section-p">
                Everything is designed to make that first interaction effortless — whether you're looking for new friends, collaborators, or someone interesting to talk to.
              </p>
            </div>
            <div className="lp-feat-grid">
              {[
                { icon: <ShieldCheck size={19} />, title: "LPU-only verification", desc: "Only students using their official university identity can join — real people, real campus." },
                { icon: <Radar size={19} />,       title: "Instant random matching", desc: "Skip the profiles. Jump into a live conversation in seconds with a fellow student." },
                { icon: <MessageSquareText size={19} />, title: "Keep chatting later", desc: "Turn a great match into a lasting conversation with built-in real-time messaging." },
                { icon: <BadgeCheck size={19} />, title: "More signal, less noise", desc: "Profiles focus on bio, interests, and authenticity — no clutter, no distractions." },
              ].map((f) => (
                <div className="lp-feat-card" key={f.title}>
                  <div className="lp-feat-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ABOUT ── */}
        <section className="lp-about" id="about">
          <div className="lp-section-wrap">
            <div className="lp-about-panel">
              <div>
                <p className="lp-eyebrow">Campus-first experience</p>
                <h2 className="lp-section-h2">Premium, simple,<br />actually useful.</h2>
              </div>
              <div className="lp-about-grid">
                {[
                  { icon: <Users size={17} />, title: "Safer social discovery", desc: "See real activity, talk to real students, and start with context instead of guesswork." },
                  { icon: <Sparkles size={17} />, title: "Smoother first impressions", desc: "The interface highlights warmth and clarity instead of looking like a demo." },
                  { icon: <Video size={17} />, title: "Built around live interaction", desc: "Every section supports the product story — from the hero to the app itself." },
                ].map((c) => (
                  <div className="lp-about-card" key={c.title}>
                    <div className="lp-about-card-icon">{c.icon}</div>
                    <strong>{c.title}</strong>
                    <p>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="lp-cta">
          <div className="lp-section-wrap">
            <div className="lp-cta-card">
              <div className="lp-cta-left">
                <p className="lp-cta-eyebrow">Ready to join</p>
                <h2 className="lp-cta-h2">Make your next campus connection feel effortless.</h2>
                <p className="lp-cta-p">
                  Create your profile, verify your LPU identity, and start meeting students in a space built for real conversations.
                </p>
              </div>
              <div className="lp-cta-right">
                <button className="lp-cta-btn" onClick={handleCta}>
                  Join LPU TV now <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}