import { ArrowUpRight, Globe, ShieldCheck, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer className="main-footer">
      <div className="footer-container">
        <div className="footer-info">
          <div className="logo footer-logo">
            <span className="logo-icon">📺</span>
            <span className="logo-text">CampusTV</span>
          </div>
          <p>
            The student-first video community for Lovely Professional University, designed for safe
            introductions, better conversations, and real campus connections.
          </p>
          <div className="footer-badges">
            <span><ShieldCheck size={16} /> Verified with Campus email</span>
            <span><Sparkles size={16} /> Built for meaningful matches</span>
          </div>
        </div>

        <div className="footer-links">
          <p className="footer-title">Platform</p>
          <a href="/#features">Features</a>
          <a href="/auth?mode=register">Create account</a>
          <a href="/auth?mode=login">Login</a>
        </div>

        <div className="footer-social">
          <p className="footer-title">Connect</p>
          <div className="social-icons">
            <a href="https://instagram.com" target="_blank" rel="noreferrer">
              <Globe size={18} />
              Instagram
              <ArrowUpRight size={14} />
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <Globe size={18} />
              GitHub
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} CampusTV. For student educational purposes only.</p>
      </div>
    </footer>
  );
}
