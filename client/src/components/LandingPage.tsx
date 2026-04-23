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
      // Hero stagger
      gsap.from(".lp-reveal", {
        y: 40, opacity: 0, duration: 1,
        stagger: 0.12, ease: "expo.out", delay: 0.1,
      });
      // Noise grain animation
      gsap.to(".lp-grain", {
        backgroundPosition: "100% 100%",
        duration: 0.08,
        repeat: -1,
        yoyo: true,
        ease: "none",
      });
      // Floating cards
      gsap.to(".lp-float-a", {
        y: -10, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut",
      });
      gsap.to(".lp-float-b", {
        y: 8, duration: 3.5, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.8,
      });
      // Features scroll reveal
      gsap.utils.toArray<HTMLElement>(".lp-feat-card").forEach((card, i) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 88%", once: true },
          y: 30, opacity: 0, duration: 0.7, delay: i * 0.08, ease: "power3.out",
        });
      });
      // About section
      gsap.from(".lp-about-panel", {
        scrollTrigger: { trigger: ".lp-about-panel", start: "top 85%", once: true },
        y: 40, opacity: 0, duration: 0.9, ease: "expo.out",
      });
      // CTA
      gsap.from(".lp-cta-card", {
        scrollTrigger: { trigger: ".lp-cta-card", start: "top 85%", once: true },
        scale: 0.96, opacity: 0, duration: 0.8, ease: "expo.out",
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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');

        :root {
          --c-bg:    #07070a;
          --c-bg2:   #0f0f14;
          --c-bg3:   #14141c;
          --c-acc:   #e8ff47;
          --c-acc2:  #ff6b35;
          --c-text:  #f0f0f0;
          --c-muted: rgba(240,240,240,0.45);
          --c-line:  rgba(240,240,240,0.07);
          --font-display: 'Syne', sans-serif;
          --font-body:    'DM Sans', sans-serif;
          --r-lg: 16px;
          --r-xl: 24px;
        }

        .lp-shell {
          background: var(--c-bg);
          color: var(--c-text);
          font-family: var(--font-body);
          overflow-x: hidden;
          min-height: 100dvh;
          position: relative;
        }

        /* ── Grain overlay ── */
        .lp-grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 100;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          background-size: 180px;
        }

        /* ── Hero ── */
        .lp-hero {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          position: relative;
          overflow: hidden;
        }
        @media (max-width: 860px) {
          .lp-hero { grid-template-columns: 1fr; }
          .lp-hero-visual { display: none; }
        }

        /* left side */
        .lp-hero-left {
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 100px 56px 60px 7vw;
          position: relative;
          z-index: 2;
        }
        @media (max-width: 860px) {
          .lp-hero-left { padding: 100px 24px 60px; }
        }

        /* background mesh on left */
        .lp-hero-left::before {
          content: '';
          position: absolute;
          bottom: -120px; left: -120px;
          width: 500px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,255,71,0.07) 0%, transparent 70%);
          pointer-events: none;
        }

        .lp-live-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(232,255,71,0.08);
          border: 1px solid rgba(232,255,71,0.22);
          border-radius: 100px;
          padding: 6px 14px 6px 10px;
          font-size: 12px;
          font-weight: 500;
          color: var(--c-acc);
          margin-bottom: 28px;
          width: fit-content;
          letter-spacing: 0.2px;
        }
        .lp-live-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--c-acc);
          box-shadow: 0 0 8px var(--c-acc);
          animation: lp-blink 1.4s ease-in-out infinite;
        }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .lp-h1 {
          font-family: var(--font-display);
          font-size: clamp(38px, 5vw, 62px);
          font-weight: 800;
          line-height: 1.04;
          letter-spacing: -0.03em;
          color: var(--c-text);
          margin: 0 0 20px;
        }
        .lp-h1 .lp-acc-word {
          color: var(--c-acc);
          position: relative;
          display: inline-block;
        }
        .lp-h1 .lp-acc-word::after {
          content: '';
          position: absolute;
          bottom: 2px; left: 0; right: 0;
          height: 3px;
          background: var(--c-acc);
          border-radius: 2px;
          opacity: 0.5;
        }

        .lp-subtitle {
          font-size: 15px;
          color: var(--c-muted);
          line-height: 1.7;
          max-width: 400px;
          margin: 0 0 32px;
          font-weight: 300;
        }

        .lp-btn-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 40px;
        }

        .lp-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--c-acc);
          color: #07070a;
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
          padding: 13px 22px;
          border-radius: 100px;
          border: none;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.1px;
          text-decoration: none;
        }
        .lp-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(232,255,71,0.3);
        }
        .lp-btn-primary:active { transform: scale(0.97); }

        .lp-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: transparent;
          color: var(--c-text);
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 400;
          padding: 12px 20px;
          border-radius: 100px;
          border: 1px solid var(--c-line);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          text-decoration: none;
          letter-spacing: 0.1px;
        }
        .lp-btn-secondary:hover { border-color: rgba(240,240,240,0.2); background: rgba(240,240,240,0.04); }

        /* trust row */
        .lp-trust-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 40px;
        }
        .lp-trust-tag {
          font-size: 11px;
          font-weight: 500;
          color: rgba(240,240,240,0.4);
          background: rgba(240,240,240,0.04);
          border: 1px solid rgba(240,240,240,0.07);
          border-radius: 6px;
          padding: 4px 10px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        /* stat row */
        .lp-stat-row {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
        }
        .lp-stat-item { display: flex; flex-direction: column; gap: 2px; }
        .lp-stat-val {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 800;
          color: var(--c-text);
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .lp-stat-label { font-size: 11px; color: var(--c-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .lp-stat-divider { width: 1px; background: var(--c-line); align-self: stretch; }

        /* right visual */
        .lp-hero-visual {
          position: relative;
          overflow: hidden;
          background: var(--c-bg2);
        }
        .lp-hero-visual::before {
          content: '';
          position: absolute;
          top: -100px; right: -100px;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,107,53,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-hero-img {
          width: 100%; height: 100%;
          object-fit: cover;
          object-position: center top;
          opacity: 0.6;
          mix-blend-mode: luminosity;
        }
        .lp-hero-img-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to right, var(--c-bg) 0%, transparent 30%),
                      linear-gradient(to top, var(--c-bg) 0%, transparent 25%);
        }

        /* floating cards on visual */
        .lp-float-card {
          position: absolute;
          background: rgba(15,15,20,0.88);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(240,240,240,0.1);
          border-radius: var(--r-lg);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 3;
        }
        .lp-float-card-icon {
          width: 34px; height: 34px;
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .lp-float-card strong { font-size: 13px; font-weight: 600; color: var(--c-text); display: block; }
        .lp-float-card span  { font-size: 11px; color: var(--c-muted); display: flex; align-items: center; gap: 4px; }
        .lp-float-a { top: 22%; left: -28px; }
        .lp-float-b { bottom: 28%; right: 28px; }

        /* vertical text label */
        .lp-vert-label {
          position: absolute;
          right: 20px; top: 50%;
          transform: translateY(-50%) rotate(90deg);
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: rgba(240,240,240,0.15);
          white-space: nowrap;
          z-index: 2;
        }

        /* scroll hint */
        .lp-scroll-hint {
          position: absolute;
          bottom: 28px; left: 7vw;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: rgba(240,240,240,0.2);
          letter-spacing: 0.5px;
          z-index: 2;
        }
        .lp-scroll-arrow {
          display: flex; flex-direction: column; gap: 2px;
        }
        .lp-scroll-arrow span {
          width: 1px; height: 14px;
          background: rgba(240,240,240,0.15);
          animation: lp-scroll-drop 1.5s ease infinite;
        }
        .lp-scroll-arrow span:nth-child(2) { animation-delay: 0.2s; opacity: 0.6; }
        @keyframes lp-scroll-drop { 0%{transform:scaleY(0);transform-origin:top} 50%{transform:scaleY(1)} 100%{transform:scaleY(0);transform-origin:bottom} }

        /* ── Section shared ── */
        .lp-section-wrap {
          max-width: 1160px;
          margin: 0 auto;
          padding: 0 7vw;
        }
        .lp-eyebrow {
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: var(--c-acc);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .lp-eyebrow::before {
          content: '';
          width: 20px; height: 1px;
          background: var(--c-acc);
          opacity: 0.6;
          flex-shrink: 0;
        }
        .lp-section-h2 {
          font-family: var(--font-display);
          font-size: clamp(28px, 3.5vw, 44px);
          font-weight: 800;
          letter-spacing: -0.025em;
          line-height: 1.1;
          color: var(--c-text);
          margin-bottom: 16px;
        }
        .lp-section-p {
          font-size: 15px;
          color: var(--c-muted);
          line-height: 1.7;
          max-width: 520px;
          font-weight: 300;
        }

        /* ── Features ── */
        .lp-features {
          padding: 100px 0;
          background: var(--c-bg);
          border-top: 1px solid var(--c-line);
        }
        .lp-features-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 32px;
          margin-bottom: 56px;
          flex-wrap: wrap;
        }
        .lp-features-head .lp-section-p { max-width: 340px; }

        .lp-feat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--c-line);
          border: 1px solid var(--c-line);
          border-radius: var(--r-xl);
          overflow: hidden;
        }
        @media (max-width: 900px) {
          .lp-feat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 540px) {
          .lp-feat-grid { grid-template-columns: 1fr; }
        }

        .lp-feat-card {
          background: var(--c-bg2);
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: background 0.2s;
          position: relative;
          overflow: hidden;
        }
        .lp-feat-card:hover { background: var(--c-bg3); }
        .lp-feat-card::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: var(--c-acc);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s ease;
        }
        .lp-feat-card:hover::after { transform: scaleX(1); }

        .lp-feat-icon {
          width: 44px; height: 44px;
          border-radius: 12px;
          background: rgba(232,255,71,0.07);
          border: 1px solid rgba(232,255,71,0.12);
          display: flex; align-items: center; justify-content: center;
          color: var(--c-acc);
        }
        .lp-feat-card h3 {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: var(--c-text);
          letter-spacing: -0.01em;
        }
        .lp-feat-card p {
          font-size: 13px;
          color: var(--c-muted);
          line-height: 1.6;
          font-weight: 300;
        }

        /* ── About ── */
        .lp-about {
          padding: 100px 0;
          background: var(--c-bg2);
          border-top: 1px solid var(--c-line);
        }
        .lp-about-panel {
          background: var(--c-bg3);
          border: 1px solid rgba(240,240,240,0.06);
          border-radius: 28px;
          padding: 56px 56px 48px;
          display: flex;
          flex-direction: column;
          gap: 44px;
          position: relative;
          overflow: hidden;
        }
        .lp-about-panel::before {
          content: '';
          position: absolute;
          top: -80px; right: -80px;
          width: 360px; height: 360px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,255,71,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
        @media (max-width: 640px) {
          .lp-about-panel { padding: 32px 24px; }
        }
        .lp-about-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 700px) {
          .lp-about-grid { grid-template-columns: 1fr; }
        }
        .lp-about-card {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 20px;
          background: rgba(240,240,240,0.03);
          border: 1px solid var(--c-line);
          border-radius: var(--r-lg);
        }
        .lp-about-card-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: rgba(255,107,53,0.1);
          border: 1px solid rgba(255,107,53,0.15);
          display: flex; align-items: center; justify-content: center;
          color: var(--c-acc2);
        }
        .lp-about-card strong {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
          color: var(--c-text);
        }
        .lp-about-card p { font-size: 13px; color: var(--c-muted); line-height: 1.6; font-weight: 300; }

        /* ── CTA ── */
        .lp-cta {
          padding: 100px 0 80px;
          background: var(--c-bg);
          border-top: 1px solid var(--c-line);
        }
        .lp-cta-card {
          background: var(--c-acc);
          border-radius: 28px;
          padding: 64px 56px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 20px;
          position: relative;
          overflow: hidden;
        }
        .lp-cta-card::before {
          content: '';
          position: absolute;
          top: -100px; right: -60px;
          width: 400px; height: 400px;
          border-radius: 50%;
          background: rgba(255,255,255,0.12);
          pointer-events: none;
        }
        .lp-cta-card::after {
          content: '';
          position: absolute;
          bottom: -80px; left: 40%;
          width: 280px; height: 280px;
          border-radius: 50%;
          background: rgba(0,0,0,0.06);
          pointer-events: none;
        }
        @media (max-width: 640px) {
          .lp-cta-card { padding: 40px 28px; }
        }
        .lp-cta-eyebrow {
          font-family: var(--font-display);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: rgba(7,7,10,0.55);
          display: flex; align-items: center; gap: 8px;
        }
        .lp-cta-eyebrow::before { content: ''; width: 20px; height: 1px; background: rgba(7,7,10,0.35); }
        .lp-cta-h2 {
          font-family: var(--font-display);
          font-size: clamp(26px, 3.5vw, 42px);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.1;
          color: #07070a;
          max-width: 520px;
          position: relative; z-index: 1;
        }
        .lp-cta-p {
          font-size: 15px;
          color: rgba(7,7,10,0.6);
          line-height: 1.65;
          max-width: 420px;
          font-weight: 300;
          position: relative; z-index: 1;
        }
        .lp-cta-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #07070a;
          color: var(--c-acc);
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
          padding: 13px 24px;
          border-radius: 100px;
          border: none;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.1px;
          position: relative; z-index: 1;
        }
        .lp-cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(7,7,10,0.3);
        }
      `}</style>

      <div className="lp-shell" ref={rootRef}>
        <div className="lp-grain" />
        <Header isLoggedIn={isLoggedIn} onLogout={onLogout} />

        {/* ── HERO ── */}
        <section className="lp-hero">

          {/* Left */}
          <div className="lp-hero-left">
            <div className="lp-live-pill lp-reveal">
              <span className="lp-live-dot" />
              {stats.onlineNow > 0 ? `${stats.onlineNow.toLocaleString()} students online` : "LPU campus network"}
            </div>

            <h1 className="lp-h1 lp-reveal">
              Meet&nbsp;your next&nbsp;<span className="lp-acc-word">campus</span>&nbsp;connection.
            </h1>

            <p className="lp-subtitle lp-reveal">
              Verified random video chat — exclusively for LPU students. Sign in with your university email and start a real conversation in seconds.
            </p>

            <div className="lp-btn-row lp-reveal">
              <button className="lp-btn-primary" onClick={handleCta}>
                Start video chat
                <ArrowRight size={16} />
              </button>
              <a className="lp-btn-secondary" href={isLoggedIn ? "/app" : "/auth?mode=login"}>
                <Zap size={14} />
                Login with OTP
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
            <img
              className="lp-hero-img"
              src="https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg?auto=compress&cs=tinysrgb&w=1200"
              alt="Students connecting"
            />
            <div className="lp-hero-img-overlay" />

            <div className="lp-float-card lp-float-a">
              <div className="lp-float-card-icon" style={{ background: "rgba(232,255,71,0.1)" }}>
                <Clock3 size={17} color="#e8ff47" />
              </div>
              <div>
                <strong>Fast onboarding</strong>
                <span>Name + LPU email OTP</span>
              </div>
            </div>

            <div className="lp-float-card lp-float-b">
              <div className="lp-float-card-icon" style={{ background: "rgba(255,107,53,0.1)" }}>
                <ShieldCheck size={17} color="#ff6b35" />
              </div>
              <div>
                <strong>Verified students only</strong>
                <span><BadgeCheck size={11} />LPU-only entries</span>
              </div>
            </div>

            <span className="lp-vert-label">LPU TV — Campus Connect</span>
          </div>

          <div className="lp-scroll-hint">
            <div className="lp-scroll-arrow">
              <span /><span />
            </div>
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
                { icon: <ShieldCheck size={20} />, title: "LPU-only verification", desc: "Only students using their official university identity can join — real people, real campus." },
                { icon: <Radar size={20} />,       title: "Instant random matching", desc: "Skip the profiles. Jump into a live conversation in seconds with a fellow student." },
                { icon: <MessageSquareText size={20} />, title: "Keep chatting later", desc: "Turn a great match into a lasting conversation with built-in real-time messaging." },
                { icon: <BadgeCheck size={20} />, title: "More signal, less noise", desc: "Profiles focus on bio, interests, and authenticity — no clutter, no distractions." },
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
              <p className="lp-cta-eyebrow">Ready to join</p>
              <h2 className="lp-cta-h2">Make your next campus connection feel effortless.</h2>
              <p className="lp-cta-p">
                Create your profile, verify your LPU identity, and start meeting students in a space built for real conversations.
              </p>
              <button className="lp-cta-btn" onClick={handleCta}>
                Join LPU TV now
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}