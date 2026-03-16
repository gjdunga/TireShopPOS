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

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Reports</h1>

      <div className="report-tabs">
        {['inventory', 'services', 'lookup'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t === 'lookup' ? 'Plate Lookup' : t}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'services' && <ServicesTab />}
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
            <thead><tr><th>Invoice</th><th>Customer</th><th>Tire</th><th>Expires</th></tr></thead>
            <tbody>
              {warranties.slice(0, 20).map((w) => (
                <tr key={w.line_id}>
                  <td className="mono">{w.invoice_number}</td>
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reports/lookup-cost')
      .then((d) => setData(d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
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
