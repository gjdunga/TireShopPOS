// ================================================================
// NotFound (404) - shown inside the SPA when React Router has no match
// DunganSoft Technologies, March 2026
// ================================================================

import { Link, useLocation } from 'react-router-dom';

export default function NotFound() {
  const location = useLocation();

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: '2rem',
    }}>
      <div style={{
        background: '#fff', borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(26,39,68,0.1)',
        padding: '3rem 2.5rem', maxWidth: '440px', width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '5rem', fontWeight: 600, color: 'var(--red)',
          lineHeight: 1, letterSpacing: '-0.03em',
          fontFamily: 'var(--font-heading)',
        }}>404</div>

        <div style={{
          width: '48px', height: '3px', background: 'var(--red)',
          margin: '1rem auto', borderRadius: '2px',
        }} />

        <h1 style={{
          fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem',
          letterSpacing: '0.02em', fontFamily: 'var(--font-heading)',
          color: 'var(--navy)',
        }}>PAGE NOT FOUND</h1>

        <p style={{
          fontFamily: 'Georgia, serif', fontSize: '0.9375rem',
          color: 'var(--gray)', lineHeight: 1.6, marginBottom: '0.5rem',
        }}>
          Nothing exists at <code style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
            background: '#f5f5f5', padding: '0.15rem 0.4rem',
            borderRadius: '3px',
          }}>{location.pathname}</code>
        </p>

        <p style={{
          fontFamily: 'Georgia, serif', fontSize: '0.875rem',
          color: '#999', lineHeight: 1.6, marginBottom: '1.5rem',
        }}>
          Check the URL or use the sidebar to navigate.
        </p>

        <Link to="/" className="btn btn-primary" style={{
          padding: '0.6rem 1.75rem', fontSize: '0.875rem',
          letterSpacing: '0.04em',
        }}>Back to Dashboard</Link>
      </div>
    </div>
  );
}
