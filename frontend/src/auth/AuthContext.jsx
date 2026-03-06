// ================================================================
// AuthContext
// React context providing authentication state and helpers.
//
// State shape:
//   user        { user_id, username, display_name, role_name }
//   permissions  Set<string> of permission keys (e.g. "INVENTORY_VIEW")
//   loading      true while initial session check is in flight
//   error        string or null
//   forcePasswordChange  boolean
//
// Exposed helpers:
//   login(username, password)   returns user or throws
//   logout()                    clears session
//   can(key)                    boolean permission check
//   canAny(...keys)             OR check
//   canAll(...keys)             AND check
//
// DunganSoft Technologies, March 2026
// ================================================================

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api, setToken, clearToken, onAuthExpired } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

  // ---- Clear all auth state ----
  const clearAuth = useCallback(() => {
    clearToken();
    setUser(null);
    setPermissions(new Set());
    setForcePasswordChange(false);
    setError(null);
  }, []);

  // Wire up the global 401 handler
  useEffect(() => {
    onAuthExpired(() => {
      clearAuth();
    });
  }, [clearAuth]);

  // ---- Load permissions for current user ----
  const loadPermissions = useCallback(async (roleName) => {
    try {
      // GET /api/roles returns all roles; find ours and fetch its permissions
      const roles = await api.get('/roles');
      const myRole = roles.find((r) => r.role_name === roleName);
      if (myRole) {
        const perms = await api.get(`/roles/${myRole.role_id}/permissions`);
        setPermissions(new Set(perms.map((p) => p.permission_key)));
      }
    } catch (err) {
      // Non-fatal: user still authenticated, just no client-side perm cache.
      // Server enforces RBAC regardless.
      console.warn('Failed to load permissions:', err.message);
    }
  }, []);

  // ---- Login ----
  const login = useCallback(async (username, password) => {
    setError(null);
    try {
      const data = await api.post('/auth/login', { username, password });
      setToken(data.token);

      // Login response shape: { token, expires_at, user: { user_id, username, display_name, role, force_password_change, permissions } }
      const u = data.user || {};
      const sessionUser = {
        user_id: u.user_id,
        username: u.username,
        display_name: u.display_name,
        role_name: u.role,  // API returns "role", context uses "role_name"
      };
      setUser(sessionUser);

      if (u.force_password_change) {
        setForcePasswordChange(true);
      } else {
        setForcePasswordChange(false);
        // Use permissions from login response if available, else load from roles API
        if (Array.isArray(u.permissions) && u.permissions.length > 0) {
          setPermissions(new Set(u.permissions));
        } else {
          await loadPermissions(sessionUser.role_name);
        }
      }

      return sessionUser;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [loadPermissions]);

  // ---- Logout ----
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Best effort; clear local state regardless
    }
    clearAuth();
  }, [clearAuth]);

  // ---- Password changed: clear force flag, load permissions ----
  const onPasswordChanged = useCallback(async () => {
    setForcePasswordChange(false);
    if (user) {
      await loadPermissions(user.role_name);
    }
  }, [user, loadPermissions]);

  // ---- Initial session check ----
  // On mount, try to validate any existing session.
  // Since tokens are in-memory only, this will only succeed if
  // the page was navigated (not hard-refreshed).
  useEffect(() => {
    const checkSession = async () => {
      try {
        const data = await api.get('/auth/session');
        if (data && data.user_id) {
          const roleName = data.role || data.role_name;
          setUser({
            user_id: data.user_id,
            username: data.username,
            display_name: data.display_name,
            role_name: roleName,
          });
          if (data.force_password_change) {
            setForcePasswordChange(true);
          } else {
            // Use permissions from session response if available
            if (Array.isArray(data.permissions) && data.permissions.length > 0) {
              setPermissions(new Set(data.permissions));
            } else {
              await loadPermissions(roleName);
            }
          }
        }
      } catch (err) {
        // No valid session; stay logged out (not an error condition)
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, [loadPermissions]);

  // ---- Permission helpers ----
  const can = useCallback((key) => permissions.has(key), [permissions]);
  const canAny = useCallback((...keys) => keys.some((k) => permissions.has(k)), [permissions]);
  const canAll = useCallback((...keys) => keys.every((k) => permissions.has(k)), [permissions]);

  const value = useMemo(() => ({
    user,
    permissions,
    loading,
    error,
    forcePasswordChange,
    login,
    logout,
    onPasswordChanged,
    can,
    canAny,
    canAll,
  }), [user, permissions, loading, error, forcePasswordChange, login, logout, onPasswordChanged, can, canAny, canAll]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
