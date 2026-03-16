// ================================================================
// UserManagement
// User CRUD, role assignment, account lock/unlock, force password reset.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.get('/users'), api.get('/roles')])
      .then(([u, r]) => { setUsers(u.users || []); setRoles(r.roles || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUnlock = async (id) => {
    try { await api.post(`/users/${id}/unlock`); setMsg('User unlocked.'); load(); }
    catch (e) { setError(e.message); }
  };

  const handleForceReset = async (id) => {
    try { await api.post(`/users/${id}/force-password-reset`); setMsg('Password reset forced. User must change password on next login.'); load(); }
    catch (e) { setError(e.message); }
  };

  const handleToggleActive = async (user) => {
    try {
      await api.patch(`/users/${user.user_id}`, { is_active: user.is_active ? 0 : 1 });
      setMsg(user.is_active ? 'User deactivated.' : 'User activated.');
      load();
    } catch (e) { setError(e.message); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>User Management</h1>
        <button className="btn btn-primary btn-sm" onClick={() => { setCreating(true); setEditing(null); }}>+ New User</button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

      {(creating || editing) && (
        <UserForm
          user={editing}
          roles={roles}
          onSaved={(m) => { setMsg(m); setCreating(false); setEditing(null); load(); }}
          onError={setError}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}

      <table className="entity-table" style={{ fontSize: '0.85rem', width: '100%' }}>
        <thead>
          <tr>
            <th>Username</th>
            <th>Display Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.user_id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
              <td className="mono">{u.username}</td>
              <td>{u.display_name || (u.first_name ? `${u.first_name} ${u.last_name}` : '')}</td>
              <td>{u.role_name || 'N/A'}</td>
              <td>
                {u.is_active ? (
                  <span style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.75rem' }}>Active</span>
                ) : (
                  <span style={{ color: '#999', fontWeight: 600, fontSize: '0.75rem' }}>Inactive</span>
                )}
                {u.locked_until && new Date(u.locked_until) > new Date() && (
                  <span style={{ color: 'var(--red)', fontWeight: 600, fontSize: '0.75rem', marginLeft: '0.5rem' }}>LOCKED</span>
                )}
                {u.force_password_change ? (
                  <span style={{ color: '#e65100', fontWeight: 600, fontSize: '0.75rem', marginLeft: '0.5rem' }}>PWD Reset</span>
                ) : null}
              </td>
              <td className="mono" style={{ fontSize: '0.75rem' }}>{u.last_login_at ? u.last_login_at.slice(0, 16) : 'Never'}</td>
              <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }}
                    onClick={() => { setEditing(u); setCreating(false); }}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }}
                    onClick={() => handleToggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                  {u.locked_until && new Date(u.locked_until) > new Date() && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', color: 'var(--green)' }}
                      onClick={() => handleUnlock(u.user_id)}>Unlock</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', color: '#e65100' }}
                    onClick={() => handleForceReset(u.user_id)}>Force PWD Reset</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserForm({ user, roles, onSaved, onError, onCancel }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    display_name: user?.display_name || '',
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || '',
    role_id: user?.role_id || (roles[0]?.role_id || ''),
    password: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (isEdit) {
        const patch = { ...form };
        if (!patch.password) delete patch.password;
        await api.patch(`/users/${user.user_id}`, patch);
        onSaved('User updated.');
      } else {
        if (!form.username || !form.password) { onError('Username and password are required.'); setSaving(false); return; }
        await api.post('/users', form);
        onSaved('User created.');
      }
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid #e0e0e0' }}>
      <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>{isEdit ? 'Edit User' : 'Create User'}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
        <div className="form-field"><label className="label">Username</label>
          <input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} disabled={isEdit} /></div>
        <div className="form-field"><label className="label">Display Name</label>
          <input value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} /></div>
        <div className="form-field"><label className="label">First Name</label>
          <input value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} /></div>
        <div className="form-field"><label className="label">Last Name</label>
          <input value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} /></div>
        <div className="form-field"><label className="label">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
        <div className="form-field"><label className="label">Role</label>
          <select value={form.role_id} onChange={(e) => setForm((p) => ({ ...p, role_id: e.target.value }))}>
            {roles.map((r) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
          </select></div>
        <div className="form-field"><label className="label">{isEdit ? 'New Password (blank = no change)' : 'Password'}</label>
          <input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></div>
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving}>
          {saving ? <span className="spinner" /> : (isEdit ? 'Save Changes' : 'Create User')}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
