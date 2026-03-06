// ================================================================
// PricingAdvisor (P5e)
// Tire pricing intelligence: suggested prices, factors, comparables
// DunganSoft Technologies, March 2026
// ================================================================

import { useState } from 'react';
import api from '../api/client.js';

const TIER_COLORS = { premium: 'badge-blue', mid: 'badge-green', economy: 'badge-gray' };

export default function PricingAdvisor() {
  const [tireId, setTireId] = useState('');
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLookup = async () => {
    if (!tireId) return;
    setLoading(true); setError(null); setAdvice(null);
    try { setAdvice(await api.get(`/pricing-advisor/${tireId}`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Pricing Advisor</h1>

      <div className="card">
        <p className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
          Enter a tire ID to get pricing recommendations based on acquisition cost, tread depth, brand tier, and recent comparable sales.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div className="form-field">
            <label className="label">Tire ID</label>
            <input type="number" value={tireId} onChange={(e) => setTireId(e.target.value)}
              placeholder="e.g. 42" style={{ width: 120 }}
              onKeyDown={(e) => e.key === 'Enter' && handleLookup()} />
          </div>
          <button className="btn btn-primary" onClick={handleLookup} disabled={loading || !tireId}>
            {loading ? <span className="spinner" /> : 'Analyze'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}

      {advice && !advice.error && (
        <div style={{ marginTop: '1rem' }}>
          {/* Tire info header */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--navy)' }}>
                  {advice.size}
                </div>
                <div style={{ fontSize: '0.9375rem' }}>
                  {advice.brand || 'Unknown'}{' '}
                  <span className={`badge ${TIER_COLORS[advice.brand_tier] || ''}`}>{advice.brand_tier}</span>{' '}
                  <span className={`badge ${advice.condition === 'new' ? 'badge-green' : 'badge-orange'}`}>{advice.condition}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>Current Price</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--navy)' }}>${Number(advice.current_price).toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Suggested price */}
          <div className="card" style={{ marginBottom: '1rem', border: '2px solid var(--navy)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Suggested Price</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--navy)' }}>
                ${Number(advice.suggested_price).toFixed(2)}
              </div>
              <div className="text-muted" style={{ fontSize: '0.875rem' }}>
                Range: ${Number(advice.suggested_range.min).toFixed(2)} to ${Number(advice.suggested_range.max).toFixed(2)}
              </div>
              {advice.current_price > 0 && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.875rem',
                  color: advice.suggested_price > advice.current_price ? 'var(--green)' : advice.suggested_price < advice.current_price ? 'var(--red)' : 'var(--gray)' }}>
                  {advice.suggested_price > advice.current_price ? 'Consider raising price' :
                   advice.suggested_price < advice.current_price ? 'May be overpriced' : 'Price is on target'}
                </div>
              )}
            </div>
          </div>

          {/* Factors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Pricing Factors</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Acquisition Cost</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{advice.acquisition_cost > 0 ? '$' + Number(advice.acquisition_cost).toFixed(2) : 'Unknown'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tread Depth</span>
                  <span className="mono">{advice.tread_depth}/32"</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tread Life Remaining</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{advice.factors.tread_life_pct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Brand Multiplier</span>
                  <span className="mono">{advice.factors.brand_multiplier}x</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Age Factor</span>
                  <span className="mono">{advice.factors.age_factor}x</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.875rem', color: 'var(--navy)', marginBottom: '0.75rem' }}>Comparable Sales (90 days)</h3>
              {advice.comparable_sales.sale_count > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Average Sale Price</span>
                    <span className="mono" style={{ fontWeight: 600 }}>${Number(advice.comparable_sales.avg_price).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Number of Sales</span>
                    <span className="mono">{advice.comparable_sales.sale_count}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Period</span>
                    <span>{advice.comparable_sales.period}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>No comparable sales found for this size and condition in the last 90 days.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
