// ================================================================
// ReportsDashboard (P2g)
// Reporting suite with Chart.js charts.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
import './Reports.css';

ChartJS.register(
  CategoryScale, LinearScale,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
);

const NAVY = '#1A2744';
const RED = '#C9202F';
const GREEN = '#2B7A3A';
const ORANGE = '#E67E22';
const BLUE = '#3498DB';
const PURPLE = '#8E44AD';
const CREAM = '#FFF7ED';
const COLORS = [NAVY, RED, GREEN, ORANGE, BLUE, PURPLE, '#1ABC9C', '#F39C12', '#E74C3C', '#9B59B6', '#2ECC71', '#34495E'];

const chartFont = { family: "'Bitter', serif" };
const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { font: chartFont } }, tooltip: { titleFont: chartFont, bodyFont: chartFont } },
  scales: {
    x: { ticks: { font: chartFont } },
    y: { ticks: { font: chartFont } },
  },
};

function dollarOptions(title) {
  return {
    ...defaultOptions,
    plugins: {
      ...defaultOptions.plugins,
      title: { display: !!title, text: title, font: { ...chartFont, size: 14, weight: 'bold' }, color: NAVY },
    },
    scales: {
      ...defaultOptions.scales,
      y: { ...defaultOptions.scales.y, ticks: { ...defaultOptions.scales.y.ticks, callback: (v) => '$' + v.toLocaleString() } },
    },
  };
}

function pieOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { font: chartFont, boxWidth: 12, padding: 10 } },
      title: { display: !!title, text: title, font: { ...chartFont, size: 14, weight: 'bold' }, color: NAVY },
    },
  };
}

export default function ReportsDashboard() {
  const [tab, setTab] = useState('inventory');
  const TABS = [
    { key: 'inventory', label: 'Inventory' },
    { key: 'sales', label: 'Sales' },
    { key: 'topsellers', label: 'Top Sellers' },
    { key: 'services', label: 'Services' },
    { key: 'fees', label: 'Quarterly Fees' },
    { key: 'employees', label: 'Employees' },
    { key: 'warranties', label: 'Warranty Claims' },
    { key: 'lookup', label: 'Plate Lookup' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Reports</h1>

      <div className="report-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'sales' && <SalesTab />}
        {tab === 'topsellers' && <TopSellersTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'fees' && <QuarterlyFeesTab />}
        {tab === 'employees' && <EmployeesTab />}
        {tab === 'warranties' && <WarrantyClaimsTab />}
        {tab === 'lookup' && <LookupTab />}
      </div>
    </div>
  );
}


// ================================================================
// Inventory Tab
// ================================================================
function InventoryTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/inventory-stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) return <Loading />;

  const condChart = {
    labels: (stats.by_condition || []).map((c) => c.condition === 'new' ? 'New' : 'Used'),
    datasets: [{ data: (stats.by_condition || []).map((c) => Number(c.cnt)), backgroundColor: [NAVY, ORANGE] }],
  };

  const brandChart = {
    labels: (stats.by_brand || []).map((b) => b.brand_name),
    datasets: [{ label: 'Count', data: (stats.by_brand || []).map((b) => Number(b.cnt)), backgroundColor: COLORS.slice(0, (stats.by_brand || []).length), borderRadius: 3 }],
  };

  const agingChart = {
    labels: (stats.aging || []).map((a) => a.age_bucket),
    datasets: [{ data: (stats.aging || []).map((a) => Number(a.cnt)), backgroundColor: [GREEN, BLUE, ORANGE, RED] }],
  };

  return (
    <div className="report-grid">
      <div className="report-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h3 className="report-card-title" style={{ alignSelf: 'flex-start' }}>Summary</h3>
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: NAVY, fontFamily: "'Oswald', sans-serif" }}>{stats.total_count}</div>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>Available Tires</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: GREEN, marginTop: '0.5rem' }}>
            ${Number(stats.total_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-muted" style={{ fontSize: '0.875rem' }}>Total Retail Value</div>
        </div>
      </div>

      <div className="report-card">
        <h3 className="report-card-title">By Condition</h3>
        <div className="chart-container"><Pie data={condChart} options={pieOptions()} /></div>
      </div>

      <div className="report-card report-card-wide">
        <h3 className="report-card-title">By Brand (Top 15)</h3>
        <div className="chart-container"><Bar data={brandChart} options={{
          ...defaultOptions,
          indexAxis: 'y',
          plugins: { ...defaultOptions.plugins, legend: { display: false } },
        }} /></div>
      </div>

      <div className="report-card">
        <h3 className="report-card-title">Inventory Aging</h3>
        <div className="chart-container"><Doughnut data={agingChart} options={pieOptions()} /></div>
      </div>
    </div>
  );
}



// ================================================================
// Services Tab
// ================================================================
function ServicesTab() {
  const [services, setServices] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/service-usage'),
      api.get('/reports/active-warranties'),
    ])
      .then(([svc, war]) => { setServices(svc.report || []); setWarranties(war.warranties || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const svcChart = {
    labels: services.map((s) => s.service_name || s.service_code),
    datasets: [{ label: 'Usage Count', data: services.map((s) => Number(s.usage_count || s.total_uses || 0)),
      backgroundColor: COLORS.slice(0, services.length), borderRadius: 3 }],
  };

  return (
    <div className="report-grid">
      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Service Usage</h3>
        {services.length === 0 ? <p className="text-muted">No service data.</p> : (
          <div className="chart-container"><Bar data={svcChart} options={{
            ...defaultOptions,
            plugins: { ...defaultOptions.plugins, legend: { display: false } },
          }} /></div>
        )}
      </div>

      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Active Warranties ({warranties.length})</h3>
        {warranties.length === 0 ? <p className="text-muted">No active warranties.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Reference</th><th>Customer</th><th>Tire</th><th>Expires</th></tr></thead>
            <tbody>
              {warranties.slice(0, 20).map((w) => (
                <tr key={w.line_id}>
                  <td className="mono">{w.reference_number}</td>
                  <td>{w.first_name} {w.last_name}</td>
                  <td>{w.tire_description}</td>
                  <td className="mono">{w.warranty_expires_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// ================================================================
// Plate Lookup Cost Tab
// ================================================================
function LookupTab() {
  const [data, setData] = useState([]);
  const [providerData, setProviderData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/lookup-cost').catch(() => ({ data: [] })),
      api.get('/reports/lookup-monthly').catch(() => ({ data: [] })),
    ]).then(([cost, monthly]) => {
      setData(cost.data || []);
      setProviderData(monthly.data || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const costChart = {
    labels: data.map((d) => d.month),
    datasets: [
      { label: 'API Cost', data: data.map((d) => Number(d.api_cost)), backgroundColor: RED, borderRadius: 3 },
      { label: 'Cache Hits', data: data.map((d) => Number(d.cache_hits)), backgroundColor: GREEN, borderRadius: 3 },
      { label: 'API Calls', data: data.map((d) => Number(d.api_calls)), backgroundColor: ORANGE, borderRadius: 3 },
    ],
  };

  const totalCost = data.reduce((s, d) => s + Number(d.api_cost), 0);
  const totalLookups = data.reduce((s, d) => s + Number(d.lookup_count), 0);
  const totalCache = data.reduce((s, d) => s + Number(d.cache_hits), 0);
  const hitRate = totalLookups > 0 ? ((totalCache / totalLookups) * 100).toFixed(1) : '0.0';

  return (
    <div className="report-grid">
      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Plate Lookup Cost Tracking</h3>
        <div className="chart-container"><Bar data={costChart} options={dollarOptions()} /></div>
      </div>

      <div className="report-card">
        <h3 className="report-card-title">Lookup Summary</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
          <StatBox label="Total Lookups" value={totalLookups} />
          <StatBox label="API Calls ($0.05 each)" value={data.reduce((s, d) => s + Number(d.api_calls), 0)} />
          <StatBox label="Cache Hits (free)" value={totalCache} />
          <StatBox label="Cache Hit Rate" value={hitRate + '%'} color={GREEN} />
          <StatBox label="Total API Cost" value={'$' + totalCost.toFixed(2)} color={RED} />
        </div>
      </div>

      {providerData.length > 0 && (
        <div className="report-card" style={{ gridColumn: '1 / -1' }}>
          <h3 className="report-card-title">Per-Provider Breakdown</h3>
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Month</th><th>Provider</th><th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Success</th><th style={{ textAlign: 'right' }}>Failed</th><th style={{ textAlign: 'right' }}>Avg ms</th><th style={{ textAlign: 'right' }}>Cost</th></tr></thead>
            <tbody>
              {providerData.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.month}</td>
                  <td style={{ fontWeight: 500 }}>{r.api_provider || 'unknown'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.total_calls}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>{r.successful_calls}</td>
                  <td className="mono" style={{ textAlign: 'right', color: r.failed_calls > 0 ? 'var(--red)' : '' }}>{r.failed_calls}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{Number(r.avg_response_ms || 0).toFixed(0)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>${Number(r.total_cost_usd || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ================================================================
// Sales Tab
// ================================================================
function SalesTab() {
  const [period, setPeriod] = useState('daily');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/sales-summary?period=${period}`)
      .then((d) => setData(d.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <Loading />;

  const totalRevenue = data.reduce((s, d) => s + Number(d.total_revenue || 0), 0);
  const totalTax = data.reduce((s, d) => s + Number(d.total_tax || 0), 0);
  const totalWOs = data.reduce((s, d) => s + Number(d.wo_count || 0), 0);

  return (
    <div className="report-grid">
      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="report-card-title" style={{ margin: 0 }}>Sales Summary</h3>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {['daily', 'weekly', 'monthly'].map((p) => (
              <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPeriod(p)} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>{p}</button>
            ))}
          </div>
        </div>
        {data.length === 0 ? <p className="text-muted">No data for this period.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Period</th><th style={{ textAlign: 'right' }}>WOs</th><th style={{ textAlign: 'right' }}>Materials</th><th style={{ textAlign: 'right' }}>Labor</th><th style={{ textAlign: 'right' }}>Fees</th><th style={{ textAlign: 'right' }}>Tax</th><th style={{ textAlign: 'right' }}>Revenue</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.label}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.wo_count}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>${Number(r.total_materials || 0).toFixed(2)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>${Number(r.total_labor || 0).toFixed(2)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>${Number(r.total_fees || 0).toFixed(2)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>${Number(r.total_tax || 0).toFixed(2)}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>${Number(r.total_revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: '2rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
          <StatBox label="Total Work Orders" value={totalWOs} />
          <StatBox label="Total Revenue" value={'$' + totalRevenue.toFixed(2)} color={GREEN} />
          <StatBox label="Total Tax" value={'$' + totalTax.toFixed(2)} />
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Top Sellers Tab
// ================================================================
function TopSellersTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/top-selling-tires?limit=${limit}`)
      .then((d) => setData(d.tires || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) return <Loading />;

  return (
    <div className="report-grid">
      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="report-card-title" style={{ margin: 0 }}>Top Selling Tires (90 days)</h3>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ fontSize: '0.8rem' }}>
            <option value={5}>Top 5</option><option value={10}>Top 10</option><option value={25}>Top 25</option>
          </select>
        </div>
        {data.length === 0 ? <p className="text-muted">No tire sales data available.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>#</th><th>Size</th><th>Brand</th><th>Model</th><th style={{ textAlign: 'right' }}>Sold</th><th style={{ textAlign: 'right' }}>Avg Price</th></tr></thead>
            <tbody>
              {data.map((t, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="mono">{t.full_size_string || 'N/A'}</td>
                  <td>{t.brand_name || 'Unknown'}</td>
                  <td>{t.model || ''}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>{t.sold_count}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>${Number(t.avg_price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Quarterly Fees Tab
// ================================================================
function QuarterlyFeesTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/quarterly-fees?year=${year}&quarter=${quarter}`)
      .then((d) => setData(d.fees || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [year, quarter]);

  if (loading) return <Loading />;

  const total = data.reduce((s, d) => s + Number(d.fee_total || 0), 0);

  return (
    <div className="report-grid">
      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="report-card-title" style={{ margin: 0 }}>Quarterly Fee Report (CDPHE)</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ fontSize: '0.8rem' }}>
              {[now.getFullYear(), now.getFullYear() - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} style={{ fontSize: '0.8rem' }}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
        </div>
        {data.length === 0 ? <p className="text-muted">No fee data for this quarter.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Fee Code</th><th>Description</th><th style={{ textAlign: 'right' }}>Count</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.fee_key}</td>
                  <td>{r.fee_label}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{r.fee_count}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>${Number(r.fee_total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
          <StatBox label="Quarter Total" value={'$' + total.toFixed(2)} color={NAVY} />
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Employees Tab
// ================================================================
function EmployeesTab() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users').then((d) => { setUsers(d.users || []); if ((d.users || []).length > 0) setSelected(d.users[0].user_id); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    const start = new Date(); start.setDate(start.getDate() - 30);
    api.get(`/reports/employee-activity?user_id=${selected}&start=${start.toISOString().slice(0, 10)}&end=${new Date().toISOString().slice(0, 10)}`)
      .then((d) => setData(d.activity || []))
      .catch(() => setData([]));
  }, [selected]);

  if (loading) return <Loading />;

  return (
    <div className="report-grid">
      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="report-card-title" style={{ margin: 0 }}>Employee Activity (30 days)</h3>
          <select value={selected || ''} onChange={(e) => setSelected(Number(e.target.value))} style={{ fontSize: '0.8rem' }}>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.display_name || u.username}</option>)}
          </select>
        </div>
        {data.length === 0 ? <p className="text-muted">No activity for this user.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Date</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {data.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td className="mono">{(r.created_at || '').slice(0, 16)}</td>
                  <td>{r.action_type}</td>
                  <td>{r.entity_type}</td>
                  <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Warranty Claims Tab
// ================================================================
function WarrantyClaimsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/warranty-claims')
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (!data) return <p className="text-muted">Unable to load warranty claims report.</p>;

  return (
    <div className="report-grid">
      <div className="report-card" style={{ gridColumn: '1 / -1' }}>
        <h3 className="report-card-title">Warranty Claims Summary</h3>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <StatBox label="Filed" value={data.filed || 0} />
          <StatBox label="Approved" value={data.approved || 0} color={GREEN} />
          <StatBox label="Denied" value={data.denied || 0} color={RED} />
          <StatBox label="Total Paid" value={'$' + Number(data.paid || 0).toFixed(2)} color={NAVY} />
        </div>
      </div>
    </div>
  );
}


// ================================================================
// Shared
// ================================================================
function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><span className="spinner" /></div>;
}

function StatBox({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#777', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color || NAVY, fontFamily: "'Oswald', sans-serif" }}>{value}</div>
    </div>
  );
}
