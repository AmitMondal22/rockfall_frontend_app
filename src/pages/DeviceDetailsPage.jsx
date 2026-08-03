import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import api from '../services/api';
import wsService from '../services/websocket';
import { DeviceDetailsSkeleton } from '../components/Skeleton';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Battery, Signal, Activity, Clock, Save, RotateCcw, Zap, Mountain, User as UserIcon, Move, Heart } from 'lucide-react';

const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;
const energyKJ = (g2) => g2 != null ? ((g2 * 9.81 * 9.81) / 1_000_000).toFixed(6) : null;
const EVENT_ICONS = { ROCKFALL: Mountain, HUMAN_ACTIVITY: UserIcon, MOTION: Move, HEARTBEAT: Heart };
const EVENT_COLORS = { ROCKFALL: 'text-danger', HUMAN_ACTIVITY: 'text-warning', MOTION: 'text-info', HEARTBEAT: 'text-success' };

const THRESHOLD_LIMITS = {
    MOTION_G: { min: 0.005, max: 1.0, step: 0.001 },
    PEAK_G: { min: 0.05, max: 10.0, step: 0.01 },
    ROCK_PEAK_G: { min: 0.2, max: 20.0, step: 0.01 },
    ROCK_DUR_MS: { min: 10, max: 5000, step: 1 },
    HUMAN_PEAK_MAX_G: { min: 0.2, max: 20.0, step: 0.01 },
    HUMAN_DUR_MS: { min: 10, max: 20000, step: 1 },
    HUMAN_PEAKS: { min: 1, max: 50, step: 1 },
    ACT_MIN_MG: { min: 1, max: 10000, step: 1 },
    ACT_MIN_TIME_MS: { min: 1, max: 5000, step: 1 }
};

export default function DeviceDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const { isOrgAdmin } = useAuth();
    const isDark = resolvedTheme === 'dark';

    const [device, setDevice] = useState(null);
    const [liveData, setLiveData] = useState(null);
    const [threshold, setThreshold] = useState({});
    const [savedThreshold, setSavedThreshold] = useState({});
    const [thresholdDirty, setThresholdDirty] = useState(false);
    const [stats, setStats] = useState({ peakG: [], battery: [] });
    const [saving, setSaving] = useState(false);
    const [events, setEvents] = useState([]);
    const fetchDebounceRef = useRef(null);

    const fetchDeviceInfo = (updateThreshold = false) => {
        api.devices.getById(id).then(d => {
            console.log('[API] Device getById:', d);
            setDevice(d.device);
            const apiThreshold = d.device.thresholdConfig || {};
            setSavedThreshold(apiThreshold);
            if (updateThreshold) {
                setThreshold(apiThreshold);
                setThresholdDirty(false);
            }
        }).catch(console.error);
    };

    const fetchHistoricalData = () => {
        api.historical.getStats(id, { range: '24h', window: '1h' }).then(s => { console.log('[API] Stats:', s); setStats(s); }).catch(() => { });
        api.historical.getEvents(id, { range: '24h', limit: '50' }).then(d => { console.log('[API] Events:', d); setEvents(d.events || []); }).catch(() => { });
    };

    const debouncedFetchHistorical = () => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = setTimeout(() => {
            fetchHistoricalData();
            fetchDebounceRef.current = null;
        }, 2000);
    };

    useEffect(() => {
        fetchDeviceInfo(true);
        fetchHistoricalData();

        wsService.connect(`/ws/device/${id}`);
        const unsub = wsService.on('device_update', (msg) => {
            if (msg.deviceId !== id) return;
            const d = msg.data || {};
            console.log('[WS] device_update received:', d);

            setLiveData(prev => ({
                ...prev,
                status: 'ONLINE',
                battery: d.battery,
                csq: d.csq,
                event_type: d.event_type || 'HEARTBEAT',
                peak_g: d.peak_g ?? prev?.peak_g,
                duration_ms: d.duration_ms ?? prev?.duration_ms,
                energy_g2: d.energy_g2 ?? prev?.energy_g2,
                mean_g: d.mean_g ?? prev?.mean_g,
                peaks: d.peaks ?? prev?.peaks,
                ts: d.ts || msg.timestamp || new Date().toISOString()
            }));

            setDevice(prev => prev ? {
                ...prev,
                status: 'ONLINE',
                battery: d.battery != null ? d.battery : prev.battery,
                csq: d.csq ?? prev.csq,
                lastSeen: d.ts || msg.timestamp || new Date().toISOString()
            } : prev);

            debouncedFetchHistorical();
        });

        return () => {
            unsub();
            wsService.disconnect();
            if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
        };
    }, [id]);

    if (!device) return <DeviceDetailsSkeleton />;

    const handleSaveThreshold = async () => {
        setSaving(true);
        try {
            const clamped = { ...threshold };
            Object.keys(THRESHOLD_LIMITS).forEach(key => {
                const lim = THRESHOLD_LIMITS[key];
                if (clamped[key] !== undefined && clamped[key] !== null && clamped[key] !== '') {
                    let val = Number(clamped[key]);
                    if (isNaN(val)) val = lim.min;
                    if (val < lim.min) val = lim.min;
                    if (val > lim.max) val = lim.max;
                    clamped[key] = val;
                }
            });
            setThreshold(clamped);
            const res = await api.devices.updateThreshold(id, { thresholdConfig: clamped });
            setDevice(res.device);
            const updatedThreshold = res.device.thresholdConfig || clamped;
            setSavedThreshold(updatedThreshold);
            setThreshold(updatedThreshold);
            setThresholdDirty(false);
            alert('Threshold updated & pushed!');
        } catch (err) { alert(err.message); } finally { setSaving(false); }
    };

    const restoreDefaults = () => {
        setThreshold({ MOTION_G: 0.05, PEAK_G: 0.20, ROCK_PEAK_G: 1.50, ROCK_DUR_MS: 200, HUMAN_PEAK_MAX_G: 1.60, HUMAN_DUR_MS: 500, HUMAN_PEAKS: 3, ACT_MIN_MG: 600, ACT_MIN_TIME_MS: 20 });
        setThresholdDirty(true);
    };

    const chartColors = { line: isDark ? '#fff' : '#111', grid: isDark ? '#222' : '#e0e0e0', bg: isDark ? '#111' : '#fff', tooltip: isDark ? '#111' : '#fff', tooltipBorder: isDark ? '#333' : '#e0e0e0', tooltipText: isDark ? '#fff' : '#111' };
    const historicalPeakG = (stats.peakG || []).map(p => ({ time: new Date(p._time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), value: p._value }));
    const historicalBattery = (stats.battery || []).map(p => ({ time: new Date(p._time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), value: battPct(p._value) ?? p._value }));
    const energyTrend = (() => {
        const evts = [...events].filter(e => e.energy_g2 != null && (e.ts || e._time)).sort((a, b) => new Date(a.ts || a._time) - new Date(b.ts || b._time));
        return evts.map(e => ({ time: new Date(e.ts || e._time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), value: parseFloat(energyKJ(e.energy_g2)) }));
    })();

    const statusColor = { ONLINE: 'text-success', ALERT: 'text-danger', MAINTENANCE: 'text-warning' };
    const statusDot = { ONLINE: 'bg-success', ALERT: 'bg-danger', MAINTENANCE: 'bg-warning' };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{device.name}</h1>
                            <span className={`flex items-center gap-1.5 text-sm font-medium ${statusColor[device.status]}`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${statusDot[device.status]} ${device.status === 'ALERT' ? 'animate-pulse' : ''}`} />
                                {device.status}
                            </span>
                        </div>
                        <p className="text-text-muted text-sm mt-0.5">{device._id} • {device.organizationId}</p>
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Battery', value: `${battPct(device.battery) ?? '--'}%`, icon: Battery, color: (battPct(device.battery) ?? 100) < 20 ? 'text-danger' : 'text-success' },
                    { label: 'Signal', value: csqPct(device.csq) ?? '--', icon: Signal, color: 'text-info' },
                    { label: 'Peak G', value: liveData?.peak_g ?? device.lastEvent?.peak_g ?? '--', icon: Zap, color: 'text-warning' },
                    { label: 'Duration', value: `${liveData?.duration_ms ?? device.lastEvent?.duration_ms ?? '--'} ms`, icon: Clock, color: 'text-text-muted' },
                    { label: 'Event Type', value: liveData?.event_type || device.lastEvent?.type || 'N/A', icon: EVENT_ICONS[liveData?.event_type || device.lastEvent?.type] || Activity, color: EVENT_COLORS[liveData?.event_type || device.lastEvent?.type] || 'text-text-muted' },
                    { label: 'Peaks', value: liveData?.peaks ?? device.lastEvent?.peaks ?? '--', icon: Activity, color: 'text-accent' }
                ].map(m => (
                    <div key={m.label} className="bg-surface border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-text-dim text-xs mb-2"><m.icon className={`w-3.5 h-3.5 ${m.color}`} />{m.label}</div>
                        <p className="text-xl font-bold">{m.value}</p>
                    </div>
                ))}
            </div>

            {/* Additional Metrics Row */}
            <div className={`grid grid-cols-2 ${device.lastRestartAt ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3`}>
                {[
                    { label: 'Energy (g²)', value: liveData?.energy_g2 ?? device.lastEvent?.energy_g2 ?? '--' },
                    { label: 'Energy (kJ)', value: energyKJ(liveData?.energy_g2 ?? device.lastEvent?.energy_g2) ?? '--' },
                    { label: 'Mean G', value: liveData?.mean_g ?? device.lastEvent?.mean_g ?? '--' },
                    { label: 'Last Seen', value: device.lastSeen ? new Date(device.lastSeen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'Never' },
                    ...(device.lastRestartAt ? [{ label: 'Last Restart', value: new Date(device.lastRestartAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' }) }] : [])
                ].map(m => (
                    <div key={m.label} className="bg-surface border border-border rounded-xl p-3 flex justify-between items-center">
                        <span className="text-text-dim text-xs">{m.label}</span>
                        <span className="text-sm font-semibold">{m.value}</span>
                    </div>
                ))}
            </div>

            {/* Historical charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-surface border border-border rounded-2xl p-5">
                    <h2 className="font-semibold mb-4">Peak G (24h History)</h2>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={historicalPeakG}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                            <XAxis dataKey="time" tick={{ fill: isDark ? '#666' : '#999', fontSize: 10 }} />
                            <YAxis tick={{ fill: isDark ? '#666' : '#999', fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: chartColors.tooltip, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.tooltipText }} />
                            <Line type="monotone" dataKey="value" stroke={chartColors.line} strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                    <h2 className="font-semibold mb-4">Energy (kJ) Trend (24h)</h2>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={energyTrend}>
                            <defs>
                                <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                            <XAxis dataKey="time" tick={{ fill: isDark ? '#666' : '#999', fontSize: 10 }} />
                            <YAxis tick={{ fill: isDark ? '#666' : '#999', fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: chartColors.tooltip, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.tooltipText }} />
                            <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#energyFill)" dot={false} name="Energy (kJ)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Events Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="font-semibold">Recent Events</h2>
                    <span className="text-text-dim text-xs">{events.length} events</span>
                </div>
                <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-sm">
                        <thead><tr className="text-text-muted text-xs border-b border-border">
                            {['Time', 'Type', 'Peak G', 'Duration', 'Peaks', 'Energy (g²)', 'Energy (kJ)', 'Bat', 'Signal'].map(h => <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {events.slice(0, 30).map((e, i) => {
                                const Icon = EVENT_ICONS[e.event_type] || Activity;
                                return (
                                    <tr key={i} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-4 py-2.5 text-text-muted text-xs">{(e.ts || e._time) ? new Date(e.ts || e._time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' }) : '--'}</td>
                                        <td className="px-4 py-2.5"><span className={`flex items-center gap-1.5 text-xs font-medium ${EVENT_COLORS[e.event_type] || ''}`}><Icon className="w-3.5 h-3.5" />{e.event_type || '--'}</span></td>
                                        <td className="px-4 py-2.5 font-mono font-medium">{e.peak_g ?? '--'}</td>
                                        <td className="px-4 py-2.5">{e.duration_ms ?? '--'}</td>
                                        <td className="px-4 py-2.5">{e.peaks ?? '--'}</td>
                                        <td className="px-4 py-2.5">{e.energy_g2 ?? '--'}</td>
                                        <td className="px-4 py-2.5">{energyKJ(e.energy_g2) ?? '--'}</td>
                                        <td className="px-4 py-2.5">{battPct(e.battery) ?? '--'}%</td>
                                        <td className="px-4 py-2.5">{csqPct(e.csq) ?? '--'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {events.length === 0 && <p className="text-center text-text-dim py-8">No events recorded</p>}
                </div>
            </div>

            {/* Threshold Configuration */}
            {isOrgAdmin && (
                <div className="bg-surface border border-border rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="font-semibold">Threshold Configuration</h2>
                                {thresholdDirty && <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full animate-pulse">Unsaved changes</span>}
                            </div>
                            <p className="text-text-dim text-xs mt-1">Last pushed: {device.lastThresholdUpdate ? new Date(device.lastThresholdUpdate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never'}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={restoreDefaults} className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm text-text-muted hover:bg-surface-3 transition"><RotateCcw className="w-4 h-4" /> Default</button>
                            <button onClick={handleSaveThreshold} disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save & Push'}</button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        {[
                            { title: 'Motion Detection', fields: ['MOTION_G', 'PEAK_G'] },
                            { title: 'Rockfall Detection', fields: ['ROCK_PEAK_G', 'ROCK_DUR_MS'] },
                            { title: 'Human Detection', fields: ['HUMAN_PEAK_MAX_G', 'HUMAN_DUR_MS', 'HUMAN_PEAKS'] },
                            { title: 'Activity Detection', fields: ['ACT_MIN_MG', 'ACT_MIN_TIME_MS'] }
                        ].map(section => (
                            <div key={section.title}>
                                <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wider">{section.title}</h3>
                                <div className="space-y-3">
                                    {section.fields.map(key => {
                                        const lim = THRESHOLD_LIMITS[key];
                                        return (
                                            <div key={key}>
                                                <label className="block text-xs text-text-dim mb-1">{key} <span className="text-text-dim/50">({lim.min} – {lim.max})</span></label>
                                                <input type="number" step={lim.step} min={lim.min} max={lim.max}
                                                    value={threshold[key] ?? ''}
                                                    onChange={e => {
                                                        const raw = e.target.value;
                                                        setThresholdDirty(true);
                                                        if (raw === '') { setThreshold(p => ({ ...p, [key]: '' })); return; }
                                                        const val = lim.step === 1 ? parseInt(raw) : parseFloat(raw);
                                                        if (!isNaN(val)) setThreshold(p => ({ ...p, [key]: val }));
                                                    }}
                                                    onBlur={() => {
                                                        setThreshold(p => {
                                                            let val = p[key];
                                                            if (val === '' || val === undefined || val === null || isNaN(Number(val))) return p;
                                                            val = Number(val);
                                                            if (val < lim.min) val = lim.min;
                                                            if (val > lim.max) val = lim.max;
                                                            return { ...p, [key]: val };
                                                        });
                                                    }}
                                                    className={`w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Device Info Card */}
            <div className="bg-surface border border-border rounded-2xl p-6">
                <h2 className="font-semibold mb-4">Device Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        ['Device ID', device._id], ['Name', device.name], ['Organization', device.organizationId],
                        ['Status', device.status], ['Latitude', device.lat], ['Longitude', device.lng],
                        ['Firmware', device.firmware || 'N/A'], ['Description', device.description || 'None'],
                        ['Created', device.createdAt ? new Date(device.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'N/A']
                    ].map(([label, value]) => (
                        <div key={label} className="py-2 border-b border-border/30">
                            <p className="text-xs text-text-dim uppercase tracking-wider">{label}</p>
                            <p className="text-sm font-medium mt-1">{value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
