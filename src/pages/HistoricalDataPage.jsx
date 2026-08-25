import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { BarChart3, Filter, Download, Clock, Activity, Zap, Battery, Signal, Mountain, Users as UserIcon, Move, Heart, Layers, BarChart2, TrendingUp, Calendar, AlertTriangle } from 'lucide-react';
import { HistoricalSkeleton } from '../components/Skeleton';

const eventColors = {
    ROCKFALL: '#ef4444',
    HUMAN_ACTIVITY: '#f59e0b',
    HUMAN: '#f59e0b',
    MOTION: '#3b82f6',
    HEARTBEAT: '#10b981',
    OTHER: '#8b5cf6',
    ALERTS: '#e11d48'
};

const eventIcons = {
    ROCKFALL: Mountain,
    HUMAN_ACTIVITY: UserIcon,
    HUMAN: UserIcon,
    MOTION: Move,
    HEARTBEAT: Heart,
    OTHER: Activity
};

const battPct = (v) => (v != null && !isNaN(Number(v))) ? Math.max(0, Math.min(Math.round((Number(v) / 13) * 100), 100)) : null;
const energyKJ = (g2) => g2 != null ? ((g2 * 9.81 * 9.81) / 1000).toFixed(4) : null;

export default function HistoricalDataPage() {
    const [deviceId, setDeviceId] = useState('');
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState('7d');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [eventType, setEventType] = useState('');
    const [events, setEvents] = useState([]);
    const [stats, setStats] = useState({ peakG: [], battery: [], alertFrequency: [], eventFrequency: [] });
    const [freqChartType, setFreqChartType] = useState('stacked'); // 'stacked' | 'grouped' | 'area'

    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => {
        api.devices.getAll()
            .then(d => {
                const devs = d.devices || [];
                setDevices(devs);
                if (devs.length) setDeviceId(devs[0]._id || devs[0].id);
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!deviceId) return;
        const eventParams = { limit: '300' };
        if (eventType) eventParams.eventType = eventType;

        const statsParams = {};

        if (range === 'custom' || fromDate || toDate) {
            if (fromDate) { eventParams.fromDate = fromDate; statsParams.fromDate = fromDate; }
            if (toDate) { eventParams.toDate = toDate; statsParams.toDate = toDate; }
            eventParams.range = 'custom';
            statsParams.range = 'custom';
            statsParams.window = '6h';
        } else {
            eventParams.range = range;
            statsParams.range = range;
            statsParams.window = range === '24h' ? '1h' : range === '1h' ? '5m' : '6h';
        }

        api.historical.getEvents(deviceId, eventParams).then(d => setEvents(d.events || [])).catch(() => setEvents([]));
        api.historical.getStats(deviceId, statsParams).then(s => setStats(s || {})).catch(() => { });
    }, [deviceId, range, eventType, fromDate, toDate]);

    const handleExportCSV = () => {
        if (!events.length) return;
        const headers = ['Time', 'Device ID', 'Event Type', 'Peak G', 'Duration (ms)', 'Peaks', 'Energy (g²)', 'Energy (kJ)', 'Battery', 'CSQ'];
        const rows = events.map(e => [
            (e.timestamp || e.ts || e._time || e.createdAt) ? new Date(e.timestamp || e.ts || e._time || e.createdAt).toISOString() : '',
            e.uid || deviceId,
            e.event_type || '',
            e.peak_g ?? '',
            e.duration_ms ?? '',
            e.peaks ?? '',
            e.energy_g2 ?? '',
            energyKJ(e.energy_g2) ?? '',
            battPct(e.battery) ?? e.battery ?? '',
            e.csq ?? ''
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `historical_${deviceId}_${fromDate || 'start'}_to_${toDate || 'end'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDateLabel = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        if (range === '1h' || range === '24h') {
            return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };

    const peakData = useMemo(() => {
        return (stats.peakG || []).map(p => ({
            time: formatDateLabel(p._time || p.time || p.timestamp),
            rawTime: new Date(p._time || p.time || p.timestamp).getTime(),
            value: parseFloat(p._value ?? p.value ?? 0)
        })).filter(p => !isNaN(p.rawTime));
    }, [stats.peakG, range]);

    const battData = useMemo(() => {
        let rawList = (stats.battery && stats.battery.length > 0) ? stats.battery : events.map(e => ({
            _time: e.timestamp || e.ts || e._time || e.createdAt,
            value: e.battery
        })).filter(e => e.value != null);

        return rawList.map(p => {
            const rawV = parseFloat(p._value ?? p.value ?? 0);
            const pct = Math.max(0, Math.min(Math.round((rawV / 13) * 100), 100));
            const rawTime = new Date(p._time || p.time || p.timestamp).getTime();
            return {
                time: formatDateLabel(p._time || p.time || p.timestamp),
                rawTime,
                voltage: rawV.toFixed(2),
                value: pct,
                pct
            };
        }).filter(p => !isNaN(p.rawTime)).sort((a, b) => a.rawTime - b.rawTime);
    }, [stats.battery, events, range]);

    // Frequency data aggregated from backend eventFrequency or derived from local events
    const frequencyData = useMemo(() => {
        if (stats.eventFrequency && stats.eventFrequency.length > 0) {
            return stats.eventFrequency.map(ef => ({
                time: formatDateLabel(ef.time || ef._time),
                rawTime: new Date(ef.time || ef._time).getTime(),
                rockfall: ef.rockfall || 0,
                motion: ef.motion || 0,
                human: ef.human || 0,
                heartbeat: ef.heartbeat || 0,
                other: ef.other || 0,
                alerts: ef.alerts || 0,
                total: ef.total || 0
            }));
        }

        // Fallback aggregation from raw events
        const buckets = {};
        events.forEach(e => {
            const timeVal = e.timestamp || e.ts || e._time || e.createdAt;
            if (!timeVal) return;
            const d = new Date(timeVal);
            if (isNaN(d.getTime())) return;
            const key = range === '24h' || range === '1h'
                ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '00', hour12: false })
                : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

            if (!buckets[key]) {
                buckets[key] = { time: key, rawTime: d.getTime(), rockfall: 0, motion: 0, human: 0, heartbeat: 0, other: 0, alerts: 0, total: 0 };
            }
            const t = (e.event_type || 'OTHER').toUpperCase();
            buckets[key].total++;
            if (t.includes('ROCK')) buckets[key].rockfall++;
            else if (t.includes('HUMAN')) buckets[key].human++;
            else if (t.includes('MOTION')) buckets[key].motion++;
            else if (t.includes('HEART')) buckets[key].heartbeat++;
            else buckets[key].other++;
        });

        return Object.values(buckets).sort((a, b) => a.rawTime - b.rawTime);
    }, [stats.eventFrequency, events, range]);

    // Theme-aware chart styling
    const chart = {
        grid: isDark ? '#222' : '#e5e5e5',
        tick: isDark ? '#666' : '#999',
        line: isDark ? '#fff' : '#111',
        tooltipBg: isDark ? '#111' : '#fff',
        tooltipBorder: isDark ? '#333' : '#e0e0e0',
        tooltipColor: isDark ? '#fff' : '#111',
    };

    const inputCls = `px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    if (loading) return <HistoricalSkeleton />;

    // Stats summary
    const totalEvents = events.length;
    const rockfalls = events.filter(e => String(e.event_type || '').toUpperCase().includes('ROCK')).length;
    const maxPeakG = events.reduce((m, e) => Math.max(m, parseFloat(e.peak_g || 0)), 0);
    const avgBattery = events.length ? (events.reduce((s, e) => s + (battPct(e.battery) || 0), 0) / events.length).toFixed(1) : 0;

    const summaryCards = [
        { label: 'Total Events', value: totalEvents, icon: Activity, color: isDark ? 'text-white' : 'text-[#111]' },
        { label: 'Rockfall Impacts', value: rockfalls, icon: Mountain, color: 'text-danger' },
        { label: 'Max Peak Force', value: `${maxPeakG.toFixed(3)} G`, icon: Zap, color: 'text-amber-500' },
        { label: 'Avg Battery', value: `${avgBattery}%`, icon: Battery, color: 'text-emerald-500' },
    ];

    // Custom Tooltip for Event & Alert Frequency
    const CustomFrequencyTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className={`p-3.5 rounded-xl border shadow-xl ${isDark ? 'bg-[#111] border-[#333] text-white' : 'bg-white border-gray-200 text-black'}`}>
                    <p className="font-bold text-xs mb-2 flex items-center justify-between gap-4">
                        <span>{label}</span>
                        <span className="text-text-dim font-mono text-[10px]">Total: {d.total || 0}</span>
                    </p>
                    <div className="space-y-1.5 text-xs">
                        {d.rockfall > 0 && (
                            <div className="flex items-center justify-between gap-3 text-rose-500">
                                <span className="flex items-center gap-1.5 font-medium">🪨 Rockfall:</span>
                                <b className="font-mono">{d.rockfall}</b>
                            </div>
                        )}
                        {d.motion > 0 && (
                            <div className="flex items-center justify-between gap-3 text-blue-500">
                                <span className="flex items-center gap-1.5 font-medium">🔄 Motion:</span>
                                <b className="font-mono">{d.motion}</b>
                            </div>
                        )}
                        {d.human > 0 && (
                            <div className="flex items-center justify-between gap-3 text-amber-500">
                                <span className="flex items-center gap-1.5 font-medium">🚶 Human Activity:</span>
                                <b className="font-mono">{d.human}</b>
                            </div>
                        )}
                        {d.heartbeat > 0 && (
                            <div className="flex items-center justify-between gap-3 text-emerald-500">
                                <span className="flex items-center gap-1.5 font-medium">💚 Heartbeat:</span>
                                <b className="font-mono">{d.heartbeat}</b>
                            </div>
                        )}
                        {d.other > 0 && (
                            <div className="flex items-center justify-between gap-3 text-purple-500">
                                <span className="flex items-center gap-1.5 font-medium">⚡ Telemetry:</span>
                                <b className="font-mono">{d.other}</b>
                            </div>
                        )}
                        {d.alerts > 0 && (
                            <div className="flex items-center justify-between gap-3 text-rose-400 pt-1 border-t border-border/30">
                                <span className="flex items-center gap-1.5 font-medium">🚨 Triggered Alerts:</span>
                                <b className="font-mono">{d.alerts}</b>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    // Custom Tooltip for Battery Level
    const CustomBatteryTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            const volt = d.voltage ?? ((d.value * 13) / 100).toFixed(2);
            return (
                <div className={`p-3 rounded-xl border shadow-xl ${isDark ? 'bg-[#111] border-[#333] text-white' : 'bg-white border-gray-200 text-black'}`}>
                    <p className="font-bold text-xs mb-1.5">{label}</p>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-500 font-bold font-mono text-base">{d.value}%</span>
                        <span className="text-text-dim text-[11px] font-mono">({volt} V / 13.0 V)</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Historical Data</h1>
                    <p className="text-text-muted text-sm mt-0.5">Time series analytics, event classification & frequency distribution</p>
                </div>
                <button
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-border bg-surface hover:bg-surface-2 transition shadow-sm self-start sm:self-auto"
                >
                    <Download className="w-4 h-4" /> Export CSV Log
                </button>
            </div>

            {/* Filters Toolbar */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-text-muted" />
                    <span className="text-xs font-semibold text-text-muted">Filters:</span>
                </div>

                <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className={`flex-1 min-w-[180px] ${inputCls}`}>
                    {devices.map(d => <option key={d._id || d.id} value={d._id || d.id}>{d.name} ({d._id || d.id})</option>)}
                </select>

                <select
                    value={range}
                    onChange={e => {
                        const val = e.target.value;
                        setRange(val);
                        if (val !== 'custom') {
                            setFromDate('');
                            setToDate('');
                        }
                    }}
                    className={inputCls}
                >
                    {[['1h', 'Last 1 Hour'], ['6h', 'Last 6 Hours'], ['24h', 'Last 24 Hours'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days'], ['all', 'All Recorded History'], ['custom', 'Custom Date Range']].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                    ))}
                </select>

                <div className="flex items-center gap-2">
                    <label className="text-xs text-text-muted whitespace-nowrap">From:</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={e => {
                            setFromDate(e.target.value);
                            setRange('custom');
                        }}
                        className={inputCls}
                    />
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-xs text-text-muted whitespace-nowrap">To:</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={e => {
                            setToDate(e.target.value);
                            setRange('custom');
                        }}
                        className={inputCls}
                    />
                </div>

                <select value={eventType} onChange={e => setEventType(e.target.value)} className={inputCls}>
                    <option value="">All Event Types</option>
                    {['ROCKFALL', 'HUMAN_ACTIVITY', 'MOTION', 'HEARTBEAT'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                {(fromDate || toDate) && (
                    <button
                        onClick={() => {
                            setFromDate('');
                            setToDate('');
                            setRange('7d');
                        }}
                        className="px-3 py-2 text-xs font-semibold text-danger hover:bg-rose-500/10 border border-rose-500/20 rounded-xl transition"
                    >
                        Reset Dates
                    </button>
                )}
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {summaryCards.map(s => (
                    <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-text-muted text-xs font-medium">{s.label}</span>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Event & Alert Frequency Categorized Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-indigo-400" />
                            <h2 className="font-semibold text-sm md:text-base">Event & Incident Frequency Distribution</h2>
                        </div>
                        <p className="text-xs text-text-dim mt-0.5">Categorized breakdown of rockfalls, motion, human activity, and alerts over time</p>
                    </div>

                    {/* Chart Style Switcher */}
                    <div className="flex items-center bg-surface-2 border border-border rounded-xl p-0.5 self-start sm:self-auto">
                        <button
                            onClick={() => setFreqChartType('stacked')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${freqChartType === 'stacked' ? (isDark ? 'bg-white text-black shadow' : 'bg-black text-white shadow') : 'text-text-muted hover:text-text'}`}
                        >
                            <Layers className="w-3.5 h-3.5" /> Stacked Bar
                        </button>
                        <button
                            onClick={() => setFreqChartType('grouped')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${freqChartType === 'grouped' ? (isDark ? 'bg-white text-black shadow' : 'bg-black text-white shadow') : 'text-text-muted hover:text-text'}`}
                        >
                            <BarChart2 className="w-3.5 h-3.5" /> Grouped
                        </button>
                        <button
                            onClick={() => setFreqChartType('area')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${freqChartType === 'area' ? (isDark ? 'bg-white text-black shadow' : 'bg-black text-white shadow') : 'text-text-muted hover:text-text'}`}
                        >
                            <TrendingUp className="w-3.5 h-3.5" /> Area Trend
                        </button>
                    </div>
                </div>

                <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        {freqChartType === 'area' ? (
                            <AreaChart data={frequencyData}>
                                <defs>
                                    <linearGradient id="areaRockfall" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="areaMotion" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                                <YAxis tick={{ fill: chart.tick, fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomFrequencyTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Area type="monotone" dataKey="rockfall" name="Rockfall" stroke="#ef4444" fill="url(#areaRockfall)" strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="motion" name="Motion" stroke="#3b82f6" fill="url(#areaMotion)" strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="human" name="Human" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="alerts" name="Alerts" stroke="#e11d48" fill="#e11d48" fillOpacity={0.2} strokeWidth={2} />
                            </AreaChart>
                        ) : (
                            <BarChart data={frequencyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                                <YAxis tick={{ fill: chart.tick, fontSize: 11 }} allowDecimals={false} />
                                <Tooltip content={<CustomFrequencyTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                <Bar
                                    dataKey="rockfall"
                                    name="Rockfall"
                                    fill="#ef4444"
                                    stackId={freqChartType === 'stacked' ? 'a' : undefined}
                                    radius={freqChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="motion"
                                    name="Motion"
                                    fill="#3b82f6"
                                    stackId={freqChartType === 'stacked' ? 'a' : undefined}
                                    radius={freqChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="human"
                                    name="Human Activity"
                                    fill="#f59e0b"
                                    stackId={freqChartType === 'stacked' ? 'a' : undefined}
                                    radius={freqChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="heartbeat"
                                    name="Heartbeat"
                                    fill="#10b981"
                                    stackId={freqChartType === 'stacked' ? 'a' : undefined}
                                    radius={freqChartType === 'stacked' ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                                />
                                <Bar
                                    dataKey="alerts"
                                    name="Alerts"
                                    fill="#e11d48"
                                    radius={[4, 4, 0, 0]}
                                />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Peak G and Battery Trends Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Peak G */}
                <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <h2 className="font-semibold text-sm">Peak Impact G Force Over Time</h2>
                        </div>
                        <span className="text-text-dim text-xs font-mono">{peakData.length} intervals</span>
                    </div>
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={peakData}>
                                <defs>
                                    <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                                <YAxis tick={{ fill: chart.tick, fontSize: 11 }} unit=" G" />
                                <Tooltip contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, color: chart.tooltipColor, fontSize: 12 }} />
                                <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#peakFill)" dot={false} name="Peak Force (G)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Battery */}
                <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Battery className="w-4 h-4 text-emerald-400" />
                            <h2 className="font-semibold text-sm">Battery Level Trend (0–13V Calibrated)</h2>
                        </div>
                        <span className="text-text-dim text-xs font-mono">{battData.length} intervals</span>
                    </div>
                    <div style={{ width: '100%', height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={battData}>
                                <defs>
                                    <linearGradient id="battFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                                <YAxis tick={{ fill: chart.tick, fontSize: 11 }} domain={[0, 100]} unit="%" />
                                <Tooltip content={<CustomBatteryTooltip />} />
                                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#battFill)" dot={false} name="Battery %" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Event Log Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-text-muted" />
                        <h2 className="font-semibold text-sm">Detailed Event Log</h2>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-surface-2 border border-border rounded-lg text-text-muted">
                        {events.length} Records
                    </span>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: '480px' }}>
                    <table className="w-full text-sm">
                        <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#111]' : 'bg-white'}`}>
                            <tr className="text-text-muted text-xs border-b border-border">
                                {['Time', 'Event Type', 'Peak G', 'Duration (ms)', 'Peaks', 'Energy (g²)', 'Energy (kJ)', 'Battery', 'Signal'].map(h => (
                                    <th key={h} className="px-5 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {events.slice(0, 150).map((e, i) => {
                                const evtType = (e.event_type || 'OTHER').toUpperCase();
                                const Icon = eventIcons[evtType] || Activity;
                                const color = eventColors[evtType] || (isDark ? '#999' : '#666');
                                return (
                                    <tr key={i} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-5 py-3 text-text-muted text-xs whitespace-nowrap">
                                            {(e.timestamp || e.ts || e._time || e.createdAt)
                                                ? new Date(e.timestamp || e.ts || e._time || e.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                : '--'}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color }}>
                                                <Icon className="w-3.5 h-3.5" />{e.event_type || '--'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-mono font-semibold">{e.peak_g != null ? `${parseFloat(e.peak_g).toFixed(3)} G` : '--'}</td>
                                        <td className="px-5 py-3 font-mono text-xs">{e.duration_ms != null ? `${e.duration_ms} ms` : '--'}</td>
                                        <td className="px-5 py-3 font-mono text-xs">{e.peaks ?? '--'}</td>
                                        <td className="px-5 py-3 font-mono text-xs text-amber-500">{e.energy_g2 ?? '--'}</td>
                                        <td className="px-5 py-3 font-mono text-xs">{energyKJ(e.energy_g2) != null ? `${energyKJ(e.energy_g2)} kJ` : '--'}</td>
                                        <td className="px-5 py-3 text-xs">{battPct(e.battery) != null ? `${battPct(e.battery)}%` : '--'}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1 text-xs">
                                                <Signal className="w-3.5 h-3.5 text-text-dim" />{e.csq != null ? `${Math.round((e.csq / 31) * 100)}%` : '--'}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {events.length === 0 && <p className="text-center text-text-dim py-12 text-xs">No events found for selected filters</p>}
                </div>
            </div>
        </div>
    );
}
