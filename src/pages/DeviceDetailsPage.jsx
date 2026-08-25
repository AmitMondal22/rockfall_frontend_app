import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';
import api from '../services/api';
import wsService from '../services/websocket';
import { DeviceDetailsSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Battery, Signal, Activity, Clock, Save, RotateCcw, Zap, Mountain, User as UserIcon, Move, Heart, AlertCircle, RefreshCw, Calendar, Filter, X } from 'lucide-react';

const csqPct = (v) => v != null && !isNaN(Number(v)) ? `${Math.min(Math.round((Number(v) / 31) * 100), 100)}%` : '--';

const battPct = (v) => {
    if (v == null || isNaN(Number(v))) return '--';
    const num = Number(v);
    // Value 13 is 100%, 0 is 0%
    const pct = Math.max(0, Math.min(100, Math.round((num / 13) * 100)));
    return `${pct}%`;
};

const energyKJ = (g2) => {
    if (g2 == null || isNaN(Number(g2))) return '0.0000';
    return ((Number(g2) * 9.81 * 9.81) / 1000).toFixed(4);
};

const formatLastSeen = (ts) => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Never';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const formatLastRestart = (ts) => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return 'Never';
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
};

const EVENT_ICONS = { ROCKFALL: Mountain, HUMAN_ACTIVITY: UserIcon, HUMAN: UserIcon, MOTION: Move, HEARTBEAT: Heart, OTHER: Activity };
const EVENT_COLORS = { ROCKFALL: 'text-danger', HUMAN_ACTIVITY: 'text-warning', HUMAN: 'text-warning', MOTION: 'text-info', HEARTBEAT: 'text-success', OTHER: 'text-accent' };

const TIME_RANGES = [
    { label: '24 Hours', value: '24h' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    // { label: 'All Recorded', value: 'all' },
    { label: 'Custom Range', value: 'custom' }
];

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
    const [thresholdDirty, setThresholdDirty] = useState(false);
    const [timeRange, setTimeRange] = useState('all');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [appliedCustomDates, setAppliedCustomDates] = useState({ from: '', to: '' });
    const [stats, setStats] = useState({ peakG: [], battery: [], energy: [] });
    const [saving, setSaving] = useState(false);
    const [events, setEvents] = useState([]);
    const [deviceLoading, setDeviceLoading] = useState(true);
    const [deviceError, setDeviceError] = useState('');
    const [historyError, setHistoryError] = useState('');
    const fetchDebounceRef = useRef(null);
    const deviceRequestRef = useRef(0);
    const historyRequestRef = useRef(0);

    const fetchDeviceInfo = useCallback(async (updateThreshold = false) => {
        const requestId = ++deviceRequestRef.current;
        setDeviceError('');
        try {
            const d = await api.devices.getById(id);
            if (requestId !== deviceRequestRef.current) return;
            setDevice(d.device);
            const apiThreshold = d.device.thresholdConfig || {};
            if (updateThreshold) {
                setThreshold(apiThreshold);
                setThresholdDirty(false);
            }
        } catch (error) {
            if (requestId === deviceRequestRef.current) setDeviceError(error.message || 'Device data could not be loaded.');
        } finally {
            if (requestId === deviceRequestRef.current) setDeviceLoading(false);
        }
    }, [id]);

    const fetchHistoricalData = useCallback(async (range = timeRange, customFrom = appliedCustomDates.from, customTo = appliedCustomDates.to) => {
        const requestId = ++historyRequestRef.current;
        const statsParams = {
            range,
            window: range === '24h' ? '1h' : range === '7d' ? '6h' : '1d'
        };
        const eventsParams = {
            range,
            limit: '200'
        };

        if (range === 'custom' || customFrom || customTo) {
            if (customFrom) {
                statsParams.fromDate = customFrom;
                eventsParams.fromDate = customFrom;
            }
            if (customTo) {
                statsParams.toDate = customTo;
                eventsParams.toDate = customTo;
            }
            statsParams.range = 'custom';
            eventsParams.range = 'custom';
            statsParams.window = '6h';
        }

        const [statsResult, eventsResult] = await Promise.allSettled([
            api.historical.getStats(id, statsParams),
            api.historical.getEvents(id, eventsParams)
        ]);

        if (requestId !== historyRequestRef.current) return;
        if (statsResult.status === 'fulfilled') setStats(statsResult.value || { peakG: [], battery: [], energy: [] });
        if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value.events || []);
        const failures = [statsResult, eventsResult].filter(result => result.status === 'rejected');
        setHistoryError(failures.length ? failures[0].reason?.message || 'Some historical data could not be loaded.' : '');
    }, [id, timeRange, appliedCustomDates]);

    const debouncedFetchHistorical = useCallback(() => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
        fetchDebounceRef.current = setTimeout(() => {
            fetchHistoricalData();
            fetchDebounceRef.current = null;
        }, 2000);
    }, [fetchHistoricalData]);

    useEffect(() => {
        fetchDeviceInfo(true);
        fetchHistoricalData();

        const unsub = wsService.on('device_update', (msg) => {
            if (msg.deviceId !== id) return;
            const d = msg.data || {};

            const liveTimestamp = d.ts || msg.timestamp || new Date().toISOString();
            const liveEventObj = {
                id: `live_${Date.now()}`,
                _id: `live_${Date.now()}`,
                uid: id,
                timestamp: liveTimestamp,
                ts: liveTimestamp,
                _time: liveTimestamp,
                event_type: d.event_type || 'OTHER',
                type: d.event_type || 'OTHER',
                peak_g: parseFloat(d.peak_g ?? 0),
                duration_ms: parseInt(d.duration_ms ?? 0),
                energy_g2: parseFloat(d.energy_g2 ?? 0),
                mean_g: parseFloat(d.mean_g ?? 0),
                peaks: parseInt(d.peaks ?? 0),
                battery: d.battery,
                csq: d.csq
            };

            setLiveData(prev => ({
                ...prev,
                status: 'ONLINE',
                battery: d.battery ?? prev?.battery,
                csq: d.csq ?? prev?.csq,
                event_type: d.event_type ?? prev?.event_type,
                peak_g: d.peak_g ?? prev?.peak_g,
                duration_ms: d.duration_ms ?? prev?.duration_ms,
                energy_g2: d.energy_g2 ?? prev?.energy_g2,
                mean_g: d.mean_g ?? prev?.mean_g,
                peaks: d.peaks ?? prev?.peaks,
                ts: liveTimestamp
            }));

            setEvents(prev => [liveEventObj, ...prev.slice(0, 199)]);

            setDevice(prev => prev ? {
                ...prev,
                status: 'ONLINE',
                battery: d.battery != null ? d.battery : prev.battery,
                csq: d.csq ?? prev.csq,
                lastSeen: liveTimestamp
            } : prev);

            debouncedFetchHistorical();
        });
        wsService.connect(`/ws/device/${id}`);
        const refreshTimer = window.setInterval(() => {
            fetchDeviceInfo(false);
        }, 30000);

        return () => {
            window.clearInterval(refreshTimer);
            unsub();
            wsService.disconnect();
            if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
            deviceRequestRef.current += 1;
            historyRequestRef.current += 1;
        };
    }, [id, fetchDeviceInfo, fetchHistoricalData, debouncedFetchHistorical]);

    const handleRangeChange = (range) => {
        setTimeRange(range);
        if (range !== 'custom') {
            setAppliedCustomDates({ from: '', to: '' });
            fetchHistoricalData(range, '', '');
        }
    };

    const handleApplyCustomDates = (e) => {
        if (e) e.preventDefault();
        if (!fromDate && !toDate) return;
        setTimeRange('custom');
        setAppliedCustomDates({ from: fromDate, to: toDate });
        fetchHistoricalData('custom', fromDate, toDate);
    };

    const handleResetCustomDates = () => {
        setFromDate('');
        setToDate('');
        setAppliedCustomDates({ from: '', to: '' });
        setTimeRange('all');
        fetchHistoricalData('all', '', '');
    };

    if (deviceLoading && !device) return <DeviceDetailsSkeleton />;
    if (!device) {
        return (
            <div className="grid min-h-[420px] place-items-center">
                <div className="max-w-md rounded-2xl border border-border bg-surface p-7 text-center">
                    <AlertCircle className="mx-auto h-8 w-8 text-danger" />
                    <h1 className="mt-3 text-lg font-semibold">Device unavailable</h1>
                    <p className="mt-2 text-sm text-text-muted">{deviceError || 'The device record could not be loaded.'}</p>
                    <button type="button" onClick={() => fetchDeviceInfo(true)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white"><RefreshCw className="h-4 w-4" /> Retry</button>
                </div>
            </div>
        );
    }

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
            setThreshold(updatedThreshold);
            setThresholdDirty(false);
            alert('Threshold updated & pushed!');
        } catch (err) { alert(err.message); } finally { setSaving(false); }
    };

    const restoreDefaults = () => {
        setThreshold({ MOTION_G: 0.05, PEAK_G: 0.20, ROCK_PEAK_G: 1.50, ROCK_DUR_MS: 200, HUMAN_PEAK_MAX_G: 1.60, HUMAN_DUR_MS: 500, HUMAN_PEAKS: 3, ACT_MIN_MG: 600, ACT_MIN_TIME_MS: 20 });
        setThresholdDirty(true);
    };

    const formatTimeAxis = (timeStr) => {
        if (!timeStr) return '--';
        const d = new Date(timeStr);
        if (isNaN(d.getTime())) return '--';
        return d.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const chartColors = { line: isDark ? '#fff' : '#111', grid: isDark ? '#222' : '#e0e0e0', bg: isDark ? '#111' : '#fff', tooltip: isDark ? '#111' : '#fff', tooltipBorder: isDark ? '#333' : '#e0e0e0', tooltipText: isDark ? '#fff' : '#111' };

    // Format Peak G historical series
    const historicalPeakG = (() => {
        if (stats.peakG && stats.peakG.length > 0) {
            return stats.peakG.map(p => ({
                time: formatTimeAxis(p._time || p.time || p.timestamp),
                rawTime: new Date(p._time || p.time || p.timestamp).getTime(),
                value: parseFloat(p._value ?? p.value ?? 0)
            })).sort((a, b) => a.rawTime - b.rawTime);
        }
        return [...events]
            .filter(e => e.peak_g != null && (e.timestamp || e.ts || e._time))
            .sort((a, b) => new Date(a.timestamp || a.ts || a._time) - new Date(b.timestamp || b.ts || b._time))
            .slice(-60)
            .map(e => ({
                time: formatTimeAxis(e.timestamp || e.ts || e._time),
                rawTime: new Date(e.timestamp || e.ts || e._time).getTime(),
                value: parseFloat(e.peak_g || 0)
            }));
    })();

    // Format Signal energy historical series
    const energyTrend = (() => {
        if (stats.energy && stats.energy.length > 0) {
            return stats.energy.map(p => ({
                time: formatTimeAxis(p._time || p.time || p.timestamp),
                rawTime: new Date(p._time || p.time || p.timestamp).getTime(),
                value: parseFloat(p._value ?? p.value ?? 0)
            })).sort((a, b) => a.rawTime - b.rawTime);
        }
        return [...events]
            .filter(e => e.energy_g2 != null && (e.timestamp || e.ts || e._time))
            .sort((a, b) => new Date(a.timestamp || a.ts || a._time) - new Date(b.timestamp || b.ts || b._time))
            .slice(-60)
            .map(e => ({
                time: formatTimeAxis(e.timestamp || e.ts || e._time),
                rawTime: new Date(e.timestamp || e.ts || e._time).getTime(),
                value: parseFloat(e.energy_g2 || 0)
            }));
    })();

    // Format Live / Historical Scatter Chart Data (Duration vs Peak G)
    const scatterData = (() => {
        return [...events]
            .filter(e => e.peak_g != null)
            .map((e, idx) => {
                const evtType = e.event_type || e.type || 'OTHER';
                let color = '#10b981'; // default emerald
                if (evtType === 'ROCKFALL') color = '#ef4444';
                else if (evtType === 'HUMAN' || evtType === 'HUMAN_ACTIVITY') color = '#f59e0b';
                else if (evtType === 'MOTION') color = '#3b82f6';
                else if (evtType === 'HEARTBEAT') color = '#10b981';

                return {
                    id: e.id || e._id || idx,
                    duration: Number(e.duration_ms || 0),
                    peakG: Number(parseFloat(e.peak_g || 0).toFixed(3)),
                    energy: Number(parseFloat(e.energy_g2 || 0).toFixed(2)),
                    peaks: Number(e.peaks || 0),
                    eventType: evtType,
                    color: color,
                    time: formatTimeAxis(e.timestamp || e.ts || e._time || e.createdAt)
                };
            });
    })();

    // Custom Scatter Tooltip
    const CustomScatterTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className={`p-3 rounded-xl border shadow-xl ${isDark ? 'bg-[#111] border-[#333] text-white' : 'bg-white border-gray-200 text-black'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                        <span className="font-bold text-xs">{data.eventType}</span>
                        <span className="text-[10px] text-text-dim ml-auto">{data.time}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2 pt-2 border-t border-border/40">
                        <div><span className="text-text-dim text-[11px]">Peak G:</span> <strong className="font-mono">{data.peakG} G</strong></div>
                        <div><span className="text-text-dim text-[11px]">Duration:</span> <strong className="font-mono">{data.duration} ms</strong></div>
                        <div><span className="text-text-dim text-[11px]">Energy:</span> <strong className="font-mono text-amber-500">{data.energy} g²</strong></div>
                        <div><span className="text-text-dim text-[11px]">Peaks:</span> <strong className="font-mono">{data.peaks}</strong></div>
                    </div>
                </div>
            );
        }
        return null;
    };

    // Summary calculations from live data or latest recorded event
    const latestEvent = events[0] || device.lastEvent || {};
    const latestBattery = liveData?.battery ?? device.battery ?? latestEvent?.battery;
    const latestCsq = liveData?.csq ?? device.csq ?? latestEvent?.csq;
    const latestPeakG = liveData?.peak_g ?? latestEvent?.peak_g ?? '--';
    const latestDuration = liveData?.duration_ms ?? latestEvent?.duration_ms ?? '0';
    const latestEventType = liveData?.event_type || latestEvent?.event_type || latestEvent?.type || 'OTHER';
    const latestPeaks = liveData?.peaks ?? latestEvent?.peaks ?? '0';
    const latestEnergy = liveData?.energy_g2 ?? latestEvent?.energy_g2 ?? '0';
    const latestMeanG = liveData?.mean_g ?? latestEvent?.mean_g ?? '0.000';
    const latestSeen = liveData?.ts || device.lastSeen || latestEvent?.timestamp || latestEvent?.ts;

    const maxRecordedPeakG = events.length > 0 ? Math.max(...events.map(e => Number(e.peak_g || 0)), 0) : 0;
    const maxRecordedEnergy = events.length > 0 ? Math.max(...events.map(e => Number(e.energy_g2 || 0)), 0) : 0;

    const statusColor = { ONLINE: 'text-success', OFFLINE: 'text-text-muted', ALERT: 'text-danger', MAINTENANCE: 'text-warning' };
    const statusDot = { ONLINE: 'bg-success', OFFLINE: 'bg-text-dim', ALERT: 'bg-danger', MAINTENANCE: 'bg-warning' };
    const pageWarnings = [deviceError, historyError].filter(Boolean);

    const inputCls = `px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold">{device.name}</h1>
                        </div>
                        <p className="text-text-muted text-sm mt-0.5">{device._id} • {device.organizationId || device.org_id}</p>
                    </div>
                </div>

                {/* Time Range Selector */}
                <div className="flex flex-wrap items-center gap-1 bg-surface border border-border p-1 rounded-xl">
                    <Calendar className="w-4 h-4 ml-2 mr-1 text-text-dim" />
                    {TIME_RANGES.map(r => (
                        <button
                            key={r.value}
                            onClick={() => handleRangeChange(r.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${timeRange === r.value ? (isDark ? 'bg-white text-black shadow' : 'bg-black text-white shadow-sm') : 'text-text-muted hover:text-text'}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom Date Range Picker Toolbar */}
            {timeRange === 'custom' && (
                <form onSubmit={handleApplyCustomDates} className="flex flex-wrap items-center gap-3 bg-surface border border-border rounded-2xl p-4 transition-all duration-300">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-warning" />
                        <span className="text-xs font-semibold text-text-muted">Custom Date Filter:</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-text-muted">From:</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            className={inputCls}
                            required
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-text-muted">To:</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            className={inputCls}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="px-4 py-2 bg-warning text-black rounded-xl text-xs font-semibold hover:bg-warning/90 transition shadow-sm"
                    >
                        Apply Range
                    </button>
                    {(appliedCustomDates.from || appliedCustomDates.to) && (
                        <button
                            type="button"
                            onClick={handleResetCustomDates}
                            className="flex items-center gap-1 px-3 py-2 border border-border rounded-xl text-xs text-text-muted hover:text-text transition"
                        >
                            <X className="w-3.5 h-3.5" /> Clear
                        </button>
                    )}
                    {appliedCustomDates.from && appliedCustomDates.to && (
                        <span className="text-xs text-text-dim ml-auto">
                            Showing records between <strong className="text-text">{appliedCustomDates.from}</strong> and <strong className="text-text">{appliedCustomDates.to}</strong> ({events.length} records found)
                        </span>
                    )}
                </form>
            )}

            {pageWarnings.length > 0 && (
                <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-warning sm:flex-row sm:items-center">
                    <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{pageWarnings.join(' ')}</span>
                    <button type="button" onClick={() => { fetchDeviceInfo(false); fetchHistoricalData(); }} className="self-start font-semibold underline underline-offset-4 sm:self-auto">Retry</button>
                </div>
            )}

            {/* TOP METRICS ROW (6 Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Battery', value: battPct(latestBattery), icon: Battery, color: 'text-success' },
                    { label: 'Signal', value: csqPct(latestCsq), icon: Signal, color: 'text-info' },
                    { label: 'Peak G', value: latestPeakG !== '--' ? parseFloat(latestPeakG).toFixed(3) : '--', icon: Zap, color: 'text-warning' },
                    { label: 'Duration', value: latestDuration !== '--' ? `${latestDuration} ms` : '0 ms', icon: Clock, color: 'text-text-muted' },
                    { label: 'Event Type', value: latestEventType, icon: EVENT_ICONS[latestEventType] || Activity, color: EVENT_COLORS[latestEventType] || 'text-text-muted' },
                    { label: 'Peaks', value: latestPeaks, icon: Activity, color: 'text-accent' }
                ].map(m => (
                    <div key={m.label} className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-text-dim text-xs mb-2">
                            <m.icon className={`w-3.5 h-3.5 ${m.color}`} />
                            <span>{m.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-text">{m.value}</p>
                    </div>
                ))}
            </div>

            {/* BOTTOM METRICS ROW (5 Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: 'Energy (g²)', value: latestEnergy },
                    { label: 'Energy (kJ)', value: energyKJ(latestEnergy) },
                    { label: 'Mean G', value: latestMeanG },
                    { label: 'Last Seen', value: formatLastSeen(latestSeen) },
                    { label: 'Last Restart', value: formatLastRestart(device.lastRestartAt || device.last_restart_at) }
                ].map(m => (
                    <div key={m.label} className="bg-surface border border-border rounded-2xl p-3.5 flex justify-between items-center shadow-sm">
                        <span className="text-text-dim text-xs">{m.label}</span>
                        <span className="text-sm font-bold text-text">{m.value}</span>
                    </div>
                ))}
            </div>

            {/* HISTORICAL CHARTS (Peak G & Signal Energy) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="font-semibold text-sm">Peak G Impact History</h2>
                            <p className="text-xs text-text-dim mt-0.5">Peak force recorded over time ({historicalPeakG.length} data points)</p>
                        </div>
                        {maxRecordedPeakG > 0 && (
                            <span className="text-xs font-semibold px-2 py-1 bg-warning/10 text-warning rounded-md">
                                Max: {maxRecordedPeakG.toFixed(3)} G
                            </span>
                        )}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={historicalPeakG}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                            <XAxis dataKey="time" tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }} domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ background: chartColors.tooltip, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.tooltipText }} />
                            <Line type="monotone" dataKey="value" stroke={chartColors.line} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} name="Peak G" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="font-semibold text-sm">Signal Energy (g²) Trend</h2>
                            <p className="text-xs text-text-dim mt-0.5">Vibrational kinetic energy ({energyTrend.length} data points)</p>
                        </div>
                        {maxRecordedEnergy > 0 && (
                            <span className="text-xs font-semibold px-2 py-1 bg-amber-500/10 text-amber-500 rounded-md">
                                Max: {maxRecordedEnergy.toFixed(2)} g²
                            </span>
                        )}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={energyTrend}>
                            <defs>
                                <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                            <XAxis dataKey="time" tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }} domain={['auto', 'auto']} />
                            <Tooltip contentStyle={{ background: chartColors.tooltip, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, color: chartColors.tooltipText }} />
                            <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#energyFill)" dot={{ r: 2 }} activeDot={{ r: 5 }} name="Signal energy (g²)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* LIVE DATA SCATTER CHART (Duration vs Peak G) */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="font-semibold text-sm">Live Impact Classification (Duration vs Peak G)</h2>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                LIVE SCATTER
                            </span>
                        </div>
                        <p className="text-xs text-text-dim mt-0.5">Distribution of impact force vs duration, point size by signal energy ({scatterData.length} events)</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /><span className="text-text-muted text-[11px]">Rockfall</span></div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" /><span className="text-text-muted text-[11px]">Human</span></div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" /><span className="text-text-muted text-[11px]">Motion</span></div>
                        <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" /><span className="text-text-muted text-[11px]">Other</span></div>
                    </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                        <XAxis
                            type="number"
                            dataKey="duration"
                            name="Duration"
                            unit="ms"
                            tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }}
                            label={{ value: 'Duration (ms)', position: 'insideBottom', offset: -10, fill: isDark ? '#777' : '#999', fontSize: 11 }}
                        />
                        <YAxis
                            type="number"
                            dataKey="peakG"
                            name="Peak G"
                            unit="G"
                            tick={{ fill: isDark ? '#777' : '#999', fontSize: 10 }}
                            label={{ value: 'Peak Acceleration (G)', angle: -90, position: 'insideLeft', fill: isDark ? '#777' : '#999', fontSize: 11 }}
                        />
                        <ZAxis type="number" dataKey="energy" range={[40, 260]} name="Energy" unit="g²" />
                        <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter name="Impact Events" data={scatterData}>
                            {scatterData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} stroke={entry.color} strokeWidth={1} />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* RECENT EVENTS TABLE */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h2 className="font-semibold">Recent Events</h2>
                        <p className="text-xs text-text-dim mt-0.5">Impacts, rockfall events, and telemetry events recorded for {device.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-2 border border-border text-text-muted">
                            {events.length} events recorded
                        </span>
                    </div>
                </div>
                <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2/60 sticky top-0 backdrop-blur-sm z-10">
                            <tr className="text-text-muted text-xs border-b border-border">
                                {['Time', 'Type', 'Peak G', 'Duration', 'Peaks', 'Signal energy (g²)', 'Energy (kJ)', 'Mean G', 'Battery', 'Signal'].map(h => <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {events.slice(0, 100).map((e, i) => {
                                const evtType = e.event_type || e.type || 'OTHER';
                                const Icon = EVENT_ICONS[evtType] || Activity;
                                const eventTime = e.timestamp || e.ts || e._time || e.createdAt;
                                return (
                                    <tr key={e.id || e._id || i} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-4 py-2.5 text-text-muted text-xs whitespace-nowrap">
                                            {eventTime ? new Date(eventTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`flex items-center gap-1.5 text-xs font-medium ${EVENT_COLORS[evtType] || ''}`}>
                                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                                {evtType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono font-medium">{e.peak_g != null ? parseFloat(e.peak_g).toFixed(3) : '--'}</td>
                                        <td className="px-4 py-2.5">{e.duration_ms !== undefined && e.duration_ms !== null ? `${e.duration_ms} ms` : '--'}</td>
                                        <td className="px-4 py-2.5">{e.peaks ?? '--'}</td>
                                        <td className="px-4 py-2.5 font-mono text-amber-500">{e.energy_g2 ?? '--'}</td>
                                        <td className="px-4 py-2.5 font-mono">{energyKJ(e.energy_g2)}</td>
                                        <td className="px-4 py-2.5">{e.mean_g ?? '--'}</td>
                                        <td className="px-4 py-2.5">{battPct(e.battery)}</td>
                                        <td className="px-4 py-2.5">{csqPct(e.csq)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {events.length === 0 && <p className="text-center text-text-dim py-8">No events recorded for this device in the selected date range</p>}
                </div>
            </div>

            {/* THRESHOLD CONFIGURATION */}
            {isOrgAdmin && (
                <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
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

            {/* DEVICE INFORMATION */}
            <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                <h2 className="font-semibold mb-4">Device & Structural Placement Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        ['Device ID', device._id || device.id],
                        ['Sensor Name', device.name],
                        ['Mounted Barrier Asset', device.asset?.name || device.asset_id || device.assetId || 'Standalone Sensor'],
                        ['Location (Site)', device.location || device.locationRef?.name || 'Site Location'],
                        ['Parent Project', device.project?.name || 'Kuppavalasa Slope Stabilization Project'],
                        ['Organization', device.organization?.name || device.organizationId || device.org_id],
                        ['Latitude', device.lat ?? '18.272'],
                        ['Longitude', device.lng ?? '83.078'],
                        ['Description', device.description || 'Geotechnical rockfall & vibration monitoring node'],
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
