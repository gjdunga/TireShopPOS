// ================================================================
// API Client
// Fetch wrapper for the Tire Shop POS REST API.
//
// Handles:
//   Bearer token injection from stored session
//   JSON envelope unwrap ({ success, data, error })
//   Structured error objects for UI consumption
//   401 interception (triggers logout)
//
// DunganSoft Technologies, March 2026
// ================================================================

const API_BASE = '/api/index.php';

// Session token is stored in memory only (not localStorage).
// Survives page navigation via React state but clears on hard refresh.
// That is intentional: the PHP session has a sliding window;
// re-authentication on tab close is the expected security posture.
let _token = null;
let _onAuthExpired = null; // callback set by AuthContext

export function setToken(token) {
  _token = token;
}

export function getToken() {
  return _token;
}

export function clearToken() {
  _token = null;
}

export function onAuthExpired(cb) {
  _onAuthExpired = cb;
}

// ---- ApiError ----

export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;    // HTTP status
    this.code = code;        // e.g. "NOT_AUTHENTICATED", "FORBIDDEN"
    this.details = details;  // optional server payload
  }
}

// ---- Core request function ----

async function request(method, path, body = null, options = {}) {
  const url = `${API_BASE}${path}`;

  const headers = {
    'Accept': 'application/json',
  };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  const fetchOpts = {
    method,
    headers,
  };

  if (body !== null && method !== 'GET') {
    // Support FormData for file uploads (no Content-Type; browser sets boundary)
    if (body instanceof FormData) {
      fetchOpts.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }
  }

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server. Check your connection.');
  }

  // Handle non-JSON responses (should not happen, but defensive)
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) {
      throw new ApiError(res.status, 'UNEXPECTED_RESPONSE', `Server returned ${res.status}`);
    }
    // For 204 No Content or similar
    return null;
  }

  const envelope = await res.json();

  // Intercept auth expiry globally
  if (res.status === 401 && _onAuthExpired) {
    clearToken();
    _onAuthExpired();
    throw new ApiError(401, envelope.error?.code || 'NOT_AUTHENTICATED', 'Session expired');
  }

  // Unwrap the JSON envelope
  if (envelope.success) {
    return envelope.data;
  }

  // Error path: PHP returns { success: false, error: true, code: '...', message: '...' }
  const code = envelope.code || 'UNKNOWN';
  const message = envelope.message || `Request failed (${res.status})`;
  throw new ApiError(res.status, code, message, envelope);
}

// ---- Convenience methods ----

export const api = {
  get:    (path, opts) => request('GET', path, null, opts),
  post:   (path, body, opts) => request('POST', path, body, opts),
  put:    (path, body, opts) => request('PUT', path, body, opts),
  patch:  (path, body, opts) => request('PATCH', path, body, opts),
  delete: (path, opts) => request('DELETE', path, null, opts),
};

export default api;
