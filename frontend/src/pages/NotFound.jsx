// ================================================================
// NotFound (404)
// DunganSoft Technologies, March 2026
// ================================================================

import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', color: 'var(--red)', marginBottom: '0.5rem' }}>404</h1>
      <p style={{ fontSize: '1.125rem', color: 'var(--gray)', marginBottom: '1.5rem' }}>
        Page not found.
      </p>
      <Link to="/" className="btn btn-secondary">Back to Dashboard</Link>
    </div>
  );
}
