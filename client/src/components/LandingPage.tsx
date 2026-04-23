import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import {
  ArrowRight,
  BadgeCheck,
  MessageSquareText,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
  Video
} from "lucide-react";
import { api } from "../lib/api";
import { PublicStats } from "../types";
import { Header } from "./Header";
import { Footer } from "./Footer";

type LandingPageProps = {
  isLoggedIn: boolean;
  onLogout: () => void;
};

const initialStats: PublicStats = {
  onlineNow: 0,
  registeredStudents: 0,
  verifiedStudents: 0
};

export function LandingPage({ isLoggedIn, onLogout }: LandingPageProps) {
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<PublicStats>(initialStats);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".hero-reveal", {
        y: 36,
        opacity: 0,
        duration: 0.9,
        stagger: 0.1,
        ease: "power3.out"
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const response = await api.get<PublicStats>("/public/stats");
        if (active) {
          setStats(response.data);
        }
      } catch {
        if (active) {
          setStats(initialStats);
        }
      }
    };

    void fetchStats();
    const intervalId = window.setInterval(fetchStats, 15000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleCtaClick = () => {
    navigate(isLoggedIn ? "/app" : "/auth?mode=register");
  };

  const statChips = useMemo(
    () => [
      {
        label: "Verified students",
        value: stats.verifiedStudents.toLocaleString()
      },
      {
        label: "Profiles created",
        value: stats.registeredStudents.toLocaleString()
      },
      {
        label: "Real-time online",
        value: stats.onlineNow.toLocaleString()
      }
    ],
    [stats]
  );

  return (
    <div className="landing-shell">
      <Header isLoggedIn={isLoggedIn} onLogout={onLogout} />

      <main className="landing-main" ref={heroRef}>
        <section className="hero-section">
          <div className="hero-content">
            <div className="live-pill hero-reveal">
              <span className="dot"></span>
              {stats.onlineNow.toLocaleString()} students online now
            </div>

            <div className="hero-kicker hero-reveal">
              <span>Verified LPU community</span>
              <span>Meaningful random matches</span>
            </div>

            <h1 className="hero-reveal">Meet people from your campus without the awkward start.</h1>

            <p className="hero-subtitle hero-reveal">
              LPU TV helps students discover new friends through verified profiles, live video chats,
              and instant conversations that feel natural from the first hello.
            </p>

            <div className="hero-btns hero-reveal">
              <button className="primary-button large" onClick={handleCtaClick}>
                Start meeting students
                <ArrowRight size={20} />
              </button>
              <a className="secondary-button large hero-link-button" href="#features">
                Explore features
              </a>
            </div>

            <div className="hero-stats hero-reveal">
              {statChips.map((chip) => (
                <div className="hero-stat-card" key={chip.label}>
                  <strong>{chip.value}</strong>
                  <span>{chip.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-visual hero-reveal">
            <div className="mockup-container">
              <div className="video-stage">
                <video
                  className="hero-video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  poster="https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg?auto=compress&cs=tinysrgb&w=1200"
                >
                  <source
                    src="https://player.vimeo.com/external/434045526.sd.mp4?s=4a8f37e26c0937c09d6ef1d5c00f0f2aad53d3a7&profile_id=139&oauth2_token_id=57447761"
                    type="video/mp4"
                  />
                </video>

                <div className="video-overlay-card">
                  <span className="video-eyebrow">
                    <Video size={16} />
                    Match. Chat. Connect.
                  </span>
                  <h3>Say hi, get matched, and keep the conversation going.</h3>
                  <p>
                    A warm first impression, fast profile context, and a campus-only network make the
                    experience feel safer and more social.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="features-section">
          <div className="section-header">
            <p className="eyebrow">WHY STUDENTS USE IT</p>
            <h2>Built for confidence, safety, and better campus conversations</h2>
            <p className="section-copy">
              Everything here is designed to make the first interaction easier, whether you are looking
              for friends, collaborators, or just someone new to talk to between classes.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card feature-card-wide">
              <div className="card-icon"><ShieldCheck size={28} /></div>
              <h3>LPU-only verification</h3>
              <p>Only students using their official university identity can join the community.</p>
            </div>
            <div className="feature-card">
              <div className="card-icon"><Radar size={28} /></div>
              <h3>Fast random matching</h3>
              <p>Jump into a fresh conversation instantly without scrolling through endless profiles.</p>
            </div>
            <div className="feature-card">
              <div className="card-icon"><MessageSquareText size={28} /></div>
              <h3>Keep chatting later</h3>
              <p>Turn a great match into a lasting conversation with built-in real-time messaging.</p>
            </div>
            <div className="feature-card">
              <div className="card-icon"><BadgeCheck size={28} /></div>
              <h3>More signal, less noise</h3>
              <p>Profiles focus on bio, interests, and authenticity instead of clutter and distractions.</p>
            </div>
          </div>
        </section>

        <section id="about" className="about-section">
          <div className="about-panel">
            <div>
              <p className="eyebrow">CAMPUS-FIRST EXPERIENCE</p>
              <h2>Designed to feel premium, simple, and actually useful</h2>
            </div>

            <div className="about-grid">
              <div className="about-card">
                <Users size={20} />
                <strong>Safer social discovery</strong>
                <p>See real activity, talk to real students, and start with context instead of guesswork.</p>
              </div>
              <div className="about-card">
                <Sparkles size={20} />
                <strong>Smoother first impressions</strong>
                <p>The interface highlights warmth, clarity, and confidence instead of looking like a demo.</p>
              </div>
              <div className="about-card">
                <Video size={20} />
                <strong>Built around live interaction</strong>
                <p>From the hero video to the app flow, every section now supports the product story better.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-card">
            <p className="eyebrow cta-eyebrow">READY TO JOIN</p>
            <h2>Make your next campus connection feel effortless.</h2>
            <p>
              Create your profile, verify your LPU identity, and start meeting students in a space built
              for real conversations.
            </p>
            <button className="primary-button large cta-button" onClick={handleCtaClick}>
              Join LPU TV now
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
