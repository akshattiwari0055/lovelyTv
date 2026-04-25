import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
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
        y: 32, opacity: 0, duration: 0.9,
        stagger: 0.1, ease: "expo.out", delay: 0.15,
      });
      gsap.to(".lp-grain", {
        backgroundPosition: "100% 100%",
        duration: 0.08, repeat: -1, yoyo: true, ease: "none",
      });
      gsap.utils.toArray<HTMLElement>(".lp-feat-card").forEach((card, i) => {
        gsap.from(card, {
          scrollTrigger: { trigger: card, start: "top 90%", once: true },
          y: 36, opacity: 0, duration: 0.7, delay: i * 0.08, ease: "power3.out",
        });
      });
      gsap.utils.toArray<HTMLElement>(".lp-stat-val").forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
          opacity: 0, y: 16, duration: 0.5, ease: "power2.out",
        });
      });
      gsap.from(".lp-about-panel", {
        scrollTrigger: { trigger: ".lp-about-panel", start: "top 85%", once: true },
        y: 40, opacity: 0, duration: 0.9, ease: "expo.out",
      });
      gsap.from(".lp-cta-card", {
        scrollTrigger: { trigger: ".lp-cta-card", start: "top 87%", once: true },
        scale: 0.96, opacity: 0, duration: 0.8, ease: "expo.out",
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleCta = () => navigate(isLoggedIn ? "/app" : "/auth?mode=register");

  const statItems = useMemo(() => [
    {
      value: stats.verifiedStudents > 0
        ? stats.verifiedStudents >= 1000
          ? `${(stats.verifiedStudents / 1000).toFixed(1).replace(/\.0$/, "")}k`
          : stats.verifiedStudents.toLocaleString()
        : "12k+",
      label: "Verified",
    },
    {
      value: stats.registeredStudents > 0
        ? stats.registeredStudents >= 1000
          ? `${(stats.registeredStudents / 1000).toFixed(1).replace(/\.0$/, "")}k`
          : stats.registeredStudents.toLocaleString()
        : "50k+",
      label: "Profiles",
    },
    {
      value: stats.onlineNow > 0
        ? stats.onlineNow >= 1000
          ? `${(stats.onlineNow / 1000).toFixed(1).replace(/\.0$/, "")}k`
          : stats.onlineNow.toLocaleString()
        : "2.4k",
      label: "Online now",
    },
  ], [stats]);

  const livePillText = stats.onlineNow > 0
    ? `Live at ${stats.onlineNow.toLocaleString()}+ campuses`
    : "Live at LPU, CU, and 50+ more";

  const features = [
    {
      icon: <ShieldCheck size={22} />,
      title: "Hyper-Local Chat",
      desc: "Encrypted, zero-lag messaging for your dorm, your major, or your squad. Always stay in the loop.",
      accent: "#22d3ee",
    },
    {
      icon: <Radar size={22} />,
      title: "Pulse Feed",
      desc: "The 24/7 digital broadcast of campus happenings. If it's going down, it's on CampusTV.",
      accent: "#f472b6",
      featured: true,
    },
    {
      icon: <MessageSquareText size={22} />,
      title: "Vibe Alerts",
      desc: "Notifications that actually matter. Flash sales, free food, and event drops exactly when they happen.",
      accent: "#22d3ee",
    },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:ital,wght@0,400;0,500;1,400&display=swap');

        :root {
          --bg:    #080b12;
          --bg2:   #0d1020;
          --bg3:   #111520;
          --cyan:  #22d3ee;
          --pink:  #f472b6;
          --violet:#a78bfa;
          --text:  #f1f5f9;
          --muted: rgba(241,245,249,0.42);
          --dim:   rgba(241,245,249,0.18);
          --line:  rgba(241,245,249,0.07);
          --font-display: 'Bebas Neue', sans-serif;
          --font-head:    'Cabinet Grotesk', sans-serif;
          --font-body:    'Instrument Sans', sans-serif;
          --header-h: 64px;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-shell {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          overflow-x: hidden;
          min-height: 100dvh;
          -webkit-font-smoothing: antialiased;
          font-size: 16px;
        }

        /* ── GRAIN ─────────────────────────────────── */
        .lp-grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 200;
          opacity: 0.028;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 160px;
        }

        /* ── HERO ──────────────────────────────────── */
        .lp-hero {
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: flex-start;
          padding: calc(var(--header-h) + 24px) 16px 48px;
          text-align: center;
          position: relative; overflow: hidden;
        }

        .lp-hero::before {
          content: '';
          position: absolute; top: 15%; left: 50%; transform: translateX(-50%);
          width: 860px; height: 500px; border-radius: 50%;
          background: radial-gradient(ellipse, rgba(244,114,182,0.13) 0%, rgba(167,139,250,0.09) 40%, transparent 70%);
          pointer-events: none; filter: blur(48px);
        }
        .lp-hero::after {
          content: '';
          position: absolute; bottom: 0; left: 0; right: 0; height: 280px;
          background: linear-gradient(to top, var(--bg) 0%, transparent 100%);
          pointer-events: none; z-index: 1;
        }

        .lp-grid-bg {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(241,245,249,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(241,245,249,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black 0%, transparent 100%);
        }

        /* ── LIVE PILL ─────────────────────────────── */
        .lp-live-pill {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(244,114,182,0.1);
          border: 1px solid rgba(244,114,182,0.25);
          border-radius: 100px; padding: 7px 18px 7px 13px;
          font-family: var(--font-head); font-size: 11px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase; color: var(--pink);
          margin-bottom: 20px; position: relative; z-index: 2;
        }
        .lp-live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--pink); box-shadow: 0 0 10px var(--pink);
          animation: lp-blink 1.3s ease-in-out infinite; flex-shrink: 0;
        }
        @keyframes lp-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

        /* ── HEADLINES ─────────────────────────────── */
        .lp-h1 {
          font-family: var(--font-display);
          font-size: clamp(72px, 22vw, 220px);
          line-height: 0.88;
          letter-spacing: 0.01em;
          color: var(--text);
          margin: 0 0 2px;
          position: relative; z-index: 2;
          width: 100%;
        }

        /* Continuously cycling pink → violet → blue → pink gradient */
        .lp-h1-line2 {
          font-family: var(--font-display);
          font-size: clamp(68px, 21vw, 210px);
          line-height: 0.88;
          letter-spacing: 0.01em;
          background: linear-gradient(
            90deg,
            #f472b6 0%,
            #a78bfa 25%,
            #818cf8 50%,
            #f472b6 75%,
            #a78bfa 100%
          );
          background-size: 300% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: lp-grad-shift 4s linear infinite;
          margin: 0 0 28px;
          position: relative; z-index: 2;
          display: block;
          width: 100%;
        }
        @keyframes lp-grad-shift {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }

        /* ── SUBTITLE ──────────────────────────────── */
        .lp-hero-subtitle {
          font-size: clamp(13px, 1.6vw, 17px);
          color: var(--muted); line-height: 1.75;
          max-width: 560px; margin: 0 auto 24px;
          font-weight: 400; position: relative; z-index: 2;
        }

        /* ── TRUST TAGS ────────────────────────────── */
        .lp-trust-row {
          display: flex; flex-wrap: wrap; gap: 8px;
          justify-content: center; margin-bottom: 24px;
          position: relative; z-index: 2;
        }
        .lp-trust-tag {
          font-size: 10px; font-weight: 600;
          color: var(--dim); background: rgba(241,245,249,0.04);
          border: 1px solid var(--line); border-radius: 6px;
          padding: 5px 12px; letter-spacing: 0.08em; text-transform: uppercase;
          font-family: var(--font-head);
        }

        /* ── BUTTONS ───────────────────────────────── */
        .lp-hero-btns {
          display: flex; align-items: center; justify-content: center;
          gap: 12px; flex-wrap: wrap;
          position: relative; z-index: 2; margin-bottom: 36px;
        }
        .lp-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: var(--cyan); color: #080b12;
          font-family: var(--font-head); font-size: 15px; font-weight: 800;
          padding: 15px 30px; border-radius: 12px; border: none; cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s; letter-spacing: -0.01em;
        }
        .lp-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(34,211,238,0.35); }
        .lp-btn-primary:active { transform: scale(0.97); }

        .lp-btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(241,245,249,0.06);
          border: 1px solid rgba(241,245,249,0.14);
          color: var(--text); font-family: var(--font-head); font-size: 15px; font-weight: 700;
          padding: 14px 26px; border-radius: 12px; cursor: pointer;
          transition: all 0.15s;
        }
        .lp-btn-secondary:hover { background: rgba(241,245,249,0.1); border-color: rgba(241,245,249,0.22); }

        /* ── STATS BAR ─────────────────────────────── */
        .lp-stats-bar {
          display: flex; align-items: center; justify-content: center;
          position: relative; z-index: 2;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--line);
          border-radius: 16px; overflow: hidden;
          max-width: 500px; width: 100%; margin: 0 auto;
        }
        .lp-stat-cell {
          flex: 1; padding: 20px 16px; text-align: center;
          border-right: 1px solid var(--line);
        }
        .lp-stat-cell:last-child { border-right: none; }
        .lp-stat-val {
          font-family: var(--font-display); font-size: clamp(24px, 4vw, 34px);
          color: var(--text); line-height: 1; letter-spacing: 0.02em; display: block;
        }
        .lp-stat-label {
          font-size: 10px; color: var(--dim); text-transform: uppercase;
          letter-spacing: 0.12em; font-family: var(--font-head); font-weight: 700;
          margin-top: 5px; display: block;
        }

        /* ── FEATURES ──────────────────────────────── */
        .lp-features {
          padding: 96px 0 80px;
          background: var(--bg);
          border-top: 1px solid var(--line);
        }
        .lp-section-wrap { max-width: 1180px; margin: 0 auto; padding: 0 6vw; }
        .lp-feat-header { margin-bottom: 52px; }

        .lp-eyebrow {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; color: var(--cyan);
          margin-bottom: 14px; display: flex; align-items: center; gap: 10px;
        }
        .lp-eyebrow::before {
          content: ''; width: 20px; height: 1px;
          background: var(--cyan); opacity: 0.6; flex-shrink: 0;
        }
        .lp-section-h2 {
          font-family: var(--font-head);
          font-size: clamp(26px, 4vw, 48px);
          font-weight: 900; letter-spacing: -0.035em;
          line-height: 1.06; color: var(--text);
        }

        .lp-feat-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        @media (max-width: 760px) { .lp-feat-grid { grid-template-columns: 1fr; } }

        .lp-feat-card {
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 20px; padding: 32px 28px;
          display: flex; flex-direction: column; gap: 14px;
          position: relative; overflow: hidden;
          transition: transform 0.2s, border-color 0.2s;
        }
        .lp-feat-card:hover { transform: translateY(-4px); }
        .lp-feat-card.featured {
          border-color: rgba(244,114,182,0.4);
          background: linear-gradient(145deg, #1a0d1f 0%, #0f0b1a 100%);
          box-shadow: 0 0 0 1px rgba(244,114,182,0.35), 0 0 40px rgba(244,114,182,0.08);
        }
        .lp-feat-card.featured::before {
          content: ''; position: absolute; inset: 0;
          background: radial-gradient(ellipse at top, rgba(244,114,182,0.12) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-feat-icon {
          width: 48px; height: 48px; border-radius: 13px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .lp-feat-card h3 {
          font-family: var(--font-head); font-size: 20px; font-weight: 900;
          color: var(--text); letter-spacing: -0.02em; line-height: 1.2;
        }
        .lp-feat-card p { font-size: 14px; color: var(--muted); line-height: 1.7; }

        /* ── BIG STATS ─────────────────────────────── */
        .lp-big-stats {
          padding: 72px 0; background: var(--bg2);
          border-top: 1px solid var(--line); overflow: hidden;
        }
        .lp-big-stats-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
        }
        @media (max-width: 640px) { .lp-big-stats-grid { grid-template-columns: repeat(2, 1fr); } }
        .lp-big-stat {
          padding: 32px 24px;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }
        .lp-big-stat:nth-child(4n) { border-right: none; }
        @media (max-width: 640px) { .lp-big-stat:nth-child(2n) { border-right: none; } }
        .lp-big-stat-val {
          font-family: var(--font-display);
          font-size: clamp(52px, 8vw, 92px);
          line-height: 1; display: block; letter-spacing: 0.01em;
        }
        .lp-big-stat-label {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.16em;
          color: var(--dim); margin-top: 6px; display: block;
        }

        /* ── ABOUT ─────────────────────────────────── */
        .lp-about { padding: 96px 0; background: var(--bg2); border-top: 1px solid var(--line); }
        .lp-about-panel {
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 24px; padding: 56px 52px;
          display: flex; flex-direction: column; gap: 40px;
          position: relative; overflow: hidden;
        }
        @media (max-width: 640px) { .lp-about-panel { padding: 32px 24px; } }
        .lp-about-panel::before {
          content: ''; position: absolute; top: -100px; right: -100px;
          width: 400px; height: 400px; border-radius: 50%;
          background: radial-gradient(circle, rgba(167,139,250,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .lp-about-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 760px) { .lp-about-grid { grid-template-columns: 1fr; } }
        .lp-about-card {
          background: rgba(241,245,249,0.025); border: 1px solid var(--line);
          border-radius: 16px; padding: 22px;
          display: flex; flex-direction: column; gap: 12px; transition: border-color 0.2s;
        }
        .lp-about-card:hover { border-color: rgba(167,139,250,0.2); }
        .lp-about-icon {
          width: 38px; height: 38px; border-radius: 10px;
          background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.15);
          display: flex; align-items: center; justify-content: center; color: var(--violet);
        }
        .lp-about-card strong {
          font-family: var(--font-head); font-size: 15px; font-weight: 800;
          color: var(--text); letter-spacing: -0.02em;
        }
        .lp-about-card p { font-size: 13.5px; color: var(--muted); line-height: 1.7; }

        /* ── CTA ───────────────────────────────────── */
        .lp-cta { padding: 96px 0; background: var(--bg); border-top: 1px solid var(--line); }
        .lp-cta-card {
          background: var(--bg3); border: 1px solid var(--line);
          border-radius: 28px; padding: 80px 64px;
          text-align: center; position: relative; overflow: hidden;
        }
        @media (max-width: 640px) { .lp-cta-card { padding: 52px 28px; } }
        .lp-cta-card::before {
          content: ''; position: absolute; top: -120px; left: 50%; transform: translateX(-50%);
          width: 600px; height: 400px;
          background: radial-gradient(ellipse, rgba(34,211,238,0.07) 0%, rgba(244,114,182,0.05) 40%, transparent 70%);
          pointer-events: none; filter: blur(30px);
        }
        .lp-cta-card::after {
          content: ''; position: absolute; top: 0; left: -200%; width: 80%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.015), transparent);
          animation: lp-scan 4s linear infinite; pointer-events: none;
        }
        @keyframes lp-scan { 0%{left:-80%} 100%{left:200%} }

        .lp-cta-eyebrow {
          font-family: var(--font-head); font-size: 10px; font-weight: 700;
          letter-spacing: 0.22em; text-transform: uppercase; color: var(--cyan);
          margin-bottom: 20px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          position: relative; z-index: 1;
        }
        .lp-cta-eyebrow::before, .lp-cta-eyebrow::after {
          content: ''; width: 20px; height: 1px; background: var(--cyan); opacity: 0.6;
        }
        .lp-cta-h2 {
          font-family: var(--font-display);
          font-size: clamp(52px, 10vw, 110px);
          line-height: 0.93; letter-spacing: 0.01em;
          color: var(--text); margin-bottom: 8px; position: relative; z-index: 1;
        }
        .lp-cta-h2 span { color: var(--cyan); text-shadow: 0 0 60px rgba(34,211,238,0.4); }
        .lp-cta-sub {
          font-size: 15px; color: var(--muted); line-height: 1.7;
          max-width: 440px; margin: 0 auto 40px; position: relative; z-index: 1;
        }
        .lp-cta-btns {
          display: flex; align-items: center; justify-content: center;
          gap: 12px; flex-wrap: wrap; position: relative; z-index: 1;
        }
        .lp-cta-btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          background: #fff; color: #080b12;
          font-family: var(--font-head); font-size: 15px; font-weight: 800;
          padding: 15px 32px; border-radius: 12px; border: none; cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s; letter-spacing: -0.01em;
        }
        .lp-cta-btn-primary:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(255,255,255,0.18); }
        .lp-cta-btn-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          background: rgba(241,245,249,0.06); border: 1px solid rgba(241,245,249,0.14);
          color: var(--text); font-family: var(--font-head); font-size: 15px; font-weight: 700;
          padding: 14px 28px; border-radius: 12px; cursor: pointer; transition: all 0.15s;
        }
        .lp-cta-btn-secondary:hover { background: rgba(241,245,249,0.1); }

        /* ── RESPONSIVE ────────────────────────────── */
        @media (max-width: 640px) {
          .lp-hero { padding: calc(var(--header-h) + 16px) 12px 40px; }
          .lp-h1 { font-size: clamp(72px, 22vw, 120px); }
          .lp-h1-line2 { font-size: clamp(68px, 21vw, 114px); margin-bottom: 20px; }
          .lp-btn-primary, .lp-btn-secondary { padding: 13px 20px; font-size: 14px; }
          .lp-stat-cell { padding: 14px 8px; }
          .lp-live-pill { margin-bottom: 14px; }
        }
        @media (min-width: 641px) and (max-width: 1024px) {
          .lp-hero { padding: calc(var(--header-h) + 20px) 20px 56px; }
        }
      `}</style>

      <div className="lp-shell" ref={rootRef}>
        <div className="lp-grain" />
        <Header isLoggedIn={isLoggedIn} onLogout={onLogout} />

        {/* ── HERO ─────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-grid-bg" />

          <div className="lp-live-pill lp-reveal">
            <span className="lp-live-dot" />
            {livePillText}
          </div>

          <h1 className="lp-h1 lp-reveal">RE-IMAGINE</h1>
          <span className="lp-h1-line2 lp-reveal">CAMPUS LIFE.</span>

          <p className="lp-hero-subtitle lp-reveal">
            The high-frequency social layer of your university. Chat in real-time, post stories that matter, and never miss a beat.
          </p>

          <div className="lp-trust-row lp-reveal">
            {["OTP or Google sign-in", "Campus email only", "Free to join"].map((t) => (
              <span key={t} className="lp-trust-tag">{t}</span>
            ))}
          </div>

          <div className="lp-hero-btns lp-reveal">
            <button className="lp-btn-primary" onClick={handleCta}>
              Claim Your Handle <ArrowRight size={16} />
            </button>
            <button
              className="lp-btn-secondary"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              See What's Trending
            </button>
          </div>

          <div className="lp-stats-bar lp-reveal">
            {statItems.map((s) => (
              <div className="lp-stat-cell" key={s.label}>
                <span className="lp-stat-val">{s.value}</span>
                <span className="lp-stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────── */}
        <section className="lp-features" id="features">
          <div className="lp-section-wrap">
            <div className="lp-feat-header">
              <p className="lp-eyebrow">Why students use it</p>
              <h2 className="lp-section-h2">Built for real campus<br />conversations.</h2>
            </div>
            <div className="lp-feat-grid">
              {features.map((f) => (
                <div className={`lp-feat-card${f.featured ? " featured" : ""}`} key={f.title}>
                  <div
                    className="lp-feat-icon"
                    style={{ background: `${f.accent}14`, border: `1px solid ${f.accent}22`, color: f.accent }}
                  >
                    {f.icon}
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BIG STATS ─────────────────────────────────── */}
        <section className="lp-big-stats">
          <div className="lp-section-wrap">
            <div className="lp-big-stats-grid">
              {[
                { val: "120k+", label: "Active Users", color: "#f1f5f9" },
                { val: "45+",   label: "Universities", color: "#f472b6" },
                { val: "2.4m",  label: "Dailies",      color: "#22d3ee" },
                { val: "0s",    label: "Latency",      color: "#f1f5f9" },
              ].map((s) => (
                <div className="lp-big-stat lp-stat-val" key={s.label}>
                  <span className="lp-big-stat-val" style={{ color: s.color }}>{s.val}</span>
                  <span className="lp-big-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── ABOUT ─────────────────────────────────────── */}
        <section className="lp-about" id="about">
          <div className="lp-section-wrap">
            <div className="lp-about-panel">
              <div>
                <p className="lp-eyebrow">Campus-first experience</p>
                <h2 className="lp-section-h2">Premium, simple,<br />actually useful.</h2>
              </div>
              <div className="lp-about-grid">
                {[
                  { icon: <Users size={18} />, title: "Safer social discovery", desc: "See real activity, talk to real students, and start with context instead of guesswork." },
                  { icon: <Sparkles size={18} />, title: "Smoother first impressions", desc: "The interface highlights warmth and clarity — no clutter, no algorithmic noise." },
                  { icon: <Video size={18} />, title: "Built around live interaction", desc: "Every section supports the product story — from the hero to the live app itself." },
                ].map((c) => (
                  <div className="lp-about-card" key={c.title}>
                    <div className="lp-about-icon">{c.icon}</div>
                    <strong>{c.title}</strong>
                    <p>{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────── */}
        <section className="lp-cta">
          <div className="lp-section-wrap">
            <div className="lp-cta-card">
              <p className="lp-cta-eyebrow">Ready to join</p>
              <h2 className="lp-cta-h2">READY TO<br /><span>DIVE IN?</span></h2>
              <p className="lp-cta-sub">
                Your campus digital twin is waiting. Get your username before it's gone.
              </p>
              <div className="lp-cta-btns">
                <button className="lp-cta-btn-primary" onClick={handleCta}>
                  Join the CampusTV
                </button>
                <button className="lp-cta-btn-secondary">
                  Request Campus Launch
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