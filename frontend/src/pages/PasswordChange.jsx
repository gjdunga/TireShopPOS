// ================================================================
// PasswordChange Page
// Shown when force_password_change is true.
// Requires current password + new password (with confirmation).
// Validates: min 8 chars, upper + lower + digit.
// On success, calls onPasswordChanged() to clear the force flag
// and load permissions, then redirects to dashboard.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import api from '../api/client.js';

export default function PasswordChange() {
  const { user, onPasswordChanged } = useAuth();
  const navigate = useNavigate();

  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    if (newPw.length < 8) return 'New password must be at least 8 characters.';
    if (!/[A-Z]/.test(newPw)) return 'New password must contain an uppercase letter.';
    if (!/[a-z]/.test(newPw)) return 'New password must contain a lowercase letter.';
    if (!/[0-9]/.test(newPw)) return 'New password must contain a digit.';
    if (newPw !== confirm) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const vErr = validate();
    if (vErr) { setError(vErr); return; }

    setError(null);
    setSubmitting(true);

    try {
      await api.post('/auth/password', {
        current_password: current,
        new_password: newPw,
      });
      await onPasswordChanged();
      navigate('/', { replace: true });
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
          <h1 className="login-brand-title">Change Password</h1>
          <p className="login-brand-sub" style={{ maxWidth: 260, margin: '0.25rem auto 0' }}>
            {user?.username === 'admin'
              ? 'Default admin password must be changed before continuing.'
              : 'Your administrator requires you to change your password.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="login-field">
            <label className="label" htmlFor="current-pw">Current Password</label>
            <input
              id="current-pw"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label className="label" htmlFor="new-pw">New Password</label>
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="login-field">
            <label className="label" htmlFor="confirm-pw">Confirm New Password</label>
            <input
              id="confirm-pw"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting || !current || !newPw || !confirm}
          >
            {submitting ? <span className="spinner" /> : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
