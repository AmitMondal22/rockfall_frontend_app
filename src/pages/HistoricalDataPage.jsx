import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { BarChart3, Filter, Download, Clock, Activity, Zap, Battery, Signal, Mountain, Users as UserIcon, Move, Heart } from 'lucide-react';
import { HistoricalSkeleton } from '../components/Skeleton';

const eventColors = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e' };
const eventIcons = { ROCKFALL: Mountain, HUMAN_ACTIVITY: UserIcon, MOTION: Move, HEARTBEAT: Heart };
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;
const energyKJ = (g2) => g2 != null ? ((g2 * 9.81 * 9.81) / 1000).toFixed(4) : null;

export default function HistoricalDataPage() {
    const [deviceId, setDeviceId] = useState('');
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState('7d');
    const [eventType, setEventType] = useState('');
    const [events, setEvents] = useState([]);
    const [stats, setStats] = useState({ peakG: [], battery: [], alertFrequency: [] });
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { api.devices.getAll().then(d => { setDevices(d.devices || []); if (d.devices?.length) setDeviceId(d.devices[0]._id); setLoading(false); }).catch(e => { console.error(e); setLoading(false); }); }, []);

    useEffect(() => {
        if (!deviceId) return;
        api.historical.getEvents(deviceId, { range, eventType: eventType || undefined, limit: '200' }).then(d => setEvents(d.events || [])).catch(() => setEvents([]));
        api.historical.getStats(deviceId, { range, window: range === '24h' ? '1h' : range === '1h' ? '5m' : '6h' }).then(s => setStats(s)).catch(() => { });
    }, [deviceId, range, eventType]);

    const peakData = (stats.peakG || []).map(p => ({ time: new Date(p._time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: p._value }));
    const battData = (stats.battery || []).map(p => ({ time: new Date(p._time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: battPct(p._value) ?? p._value }));
    const alertData = (stats.alertFrequency || []).map(p => ({ time: new Date(p._time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), value: p._value }));

    // Theme-aware chart styling
    const chart = {
        grid: isDark ? '#222' : '#e5e5e5',
        tick: isDark ? '#666' : '#999',
        line: isDark ? '#fff' : '#111',
        tooltipBg: isDark ? '#111' : '#fff',
        tooltipBorder: isDark ? '#333' : '#e0e0e0',
        tooltipColor: isDark ? '#fff' : '#111',
        gradientStart: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(17,17,17,0.1)',
        gradientEnd: isDark ? 'rgba(255,255,255,0)' : 'rgba(17,17,17,0)',
    };

    const inputCls = `px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    if (loading) return <HistoricalSkeleton />;

    // Stats summary
    const totalEvents = events.length;
    const rockfalls = events.filter(e => e.event_type === 'ROCKFALL').length;
    const maxPeakG = events.reduce((m, e) => Math.max(m, e.peak_g || 0), 0);
    const avgBattery = events.length ? (events.reduce((s, e) => s + (battPct(e.battery) || 0), 0) / events.length).toFixed(1) : 0;

    const summaryCards = [
        { label: 'Total Events', value: totalEvents, icon: Activity, color: isDark ? 'text-white' : 'text-[#111]' },
        { label: 'Rockfall Events', value: rockfalls, icon: Mountain, color: 'text-danger' },
        { label: 'Max Peak G', value: maxPeakG.toFixed(2), icon: Zap, color: 'text-warning' },
        { label: 'Avg Battery', value: `${avgBattery}%`, icon: Battery, color: 'text-success' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Historical Data</h1><p className="text-text-muted text-sm mt-1">Time series analytics from InfluxDB</p></div>
                <button className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${isDark ? 'border-[#333] text-text-muted hover:text-white hover:bg-surface-3' : 'border-[#e0e0e0] text-[#666] hover:text-[#111] hover:bg-[#f0f0f0]'}`}>
                    <Download className="w-4 h-4" /> Export
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4 bg-surface border border-border rounded-2xl p-4">
                <Filter className="w-5 h-5 text-text-muted" />
                <select value={deviceId} onChange={e => setDeviceId(e.target.value)} className={`flex-1 ${inputCls}`}>
                    {devices.map(d => <option key={d._id} value={d._id}>{d.name} ({d._id})</option>)}
                </select>
                <select value={range} onChange={e => setRange(e.target.value)} className={inputCls}>
                    {[['1h', 'Last 1 Hour'], ['6h', 'Last 6 Hours'], ['24h', 'Last 24 Hours'], ['7d', 'Last 7 Days'], ['30d', 'Last 30 Days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={eventType} onChange={e => setEventType(e.target.value)} className={inputCls}>
                    <option value="">All Events</option>{['ROCKFALL', 'HUMAN_ACTIVITY', 'MOTION', 'HEARTBEAT'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {summaryCards.map(s => (
                    <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 hover:border-border-light transition">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-text-muted text-xs">{s.label}</span>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Peak G */}
                <div className="bg-surface border border-border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold">Peak G Over Time</h2>
                        <span className="text-text-dim text-xs">{peakData.length} data points</span>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={peakData}>
                            <defs>
                                <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={chart.line} stopOpacity={0.15} />
                                    <stop offset="100%" stopColor={chart.line} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                            <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                            <YAxis tick={{ fill: chart.tick, fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, color: chart.tooltipColor, fontSize: 12 }} />
                            <Area type="monotone" dataKey="value" stroke={chart.line} strokeWidth={2} fill="url(#peakFill)" dot={false} name="Peak G" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Battery */}
                <div className="bg-surface border border-border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold">Battery Trend</h2>
                        <span className="text-text-dim text-xs">{battData.length} data points</span>
                    </div>
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={battData}>
                            <defs>
                                <linearGradient id="battFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                            <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                            <YAxis tick={{ fill: chart.tick, fontSize: 11 }} domain={[0, 100]} />
                            <Tooltip contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, color: chart.tooltipColor, fontSize: 12 }} />
                            <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} fill="url(#battFill)" dot={false} name="Battery %" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Alert Frequency Bar Chart */}
            <div className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">Alert Frequency</h2>
                    <span className="text-text-dim text-xs">{alertData.length} intervals</span>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={alertData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                        <XAxis dataKey="time" tick={{ fill: chart.tick, fontSize: 11 }} />
                        <YAxis tick={{ fill: chart.tick, fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`, borderRadius: 8, color: chart.tooltipColor, fontSize: 12 }} />
                        <Bar dataKey="value" fill="#ef4444" radius={[6, 6, 0, 0]} name="Alerts" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Event Log */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-text-muted" />
                    <h2 className="font-semibold">Event Log</h2>
                    <span className="text-text-dim text-xs ml-auto">{events.length} events</span>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: '480px' }}>
                    <table className="w-full text-sm">
                        <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#111]' : 'bg-white'}`}>
                            <tr className="text-text-muted text-xs border-b border-border">
                                {['Time', 'Event Type', 'Peak G', 'Duration (ms)', 'Peaks', 'Energy (g²)', 'Energy (kJ)', 'Battery', 'CSQ'].map(h => <th key={h} className="px-5 py-3 text-left font-medium">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {events.slice(0, 100).map((e, i) => {
                                const Icon = eventIcons[e.event_type] || Activity;
                                const color = eventColors[e.event_type] || (isDark ? '#999' : '#666');
                                return (
                                    <tr key={i} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-5 py-3 text-text-muted text-xs whitespace-nowrap">{(e.ts || e._time) ? new Date(e.ts || e._time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}</td>
                                        <td className="px-5 py-3">
                                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                                                <Icon className="w-3.5 h-3.5" />{e.event_type || '--'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-mono font-semibold">{e.peak_g ?? '--'}</td>
                                        <td className="px-5 py-3">{e.duration_ms ?? '--'}</td>
                                        <td className="px-5 py-3">{e.peaks ?? '--'}</td>
                                        <td className="px-5 py-3">{e.energy_g2 ?? '--'}</td>
                                        <td className="px-5 py-3">{energyKJ(e.energy_g2) ?? '--'}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-12 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                                                    <div className={`h-full rounded-full ${(battPct(e.battery) ?? 0) < 20 ? 'bg-danger' : (battPct(e.battery) ?? 0) < 50 ? 'bg-warning' : 'bg-success'}`}
                                                        style={{ width: `${Math.min(battPct(e.battery) ?? 0, 100)}%` }} />
                                                </div>
                                                <span className="text-xs">{battPct(e.battery) ?? '--'}%</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-1">
                                                <Signal className="w-3 h-3 text-text-dim" />{e.csq ?? '--'}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {events.length === 0 && <p className="text-center text-text-dim py-12">No events found for selected filters</p>}
                </div>
            </div>
        </div >
    );
}
