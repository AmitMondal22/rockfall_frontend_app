import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import L from 'leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { OrgDashboardSkeleton } from '../components/Skeleton';
import { useTheme } from '../context/ThemeContext';
import { ArrowLeft, MapPin, Cpu, Users, Battery, Signal, AlertTriangle, Activity, Clock, Zap, ChevronRight, Mountain, Heart, Move } from 'lucide-react';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' };
const statusBadge = { ONLINE: 'bg-success/20 text-success', ALERT: 'bg-danger/20 text-danger', MAINTENANCE: 'bg-warning/20 text-warning' };
const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;
const eventColors = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e' };
const eventIcons = { ROCKFALL: Mountain, HUMAN_ACTIVITY: Users, MOTION: Move, HEARTBEAT: Heart };
const TILE = { light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' };

const EVENT_EMOJIS = { ROCKFALL: '🪨', HUMAN_ACTIVITY: '🚶', MOTION: '🔄', HEARTBEAT: '💚' };
const EVENT_LABELS = { ROCKFALL: 'Rockfall', HUMAN_ACTIVITY: 'Human', MOTION: 'Motion', HEARTBEAT: 'Heartbeat' };

const makeIcon = (status, isDark, eventType) => {
    const emoji = EVENT_EMOJIS[eventType] || '';
    const bg = statusColors[status] || '#666';
    return L.divIcon({
        className: '', iconSize: [36, 36], iconAnchor: [18, 18],
        html: `<div style="width:36px;height:36px;border-radius:50%;background:${bg};border:3px solid ${isDark ? '#111' : '#fff'};box-shadow:0 0 10px ${bg}50;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1">${emoji}</div>`
    });
};
const alertIcon = (isDark, eventType) => {
    const emoji = EVENT_EMOJIS[eventType] || '!';
    return L.divIcon({
        className: '', iconSize: [38, 38], iconAnchor: [19, 19],
        html: `<div style="width:38px;height:38px;border-radius:50%;background:#ef4444;border:3px solid ${isDark ? '#111' : '#fff'};box-shadow:0 0 16px #ef444480;display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;font-size:15px;line-height:1">${emoji}</div>`
    });
};

export default function LocationDashboardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const [loc, setLoc] = useState(null);
    const [devices, setDevices] = useState([]);
    const [locUsers, setLocUsers] = useState([]);
    const [events, setEvents] = useState([]);
    const [chartData, setChartData] = useState([]);

    const fetchLocData = () => {
        api.locations.getById(id).then(d => setLoc(d.location)).catch(console.error);
        api.devices.getAll().then(d => {
            const ld = (d.devices || []).filter(dev => dev.locationId === id);
            Promise.all(ld.map(dev =>
                api.historical.getEvents(dev._id, { range: '24h', limit: '50' }).then(r => (r.events || []).map(e => ({ ...e, deviceName: dev.name, deviceId: dev._id }))).catch(() => [])
            )).then(results => {
                const all = results.flat().sort((a, b) => new Date(b.ts || b._time || 0) - new Date(a.ts || a._time || 0));
                setEvents(all);

                // Enrich devices with latest event type from historical data
                const enriched = ld.map((dev, idx) => {
                    // If device already has lastEvent from API, keep it
                    if (dev.lastEvent?.type) return dev;
                    // Otherwise find the most recent non-heartbeat event from historical data
                    const devEvents = results[idx] || [];
                    const latestEvt = devEvents.find(e => e.event_type && e.event_type !== 'HEARTBEAT');
                    if (latestEvt) {
                        return {
                            ...dev,
                            lastEvent: {
                                type: latestEvt.event_type,
                                peak_g: latestEvt.peak_g,
                                duration_ms: latestEvt.duration_ms,
                                timestamp: latestEvt.ts || latestEvt._time
                            }
                        };
                    }
                    // Fallback: try heartbeat
                    const hb = devEvents.find(e => e.event_type === 'HEARTBEAT');
                    if (hb) {
                        return { ...dev, lastEvent: { type: 'HEARTBEAT', peak_g: hb.peak_g, duration_ms: hb.duration_ms, timestamp: hb.ts || hb._time } };
                    }
                    return dev;
                });
                setDevices(enriched);

                const hours = {};
                all.forEach(e => {
                    if (!(e.ts || e._time)) return;
                    const h = new Date(e.ts || e._time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
                    if (!hours[h]) hours[h] = { time: h, peak_g: 0, events: 0, alerts: 0 };
                    hours[h].events++;
                    hours[h].peak_g = Math.max(hours[h].peak_g, e.peak_g ?? 0);
                    if (e.event_type === 'ROCKFALL') hours[h].alerts++;
                });
                setChartData(Object.values(hours).slice(-20));
            });
        }).catch(console.error);
        api.users.getAll().then(d => setLocUsers((d.users || []).filter(u => u.locationId === id))).catch(() => { });
    };

    useEffect(() => {
        fetchLocData();
        const pollInterval = setInterval(fetchLocData, 10000);

        wsService.connect('/ws/dashboard');
        const unsub = wsService.on('device_update', (msg) => {
            const d = msg.data || {};
            setDevices(prev => prev.map(dev => dev._id === msg.deviceId ? {
                ...dev,
                status: 'ONLINE',
                battery: d.battery != null ? d.battery : dev.battery,
                csq: d.csq ?? dev.csq,
                lastSeen: d.ts || msg.timestamp || new Date().toISOString(),
                lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                    type: d.event_type, peak_g: d.peak_g, duration_ms: d.duration_ms, timestamp: d.ts
                } : dev.lastEvent
            } : dev));
        });

        return () => { clearInterval(pollInterval); unsub(); wsService.disconnect(); };
    }, [id]);



    const c = {
        grid: isDark ? '#222' : '#e5e5e5', tick: isDark ? '#666' : '#999', line: isDark ? '#fff' : '#111',
        tBg: isDark ? '#111' : '#fff', tBorder: isDark ? '#333' : '#e0e0e0', tColor: isDark ? '#fff' : '#111'
    };

    if (!loc) return <OrgDashboardSkeleton />;

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const alertCount = devices.filter(d => d.status === 'ALERT').length;
    const alertDevices = devices.filter(d => d.status === 'ALERT');
    const alertEvents = events.filter(e => e.event_type === 'ROCKFALL');
    const center = devices.length > 0
        ? [devices.reduce((s, d) => s + (d.lat || 0), 0) / devices.length, devices.reduce((s, d) => s + (d.lng || 0), 0) / devices.length]
        : [loc.lat || 22.5726, loc.lng || 88.3639];

    const stats = [
        { label: 'Devices', value: devices.length, icon: Cpu, color: isDark ? 'text-white' : 'text-[#111]' },
        { label: 'Online', value: onlineCount, icon: Activity, color: 'text-success' },
        { label: 'Alerts', value: alertCount, icon: AlertTriangle, color: 'text-danger' },
        { label: 'Events (24h)', value: events.length, icon: Zap, color: 'text-warning' },
        { label: 'Users', value: locUsers.length, icon: Users, color: 'text-info' },
    ];

    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button onClick={() => navigate('/locations')} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition self-start"><ArrowLeft className="w-5 h-5" /></button>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-info/20' : 'bg-blue-50'}`}>
                    <MapPin className={`w-6 h-6 ${isDark ? 'text-info' : 'text-blue-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold">{loc.name}</h1>
                    <p className="text-text-muted text-xs md:text-sm mt-0.5">{loc._id} • {loc.address || loc.description || 'No address'}</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {stats.map(s => (
                    <div key={s.label} className="bg-surface border border-border rounded-xl md:rounded-2xl p-3 md:p-4">
                        <div className="flex items-center justify-between mb-1 md:mb-2">
                            <span className="text-text-muted text-[10px] md:text-xs">{s.label}</span>
                            <s.icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${s.color}`} />
                        </div>
                        <p className={`text-lg md:text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Map + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Map */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden" style={{ minHeight: '360px' }}>
                    <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between">
                        <h2 className="font-semibold text-sm md:text-base">Device Map — {loc.name}</h2>
                        <span className="text-text-dim text-xs">{devices.length} devices</span>
                    </div>
                    <div style={{ height: '400px' }}>
                        <MapContainer key={resolvedTheme} center={center} zoom={10} style={{ height: '100%', width: '100%' }} attributionControl={false}>
                            <TileLayer url={isDark ? TILE.dark : TILE.light} />
                            {devices.map(d => {
                                const evtType = d.lastEvent?.type || null;
                                return (
                                    <Marker key={d._id} position={[d.lat || 0, d.lng || 0]} icon={d.status === 'ALERT' ? alertIcon(isDark, evtType) : makeIcon(d.status, isDark, evtType)}>
                                        <Popup>
                                            <div style={{ color: '#111', fontSize: 13, minWidth: 200 }}>
                                                <p style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</p>
                                                <p style={{ fontSize: 11, color: '#666' }}>{d._id}</p>
                                                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                                                    <span>Status: <b style={{ color: statusColors[d.status] }}>{d.status}</b></span>
                                                    <span>Battery: <b>{battPct(d.battery) ?? '--'}%</b></span>
                                                    <span>Signal: <b>{csqPct(d.csq) ?? '--'}</b></span>
                                                    <span>Event: <b style={{ color: eventColors[evtType] || '#666' }}>{EVENT_LABELS[evtType] || 'None'}</b></span>
                                                </div>
                                                {evtType && (
                                                    <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, background: `${eventColors[evtType] || '#666'}15`, fontSize: 11 }}>
                                                        <span style={{ color: eventColors[evtType] || '#666', fontWeight: 600 }}>{EVENT_EMOJIS[evtType]} {EVENT_LABELS[evtType]}</span>
                                                        {d.lastEvent?.peak_g != null && <span style={{ marginLeft: 8 }}>Peak: <b>{d.lastEvent.peak_g}g</b></span>}
                                                        {d.lastEvent?.duration_ms != null && <span style={{ marginLeft: 8 }}>Dur: <b>{d.lastEvent.duration_ms}ms</b></span>}
                                                    </div>
                                                )}
                                                {d.status === 'ALERT' && <p style={{ marginTop: 6, color: '#ef4444', fontWeight: 600, fontSize: 11 }}>⚠️ ALERT ACTIVE</p>}
                                                <button onClick={() => navigate(`/devices/${d._id}`)} style={{ marginTop: 8, color: '#2563eb', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}>View Details →</button>
                                            </div>
                                        </Popup>
                                        {d.status === 'ALERT' && <Circle center={[d.lat || 0, d.lng || 0]} radius={1500} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }} />}
                                    </Marker>
                                );
                            })}
                            {/* Fence line connecting all devices */}
                            {devices.length > 1 && (() => {
                                const sorted = [...devices]
                                    .filter(d => d.lat && d.lng)
                                    .sort((a, b) => a.lng - b.lng || a.lat - b.lat);
                                const positions = sorted.map(d => [d.lat, d.lng]);
                                return (
                                    <Polyline
                                        positions={positions}
                                        pathOptions={{
                                            color: isDark ? '#888' : '#555',
                                            weight: 2.5,
                                            dashArray: '10, 8',
                                            dashOffset: '0',
                                            opacity: 0.7,
                                            lineCap: 'round'
                                        }}
                                    />
                                );
                            })()}
                        </MapContainer>
                    </div>
                </div>

                {/* Active Alerts Panel */}
                <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: '480px' }}>
                    <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between shrink-0">
                        <h2 className="font-semibold text-sm md:text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-danger" /> Alerts</h2>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${alertCount > 0 ? 'bg-danger/20 text-danger' : 'bg-surface-3 text-text-dim'}`}>{alertCount + alertEvents.length}</span>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {alertDevices.length > 0 && alertDevices.map(d => (
                            <div key={d._id} onClick={() => navigate(`/devices/${d._id}`)} className="px-4 md:px-5 py-3 border-b border-border/30 hover:bg-surface-2 cursor-pointer transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
                                    <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{d.name}</p><p className="text-text-dim text-[11px]">{d._id}</p></div>
                                    <ChevronRight className="w-4 h-4 text-text-dim" />
                                </div>
                            </div>
                        ))}
                        {alertEvents.slice(0, 15).map((e, i) => (
                            <div key={i} className="px-4 md:px-5 py-2.5 border-b border-border/20 text-xs">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-3 h-3 text-danger shrink-0" />
                                    <span className="font-medium truncate">{e.deviceName}</span>
                                    <span className="ml-auto text-text-dim whitespace-nowrap">{(e.ts || e._time) ? new Date(e.ts || e._time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                </div>
                                <p className="text-text-dim mt-0.5 pl-5">Peak: {e.peak_g ?? '--'} g</p>
                            </div>
                        ))}
                        {alertDevices.length === 0 && alertEvents.length === 0 && (
                            <div className="px-5 py-8 text-center text-text-dim text-sm"><Activity className="w-8 h-8 mx-auto mb-2 text-text-dim/30" />No active alerts</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
                    <h2 className="font-semibold text-sm md:text-base mb-3 md:mb-4">Peak G — All Devices</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={chartData}>
                            <defs><linearGradient id="lpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.line} stopOpacity={0.15} /><stop offset="100%" stopColor={c.line} stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                            <XAxis dataKey="time" tick={{ fill: c.tick, fontSize: 10 }} />
                            <YAxis tick={{ fill: c.tick, fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: c.tBg, border: `1px solid ${c.tBorder}`, borderRadius: 8, color: c.tColor, fontSize: 12 }} />
                            <Area type="monotone" dataKey="peak_g" stroke={c.line} strokeWidth={2} fill="url(#lpg)" dot={false} name="Max Peak G" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-4 md:p-5">
                    <h2 className="font-semibold text-sm md:text-base mb-3 md:mb-4">Event & Alert Frequency</h2>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                            <XAxis dataKey="time" tick={{ fill: c.tick, fontSize: 10 }} />
                            <YAxis tick={{ fill: c.tick, fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: c.tBg, border: `1px solid ${c.tBorder}`, borderRadius: 8, color: c.tColor, fontSize: 12 }} />
                            <Bar dataKey="events" fill={isDark ? '#555' : '#ccc'} radius={[4, 4, 0, 0]} name="Events" />
                            <Bar dataKey="alerts" fill="#ef4444" radius={[4, 4, 0, 0]} name="Rockfall Alerts" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Event Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex items-center justify-between">
                    <h2 className="font-semibold text-sm md:text-base">All Events (24h)</h2>
                    <span className="text-text-dim text-xs">{events.length} events</span>
                </div>
                <div className="overflow-x-auto" style={{ maxHeight: '400px' }}>
                    <table className="w-full text-xs md:text-sm">
                        <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#111]' : 'bg-white'}`}>
                            <tr className="text-text-muted text-xs border-b border-border">
                                {['Time', 'Device', 'Type', 'Peak G', 'Duration', 'Battery', 'Signal'].map(h => <th key={h} className="px-3 md:px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {events.slice(0, 80).map((e, i) => {
                                const Icon = eventIcons[e.event_type] || Activity;
                                return (
                                    <tr key={i} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-3 md:px-4 py-2.5 text-text-muted whitespace-nowrap">{(e.ts || e._time) ? new Date(e.ts || e._time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5 font-medium truncate max-w-[120px]" title={e.deviceName}>{e.deviceName}</td>
                                        <td className="px-3 md:px-4 py-2.5"><span className="flex items-center gap-1 text-xs font-medium" style={{ color: eventColors[e.event_type] || (isDark ? '#999' : '#666') }}><Icon className="w-3 h-3" />{e.event_type || '--'}</span></td>
                                        <td className="px-3 md:px-4 py-2.5 font-mono font-semibold">{e.peak_g ?? '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5">{e.duration_ms ?? '--'} ms</td>
                                        <td className="px-3 md:px-4 py-2.5">{battPct(e.battery) ?? '--'}%</td>
                                        <td className="px-3 md:px-4 py-2.5">{csqPct(e.csq) ?? '--'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {events.length === 0 && <p className="text-center text-text-dim py-10">No events in the last 24 hours</p>}
                </div>
            </div>

            {/* All Devices Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border">
                    <h2 className="font-semibold text-sm md:text-base">All Devices ({devices.length})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs md:text-sm">
                        <thead><tr className="text-text-muted text-xs border-b border-border">
                            {['Device', 'Status', 'Battery', 'Signal', 'Last Event', 'Last Seen', ''].map(h => <th key={h} className="px-3 md:px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {devices.map(d => (
                                <tr key={d._id} className="border-b border-border/30 hover:bg-surface-2 transition">
                                    <td className="px-3 md:px-4 py-2.5"><p className="font-medium">{d.name}</p><p className="text-text-dim text-[10px]">{d._id}</p></td>
                                    <td className="px-3 md:px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[d.status]}`}>{d.status}</span></td>
                                    <td className="px-3 md:px-4 py-2.5"><div className="flex items-center gap-1.5"><Battery className="w-3.5 h-3.5 text-text-dim" />{battPct(d.battery) ?? '--'}%</div></td>
                                    <td className="px-3 md:px-4 py-2.5"><div className="flex items-center gap-1"><Signal className="w-3.5 h-3.5 text-text-dim" />{csqPct(d.csq) ?? '--'}</div></td>
                                    <td className="px-3 md:px-4 py-2.5 text-text-dim">{d.lastEvent?.type || 'N/A'}</td>
                                    <td className="px-3 md:px-4 py-2.5 text-text-dim whitespace-nowrap">{d.lastSeen ? new Date(d.lastSeen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}</td>
                                    <td className="px-3 md:px-4 py-2.5"><button onClick={() => navigate(`/devices/${d._id}`)} className={`text-xs font-medium px-3 py-1 rounded-lg transition ${isDark ? 'hover:bg-surface-3' : 'hover:bg-[#f0f0f0]'}`}>View →</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {devices.length === 0 && <p className="text-center text-text-dim py-8">No devices assigned to this location</p>}
                </div>
            </div>

            {/* Assigned Users */}
            {locUsers.length > 0 && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                    <div className="px-4 md:px-5 py-3 border-b border-border"><h2 className="font-semibold text-sm md:text-base">Assigned Users ({locUsers.length})</h2></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 divide-border/30">
                        {locUsers.map(u => (
                            <div key={u._id} className="px-4 md:px-5 py-3 flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-surface-3' : 'bg-[#e8e8e8]'}`}>{u.name?.charAt(0)}</div>
                                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{u.name}</p><p className="text-text-dim text-[10px] truncate">{u.email}</p></div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${u.role === 'ORG_ADMIN' ? 'bg-warning/20 text-warning' : 'bg-info/20 text-info'}`}>{u.role}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
