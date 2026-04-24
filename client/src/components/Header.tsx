import { Link, useNavigate } from "react-router-dom";

type HeaderProps = {
  isLoggedIn: boolean;
  onLogout?: () => void;
};

export function Header({ isLoggedIn, onLogout }: HeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="main-header">
      <div className="header-container">
        <Link to="/" className="logo">
          <span className="logo-icon">📺</span>
          <span className="logo-text">CampusTV</span>
        </Link>

        <nav className="main-nav">
          <a href="/">Home</a>
          <a href="/#features">Features</a>
          <a href="/#about">About</a>
        </nav>

        <div className="header-actions">
          {isLoggedIn ? (
            <>
              <button className="secondary-button" onClick={() => navigate("/app")}>Dashboard</button>
              <button className="ghost-button" onClick={onLogout}>Logout</button>
            </>
          ) : (
            <>
              <button className="ghost-button" onClick={() => navigate("/auth?mode=login")}>Login</button>
              <button className="primary-button" onClick={() => navigate("/auth?mode=register")}>Sign Up</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
