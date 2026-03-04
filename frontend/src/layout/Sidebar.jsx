// ================================================================
// Sidebar
// Left navigation panel with module groups.
// Items are filtered by permission: if the user lacks all
// permissions in a group, the entire group is hidden.
//
// DunganSoft Technologies, March 2026
// ================================================================

import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import './Sidebar.css';

// Navigation structure.
// Each group: { label, items: [{ label, path, icon, need? }] }
// "need" is a permission key or array (any). Omit for always-visible.
const NAV = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: '\u25A3' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Tire Search',    path: '/tires',       icon: '\u25CE', need: 'INVENTORY_VIEW' },
      { label: 'Customers',      path: '/customers',   icon: '\u2605', need: 'CUSTOMER_MANAGE' },
      { label: 'Vehicles',       path: '/vehicles',    icon: '\u25B7', need: 'VEHICLE_MANAGE' },
      { label: 'Work Orders',    path: '/work-orders', icon: '\u2692', need: ['WORK_ORDER_CREATE', 'WORK_ORDER_ASSIGN'] },
      { label: 'Invoices',       path: '/invoices',    icon: '\u25A1', need: 'INVOICE_CREATE' },
    ],
  },
  {
    label: 'Shop',
    items: [
      { label: 'Cash Drawer',    path: '/cash-drawer',   icon: '\u2338', need: ['CASH_DRAWER_OPEN', 'CASH_DRAWER_CLOSE'] },
      { label: 'Appointments',   path: '/appointments',  icon: '\u25F7', need: 'APPOINTMENT_MANAGE' },
      { label: 'Purchase Orders', path: '/purchase-orders', icon: '\u2263', need: ['PO_CREATE', 'PO_RECEIVE'] },
      { label: 'Refunds',        path: '/refunds',       icon: '\u21A9', need: ['REFUND_REQUEST', 'REFUND_APPROVE'] },
      { label: 'Quotes',         path: '/quotes',        icon: '\u2696', need: 'INVOICE_CREATE' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Reports',   path: '/reports',  icon: '\u25E4', need: 'REPORT_VIEW' },
      { label: 'Audit Log', path: '/audit',    icon: '\u2630', need: 'AUDIT_VIEW' },
      { label: 'Users',     path: '/users',    icon: '\u2302', need: 'USER_MANAGE' },
    ],
  },
];

export default function Sidebar() {
  const { can, canAny } = useAuth();

  // Filter items by permission
  const visibleGroups = NAV.map((group) => {
    const items = group.items.filter((item) => {
      if (!item.need) return true;
      if (Array.isArray(item.need)) return canAny(...item.need);
      return can(item.need);
    });
    return { ...group, items };
  }).filter((group) => group.items.length > 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">T</span>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">Tire Shop</span>
          <span className="sidebar-brand-sub">POS</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <div key={group.label} className="sidebar-group">
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                }
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer-text">DunganSoft Technologies</span>
      </div>
    </aside>
  );
}
