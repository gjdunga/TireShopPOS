// ================================================================
// ReportsDashboard (P2g)
// Reporting suite with Chart.js charts.
// DunganSoft Technologies, March 2026
// ================================================================

import { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import './Reports.css';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
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
  const [tab, setTab] = useState('sales');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Reports</h1>

      <div className="report-tabs">
        {['sales', 'inventory', 'cash', 'fees', 'services', 'lookup'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t === 'lookup' ? 'Plate Lookup' : t}
          </button>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        {tab === 'sales' && <SalesTab />}
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'cash' && <CashTab />}
        {tab === 'fees' && <FeesTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'lookup' && <LookupTab />}
      </div>
    </div>
  );
}


// ================================================================
// Sales Tab
// ================================================================
function SalesTab() {
  const [period, setPeriod] = useState('daily');
  const [data, setData] = useState([]);
  const [payments, setPayments] = useState([]);
  const [topTires, setTopTires] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/reports/sales-summary?period=${period}`),
      api.get('/reports/payment-methods'),
      api.get('/reports/top-selling-tires?limit=10'),
    ])
      .then(([sales, pay, tires]) => {
        setData(sales.data || []);
        setPayments(pay.breakdown || []);
        setTopTires(tires.tires || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <Loading />;

  const revenueChart = {
    labels: data.map((d) => d.label),
    datasets: [
      { label: 'Revenue', data: data.map((d) => Number(d.total_revenue)), borderColor: NAVY, backgroundColor: 'rgba(26,39,68,0.1)', fill: true, tension: 0.3 },
      { label: 'Collected', data: data.map((d) => Number(d.total_collected)), borderColor: GREEN, backgroundColor: 'transparent', tension: 0.3 },
    ],
  };

  const invoiceChart = {
    labels: data.map((d) => d.label),
    datasets: [
      { label: 'Invoices', data: data.map((d) => Number(d.invoice_count)), backgroundColor: NAVY, borderRadius: 3 },
    ],
  };

  const paymentChart = {
    labels: payments.map((p) => (p.payment_method || '').replace(/_/g, ' ')),
    datasets: [{
      data: payments.map((p) => Number(p.total_amount)),
      backgroundColor: COLORS.slice(0, payments.length),
    }],
  };

  return (
    <div>
      <div className="report-period-bar">
        {['daily', 'weekly', 'monthly'].map((p) => (
          <button key={p} className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setPeriod(p)} style={{ textTransform: 'capitalize' }}>{p}</button>
        ))}
      </div>

      <div className="report-grid">
        <div className="report-card report-card-wide">
          <h3 className="report-card-title">Revenue Trend</h3>
          <div className="chart-container"><Line data={revenueChart} options={dollarOptions()} /></div>
        </div>

        <div className="report-card">
          <h3 className="report-card-title">Invoice Count</h3>
          <div className="chart-container"><Bar data={invoiceChart} options={{
            ...defaultOptions,
            plugins: { ...defaultOptions.plugins, legend: { display: false } },
          }} /></div>
        </div>

        <div className="report-card">
          <h3 className="report-card-title">Payment Methods</h3>
          <div className="chart-container"><Doughnut data={paymentChart} options={pieOptions()} /></div>
        </div>

        <div className="report-card report-card-wide">
          <h3 className="report-card-title">Top Selling Tires (90 days)</h3>
          {topTires.length === 0 ? <p className="text-muted">No tire sales data.</p> : (
            <table className="entity-table">
              <thead><tr><th>Size</th><th>Brand</th><th>Model</th><th>Sold</th><th>Avg Price</th></tr></thead>
              <tbody>
                {topTires.map((t, i) => (
                  <tr key={i}>
                    <td className="mono">{t.full_size_string}</td>
                    <td>{t.brand_name || '\u2014'}</td>
                    <td>{t.model || '\u2014'}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{t.sold_count}</td>
                    <td className="mono">${Number(t.avg_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
// Cash Reconciliation Tab
// ================================================================
function CashTab() {
  const [drawers, setDrawers] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/cash-reconciliation'),
      api.get('/reports/outstanding-deposits'),
      api.get('/refunds/pending').catch(() => ({ refunds: [] })),
    ])
      .then(([cash, dep, ref]) => {
        setDrawers(cash.drawers || []);
        setDeposits(dep.deposits || []);
        setRefunds(ref.refunds || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const varianceData = {
    labels: drawers.map((d) => d.drawer_date),
    datasets: [
      { label: 'Variance', data: drawers.map((d) => Number(d.variance || 0)),
        backgroundColor: drawers.map((d) => Number(d.variance || 0) === 0 ? GREEN : RED),
        borderRadius: 3 },
    ],
  };

  return (
    <div className="report-grid">
      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Cash Drawer Variance (30 days)</h3>
        <div className="chart-container"><Bar data={varianceData} options={dollarOptions()} /></div>
      </div>

      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Drawer History</h3>
        {drawers.length === 0 ? <p className="text-muted">No drawer records.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Date</th><th>Opened By</th><th>Opening</th><th>Expected</th><th>Counted</th><th>Variance</th><th>Status</th></tr></thead>
            <tbody>
              {drawers.map((d) => (
                <tr key={d.drawer_id}>
                  <td className="mono">{d.drawer_date}</td>
                  <td>{d.opened_by_name}</td>
                  <td className="mono">${Number(d.opening_balance).toFixed(2)}</td>
                  <td className="mono">{d.expected_balance != null ? '$' + Number(d.expected_balance).toFixed(2) : '\u2014'}</td>
                  <td className="mono">{d.closing_count != null ? '$' + Number(d.closing_count).toFixed(2) : '\u2014'}</td>
                  <td className="mono" style={{ fontWeight: 600,
                    color: d.variance == null ? 'inherit' : Number(d.variance) === 0 ? GREEN : RED }}>
                    {d.variance != null ? '$' + Number(d.variance).toFixed(2) : '\u2014'}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="report-card">
        <h3 className="report-card-title">Outstanding Deposits ({deposits.length})</h3>
        {deposits.length === 0 ? <p className="text-muted">No active deposits.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>ID</th><th>Amount</th><th>Expires</th></tr></thead>
            <tbody>
              {deposits.slice(0, 15).map((d) => (
                <tr key={d.deposit_id}>
                  <td className="mono">{d.deposit_id}</td>
                  <td className="mono">${Number(d.amount).toFixed(2)}</td>
                  <td className="mono">{d.expires_at?.slice(0, 10) || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="report-card">
        <h3 className="report-card-title">Pending Refunds ({refunds.length})</h3>
        {refunds.length === 0 ? <p className="text-muted">No pending refunds.</p> : (
          <table className="entity-table" style={{ fontSize: '0.8125rem' }}>
            <thead><tr><th>Invoice</th><th>Amount</th><th>Reason</th></tr></thead>
            <tbody>
              {refunds.slice(0, 10).map((r) => (
                <tr key={r.refund_id}>
                  <td className="mono">{r.invoice_number || r.invoice_id}</td>
                  <td className="mono" style={{ color: RED }}>${Number(r.amount).toFixed(2)}</td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</td>
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
// Fees / Tax / CDPHE Tab
// ================================================================
function FeesTab() {
  const [quarterly, setQuarterly] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/reports/quarterly-fees'),
      api.get('/reports/monthly-tax'),
    ])
      .then(([q, m]) => { setQuarterly(q); setMonthly(m); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const qReport = quarterly?.report || {};

  return (
    <div className="report-grid">
      <div className="report-card report-card-wide">
        <h3 className="report-card-title">CDPHE Quarterly Fee Report (Q{quarterly?.quarter} {quarterly?.year})</h3>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <StatBox label="New Tires Sold" value={qReport.new_tires_sold || 0} />
          <StatBox label="Used Tires Sold" value={qReport.used_tires_sold || 0} />
          <StatBox label="New Tire Fees" value={'$' + Number(qReport.new_tire_fee_total || 0).toFixed(2)} />
          <StatBox label="Used Tire Fees" value={'$' + Number(qReport.used_tire_fee_total || 0).toFixed(2)} />
          <StatBox label="Disposal Fees" value={'$' + Number(qReport.disposal_fee_total || 0).toFixed(2)} />
          <StatBox label="Total Fees Due" value={'$' + Number(qReport.total_fees_due || 0).toFixed(2)} color={RED} />
        </div>
        <p style={{ fontSize: '0.75rem', color: '#777' }}>
          Report generated per CDPHE quarterly filing requirements for tire recycling fees (C.R.S. 25-17-202).
          Maintain this report for audit compliance.
        </p>
      </div>

      <div className="report-card report-card-wide">
        <h3 className="report-card-title">Monthly Tax Breakdown ({monthly?.year}-{String(monthly?.month).padStart(2, '0')})</h3>
        {monthly?.breakdown ? (
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <StatBox label="Taxable Sales" value={'$' + Number(monthly.breakdown.taxable_total || 0).toFixed(2)} />
            <StatBox label="Non-Taxable" value={'$' + Number(monthly.breakdown.nontaxable_total || 0).toFixed(2)} />
            <StatBox label="Tax Collected" value={'$' + Number(monthly.breakdown.tax_collected || 0).toFixed(2)} color={RED} />
            <StatBox label="Fee Total" value={'$' + Number(monthly.breakdown.fee_total || 0).toFixed(2)} />
          </div>
        ) : <p className="text-muted">No data for this month.</p>}
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
