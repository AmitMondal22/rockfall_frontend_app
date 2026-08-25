import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Gauge,
  Printer,
  RefreshCw,
  ShieldCheck,
  Zap,
  Calendar,
  Filter,
  Download,
  Clock,
  Layers,
  MapPin,
  Cpu,
  Battery,
  Signal,
  Mountain,
  ChevronRight,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  AlertOctagon
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { api } from '../services/api';
import { useTheme } from '../hooks/useTheme';

const REPORT_TYPES = [
  { id: 'CUSTOM_RANGE', name: 'Custom Date Range', desc: 'Custom start and end date interval report.' },
  { id: 'DAILY', name: 'Daily Summary', desc: 'Impact and telemetry activity for a single selected day.' },
  { id: 'WEEKLY', name: 'Weekly Report', desc: '7-day overview starting from selected date.' },
  { id: 'MONTHLY', name: 'Monthly Statistics', desc: 'Full calendar month activity and trend analysis.' },
  { id: 'ANNUAL_COMPLIANCE', name: 'Annual Compliance Record', desc: 'Long-term geotechnical monitoring audit for the year.' },
  { id: 'BARRIER_PERFORMANCE', name: 'Barrier Impact Performance', desc: 'Peak impact forces, kinetic energy dissipation & structural review.' },
  { id: 'INCIDENT', name: 'Incident Audit Report', desc: 'Detailed log of rockfalls, threshold exceedances, and alerts.' },
  { id: 'MAINTENANCE', name: 'Sensor Maintenance Evidence', desc: 'Telemetry uptime, power levels, and RF communication stability.' },
  { id: 'ALL_TIME', name: 'Full Historical Archive', desc: 'Complete dataset across all recorded device telemetry.' }
];

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN');
const formatNumber = (value) => NUMBER_FORMAT.format(Number(value) || 0);

const localInputDate = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatMeasure = (value, digits = 3) => (
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString('en-IN', { maximumFractionDigits: digits })
);

const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const formatPeriodDate = (value, timeZone = 'Asia/Kolkata') => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function MetricCard({ icon: Icon, label, value, helper, tone, borderTone = 'border-border' }) {
  return (
    <div className={`rounded-2xl border ${borderTone} bg-surface p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-text">{value}</p>
          <p className="mt-1 text-[11px] text-text-dim">{helper}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl shrink-0 ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState('CUSTOM_RANGE');
  const [fromDate, setFromDate] = useState(() => localInputDate(-30));
  const [toDate, setToDate] = useState(() => localInputDate(0));
  const [targetDate, setTargetDate] = useState(() => localInputDate(0));
  const [deviceId, setDeviceId] = useState('all');
  const [devices, setDevices] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const reportRequest = useRef(0);

  // Load available devices
  useEffect(() => {
    api.devices.getAll().then(d => {
      setDevices(d.devices || []);
    }).catch(console.warn);
  }, []);

  const loadReport = useCallback(async () => {
    const requestId = ++reportRequest.current;
    setLoading(true);
    setError('');

    try {
      const params = {
        type: reportType,
        deviceId: deviceId !== 'all' ? deviceId : undefined
      };

      if (reportType === 'CUSTOM_RANGE') {
        params.fromDate = fromDate;
        params.toDate = toDate;
      } else if (reportType === 'DAILY' || reportType === 'WEEKLY' || reportType === 'MONTHLY' || reportType === 'ANNUAL_COMPLIANCE') {
        params.date = targetDate;
      }

      const data = await api.reports.generate(params);
      if (requestId === reportRequest.current) {
        setReport(data);
      }
    } catch (err) {
      if (requestId === reportRequest.current) {
        setError(err.message || 'Report data could not be loaded.');
      }
    } finally {
      if (requestId === reportRequest.current) {
        setLoading(false);
      }
    }
  }, [reportType, fromDate, toDate, targetDate, deviceId]);

  useEffect(() => {
    loadReport();
    return () => { reportRequest.current += 1; };
  }, [loadReport]);

  const summary = report?.summary || {};
  const sizeCounts = summary.sizeCounts || {};
  const eventTypes = useMemo(() => Object.entries(report?.eventTypeCounts || {}), [report]);
  const dailyBreakdown = report?.dailyBreakdown || [];
  const topIncidents = report?.topIncidents || [];
  const deviceSummaries = report?.deviceSummaries || [];

  const handleExportPDF = () => {
    setPrinting(true);
    requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
  };

  const handleExportCSV = () => {
    if (!report) return;
    const metaRows = [
      ['Report Type', report.reportType],
      ['Period Start', report.period?.start],
      ['Period End', report.period?.end],
      ['Timezone', report.period?.timezone],
      ['Total Records', summary.totalTelemetryRecords],
      ['Total Impact Events', summary.totalImpactEvents],
      ['Rockfall Events', summary.rockfallEvents],
      ['Total Alerts', summary.totalAlerts],
      ['Critical Alerts', summary.criticalAlerts],
      ['Max Peak G', summary.maxPeakG],
      ['Avg Peak G', summary.avgPeakG],
      ['Total Signal Energy (g²)', summary.totalSignalEnergyG2],
      ['Total Energy (kJ)', summary.totalEnergyKJ],
      ['Avg Battery %', summary.avgBatteryPct != null ? `${summary.avgBatteryPct}%` : 'N/A'],
      ['Small Impacts (<1.0G)', sizeCounts.small || 0],
      ['Medium Impacts (1.0-3.0G)', sizeCounts.medium || 0],
      ['Large Impacts (3.0-6.0G)', sizeCounts.large || 0],
      ['Extreme Impacts (>=6.0G)', sizeCounts.extreme || 0]
    ];

    let csvContent = '--- METADATA & SUMMARY ---\nMetric,Value\n';
    metaRows.forEach(r => {
      csvContent += `${escapeCsv(r[0])},${escapeCsv(r[1])}\n`;
    });

    csvContent += '\n--- RECORDED INCIDENTS LOG ---\n';
    csvContent += 'Timestamp,Device ID,Device Name,Location,Event Type,Peak Force (G),Duration (ms),Signal Energy (g²),Battery (%)\n';
    topIncidents.forEach(inc => {
      csvContent += `${escapeCsv(inc.timestamp)},${escapeCsv(inc.deviceId)},${escapeCsv(inc.deviceName)},${escapeCsv(inc.location)},${escapeCsv(inc.eventType)},${inc.peakG},${inc.durationMs},${inc.energyG2},${inc.battery ?? ''}\n`;
    });

    csvContent += '\n--- SENSOR NODE SUMMARIES ---\n';
    csvContent += 'Device ID,Name,Location,Total Events,Total Alerts,Max Peak G,Last Battery %,Last Seen\n';
    deviceSummaries.forEach(d => {
      csvContent += `${escapeCsv(d.deviceId)},${escapeCsv(d.name)},${escapeCsv(d.location)},${d.eventCount},${d.alertCount},${d.maxPeakG},${d.lastBattery ?? ''},${escapeCsv(d.lastSeen)}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RockFall_Report_${reportType}_${fromDate || targetDate}_to_${toDate || targetDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (preset) => {
    const today = localInputDate(0);
    if (preset === 'today') {
      setReportType('CUSTOM_RANGE');
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      setReportType('CUSTOM_RANGE');
      const y = localInputDate(-1);
      setFromDate(y);
      setToDate(y);
    } else if (preset === '7d') {
      setReportType('CUSTOM_RANGE');
      setFromDate(localInputDate(-7));
      setToDate(today);
    } else if (preset === '30d') {
      setReportType('CUSTOM_RANGE');
      setFromDate(localInputDate(-30));
      setToDate(today);
    } else if (preset === 'ytd') {
      setReportType('CUSTOM_RANGE');
      const ytd = `${new Date().getFullYear()}-01-01`;
      setFromDate(ytd);
      setToDate(today);
    } else if (preset === 'all') {
      setReportType('ALL_TIME');
      setFromDate('2020-01-01');
      setToDate(today);
    }
  };

  const chartTheme = {
    grid: isDark ? '#222' : '#e5e5e5',
    tick: isDark ? '#777' : '#999',
    tooltipBg: isDark ? '#111' : '#fff',
    tooltipBorder: isDark ? '#333' : '#e0e0e0',
    tooltipColor: isDark ? '#fff' : '#111'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
            <FileText className="h-7 w-7 text-indigo-500" /> Geotechnical Reports & Audits
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Generate database-backed monitoring reports, structural risk assessments, and compliance records with customizable date intervals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold hover:bg-surface-2 transition disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!report || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export CSV Report
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={!report || loading || printing}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-sm disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-danger" role="alert">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
          <button type="button" onClick={loadReport} className="text-xs font-semibold underline">Retry</button>
        </div>
      )}

      {/* Main Grid: Parameters Sidebar + Report Sheet */}
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Parameters Sidebar */}
        <aside className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-5 h-fit">
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <Filter className="w-4 h-4 text-indigo-400" />
              Report Configuration
            </h2>
            <p className="text-xs text-text-dim mt-0.5">Select report format and scope</p>
          </div>

          {/* Quick Date Range Presets */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-2">Quick Date Presets</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ['today', 'Today'],
                ['yesterday', 'Yesterday'],
                ['7d', '7 Days'],
                ['30d', '30 Days'],
                ['ytd', 'YTD'],
                ['all', 'All Time']
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className="px-2 py-1.5 text-[11px] font-medium rounded-lg border border-border bg-surface-2 hover:bg-surface-3 transition text-center"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Report Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-2">Report Template</label>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {REPORT_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setReportType(type.id)}
                  className={`w-full rounded-xl border p-2.5 text-left transition ${reportType === type.id ? 'border-indigo-500 bg-indigo-500/10 shadow-sm' : 'border-border bg-surface-2/60 hover:bg-surface-2'}`}
                >
                  <span className="block text-xs font-bold">{type.name}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-text-muted">{type.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Device Scope Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">Monitored Device Scope</label>
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-xs font-medium outline-none focus:border-indigo-500"
            >
              <option value="all">All Registered Devices (Entire Site)</option>
              {devices.map(d => (
                <option key={d._id || d.id} value={d._id || d.id}>
                  {d.name} ({d._id || d.id})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker Section */}
          {reportType === 'CUSTOM_RANGE' ? (
            <div className="space-y-3 pt-3 border-t border-border/50">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-xs font-medium outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          ) : (
            <div className="pt-3 border-t border-border/50">
              <label className="block text-xs font-semibold text-text-muted mb-1">Target Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-xs font-medium outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-sm disabled:opacity-50"
          >
            {loading ? 'Generating Report…' : 'Generate Report'}
          </button>
        </aside>

        {/* Report Preview & Document Sheet */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-6">
          {/* Official Document Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  Official Geotechnical Audit
                </span>
                <span className="text-xs text-text-dim font-mono">Ref: RF-{Date.now().toString().slice(-6)}</span>
              </div>
              <h2 className="mt-1.5 text-xl font-bold">
                {REPORT_TYPES.find((item) => item.id === reportType)?.name || 'Monitoring Report'}
              </h2>
              <p className="mt-1 text-xs text-text-muted flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {report?.period ? `${formatPeriodDate(report.period.start)} – ${formatPeriodDate(report.period.end)} (${report.period.timezone})` : 'Calculating interval…'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-text">Rockfall Monitoring Platform</p>
                <p className="text-[10px] text-text-dim">Kuppavalasa Site Verification</p>
              </div>
              <ShieldCheck className="h-10 w-10 text-emerald-500 shrink-0" />
            </div>
          </div>

          {loading ? (
            <div className="space-y-4 py-8" role="status" aria-label="Loading report">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />)}
              </div>
              <div className="h-56 rounded-2xl skeleton-shimmer" />
              <div className="h-64 rounded-2xl skeleton-shimmer" />
            </div>
          ) : report ? (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  icon={Activity}
                  label="Total Impact Events"
                  value={formatNumber(summary.totalImpactEvents ?? summary.totalEvents)}
                  helper={`${formatNumber(summary.totalTelemetryRecords)} telemetry signals recorded`}
                  tone="bg-indigo-500/10 text-indigo-500"
                />
                <MetricCard
                  icon={Mountain}
                  label="Rockfall Detections"
                  value={formatNumber(summary.rockfallEvents || 0)}
                  helper={`${summary.totalAlerts || 0} triggered alerts (${summary.criticalAlerts || 0} critical)`}
                  tone="bg-rose-500/10 text-rose-500"
                  borderTone="border-rose-500/30"
                />
                <MetricCard
                  icon={Gauge}
                  label="Maximum Peak Force"
                  value={`${formatMeasure(summary.maxPeakG)} G`}
                  helper={`Avg peak: ${formatMeasure(summary.avgPeakG)} G`}
                  tone="bg-amber-500/10 text-amber-500"
                />
                <MetricCard
                  icon={Zap}
                  label="Signal Energy Dissipated"
                  value={`${formatMeasure(summary.totalEnergyKJ, 2)} kJ`}
                  helper={`Cumulative ${formatMeasure(summary.totalSignalEnergyG2, 1)} g²`}
                  tone="bg-emerald-500/10 text-emerald-500"
                />
              </div>

              {/* Secondary Telemetry Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-2 p-3.5 rounded-2xl border border-border text-xs">
                <div>
                  <span className="text-text-dim text-[11px]">Avg Battery Level</span>
                  <p className="font-bold text-sm mt-0.5 text-emerald-500">{summary.avgBatteryPct != null ? `${summary.avgBatteryPct}% (0-13V)` : 'N/A'}</p>
                </div>
                <div>
                  <span className="text-text-dim text-[11px]">Signal Quality (CSQ)</span>
                  <p className="font-bold text-sm mt-0.5 text-indigo-400">{summary.avgCsq != null ? `${Math.round((summary.avgCsq / 31) * 100)}% (${summary.avgCsq}/31)` : 'N/A'}</p>
                </div>
                <div>
                  <span className="text-text-dim text-[11px]">Extreme Impacts (≥6G)</span>
                  <p className="font-bold text-sm mt-0.5 text-rose-500">{sizeCounts.extreme || 0} events</p>
                </div>
                <div>
                  <span className="text-text-dim text-[11px]">Monitoring Sites</span>
                  <p className="font-bold text-sm mt-0.5 text-text">Kuppavalasa Active</p>
                </div>
              </div>

              {/* Timeline Distribution Chart */}
              {dailyBreakdown.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface-2/40 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-400" />
                        Daily Activity & Impact Timeline
                      </h3>
                      <p className="text-xs text-text-dim mt-0.5">Recorded events and alert occurrences across time</p>
                    </div>
                    <span className="text-xs font-mono text-text-muted">{dailyBreakdown.length} days plotted</span>
                  </div>

                  <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                        <XAxis dataKey="date" tick={{ fill: chartTheme.tick, fontSize: 10 }} />
                        <YAxis tick={{ fill: chartTheme.tick, fontSize: 10 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: chartTheme.tooltipBg,
                            border: `1px solid ${chartTheme.tooltipBorder}`,
                            borderRadius: 8,
                            color: chartTheme.tooltipColor,
                            fontSize: 12
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                        <Bar dataKey="rockfall" name="Rockfall" fill="#ef4444" stackId="a" />
                        <Bar dataKey="motion" name="Motion" fill="#3b82f6" stackId="a" />
                        <Bar dataKey="human" name="Human Activity" fill="#f59e0b" stackId="a" />
                        <Bar dataKey="alerts" name="Triggered Alerts" fill="#e11d48" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Top Recorded Incidents */}
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-surface-2/60 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold">Key Recorded Impact Incidents</h3>
                    <p className="text-xs text-text-dim mt-0.5">High-energy impacts and threshold breaches detected in period</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-surface rounded-lg border border-border text-text-muted">
                    {topIncidents.length} Incidents Listed
                  </span>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2 border-b border-border text-text-muted">
                      <tr>
                        {['Timestamp', 'Device', 'Location', 'Event Type', 'Peak Force', 'Duration', 'Energy (g²)', 'Battery'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {topIncidents.map((inc) => (
                        <tr key={inc.id} className="hover:bg-surface-2 transition">
                          <td className="px-4 py-2.5 text-text-muted whitespace-nowrap font-mono">
                            {formatPeriodDate(inc.timestamp)}
                          </td>
                          <td className="px-4 py-2.5 font-bold font-mono">{inc.deviceId}</td>
                          <td className="px-4 py-2.5 text-text-dim">{inc.location}</td>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold" style={{ color: inc.eventType === 'ROCKFALL' ? '#ef4444' : '#3b82f6' }}>
                              {inc.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold">{inc.peakG} G</td>
                          <td className="px-4 py-2.5 font-mono">{inc.durationMs} ms</td>
                          <td className="px-4 py-2.5 font-mono text-amber-500">{inc.energyG2}</td>
                          <td className="px-4 py-2.5">{inc.battery != null ? `${inc.battery}%` : '--'}</td>
                        </tr>
                      ))}
                      {topIncidents.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-text-dim">
                            No high-energy impacts recorded in the selected period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sensor Node Health & Summary Table */}
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="p-4 border-b border-border bg-surface-2/60 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold">Sensor Node Operational Status</h3>
                    <p className="text-xs text-text-dim mt-0.5">Uptime, recorded events, and maximum peak force per sensor</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2 border-b border-border text-text-muted">
                      <tr>
                        {['Device ID', 'Device Name', 'Site Location', 'Event Count', 'Alerts', 'Max Peak G', 'Battery Health', 'Last Seen'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {deviceSummaries.map((dev) => (
                        <tr key={dev.deviceId} className="hover:bg-surface-2 transition">
                          <td className="px-4 py-2.5 font-mono font-bold">{dev.deviceId}</td>
                          <td className="px-4 py-2.5 font-medium">{dev.name}</td>
                          <td className="px-4 py-2.5 text-text-dim">{dev.location}</td>
                          <td className="px-4 py-2.5 font-semibold">{dev.eventCount}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${dev.alertCount > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-surface-3 text-text-dim'}`}>
                              {dev.alertCount} alerts
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold">{parseFloat(dev.maxPeakG || 0).toFixed(3)} G</td>
                          <td className="px-4 py-2.5 text-emerald-500 font-semibold">{dev.lastBattery != null ? `${dev.lastBattery}%` : '--'}</td>
                          <td className="px-4 py-2.5 text-text-dim whitespace-nowrap">{formatPeriodDate(dev.lastSeen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sign-off & Audit Verification Footer */}
              <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-text-dim gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Verified by Automated Telemetry Integrity Engine</span>
                </div>
                <span>Confidential Geotechnical Monitoring Record</span>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
