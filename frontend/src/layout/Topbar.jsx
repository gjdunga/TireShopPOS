// ================================================================
// Topbar
// Horizontal bar at the top of the content area.
// Shows current page context, user info, role badge, logout.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { useAuth } from '../auth/AuthContext.jsx';
import './Topbar.css';

const ROLE_BADGES = {
  owner:     'badge-owner',
  manager:   'badge-manager',
  tire_tech: 'badge-tech',
};

export default function Topbar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const badgeClass = ROLE_BADGES[user.role_name] || 'badge-tech';
  const displayRole = user.role_name === 'tire_tech' ? 'Technician'
    : user.role_name.charAt(0).toUpperCase() + user.role_name.slice(1);

  return (
    <header className="topbar">
      <div className="topbar-left">
        {/* Breadcrumb or page title will be injected here by pages */}
      </div>

      <div className="topbar-right">
        <div className="topbar-user">
          <span className="topbar-user-name">{user.display_name || user.username}</span>
          <span className={`badge ${badgeClass}`}>{displayRole}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
