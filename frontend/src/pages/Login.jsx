// ================================================================
// Login Page
// Full-screen login form. No sidebar or topbar.
// On success, redirects to the page the user was trying to reach
// (via location.state.from) or to the dashboard.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import './Login.css';

export default function Login() {
  const { user, login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, skip login screen
  if (!loading && user) {
    const dest = location.state?.from?.pathname || '/';
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(username, password);
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-mark">T</div>
          <h1 className="login-brand-title">Tire Shop POS</h1>
          <p className="login-brand-sub">DunganSoft Technologies</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="alert alert-error">{error}</div>
          )}

          <div className="login-field">
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting || !username || !password}
          >
            {submitting ? <span className="spinner" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
