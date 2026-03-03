// ================================================================
// AppShell
// Main layout component for authenticated pages.
// Renders Sidebar (fixed left), Topbar (fixed top), and
// a scrollable content area for the active route via <Outlet />.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import './AppShell.css';

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
