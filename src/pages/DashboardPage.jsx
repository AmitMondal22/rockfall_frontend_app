import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Cpu, Battery, Signal, AlertTriangle, Activity, Clock, ChevronRight, Wifi, ShieldCheck, Zap, MapPin } from 'lucide-react';
import { DashboardSkeleton } from '../components/Skeleton';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' };
const statusBg = { ONLINE: 'bg-emerald-500/10', ALERT: 'bg-red-500/10', MAINTENANCE: 'bg-amber-500/10' };
const statusText = { ONLINE: 'text-success', ALERT: 'text-danger', MAINTENANCE: 'text-warning' };
const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

const makeIcon = (status, isDark) => L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${statusColors[status] || '#666'};border:3px solid ${isDark ? '#111' : '#fff'};box-shadow:0 0 14px ${statusColors[status] || '#666'}50;transition:all .3s"></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14]
});

const TILE_URLS = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};

const timeAgo = (ts) => {
    if (!ts) return 'Never';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
};

export default function DashboardPage() {
    const [devices, setDevices] = useState([]);
    const [selected, setSelected] = useState(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    const fetchDevices = () => {
        api.devices.getAll().then(d => {
            setDevices(d.devices || []);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    };

    useEffect(() => {
        fetchDevices();
        const pollInterval = setInterval(fetchDevices, 10000);

        wsService.connect('/ws/dashboard');
        const unsubStatus = wsService.on('ws_status', (s) => setWsConnected(s.connected));
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

        return () => { clearInterval(pollInterval); unsub(); unsubStatus(); wsService.disconnect(); };
    }, []);

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const alertCount = devices.filter(d => d.status === 'ALERT').length;
    const maintenanceCount = devices.filter(d => d.status === 'MAINTENANCE').length;
    const center = devices.length > 0 ? [devices[0].lat || 22.57, devices[0].lng || 88.36] : [22.5726, 88.3639];

    if (loading) return <DashboardSkeleton />;

    const stats = [
        {
            label: 'Total Devices', value: devices.length, icon: Cpu,
            gradient: isDark ? 'from-white/5 to-white/[0.02]' : 'from-slate-100 to-white',
            iconBg: isDark ? 'bg-white/10' : 'bg-slate-100',
            color: isDark ? 'text-white' : 'text-slate-900'
        },
        {
            label: 'Online', value: onlineCount, icon: Wifi,
            gradient: isDark ? 'from-emerald-500/10 to-emerald-500/[0.02]' : 'from-emerald-50 to-white',
            iconBg: isDark ? 'bg-emerald-500/15' : 'bg-emerald-100',
            color: 'text-success'
        },
        {
            label: 'Alerts', value: alertCount, icon: AlertTriangle,
            gradient: isDark ? 'from-red-500/10 to-red-500/[0.02]' : 'from-red-50 to-white',
            iconBg: isDark ? 'bg-red-500/15' : 'bg-red-100',
            color: 'text-danger'
        },
        {
            label: 'Maintenance', value: maintenanceCount, icon: ShieldCheck,
            gradient: isDark ? 'from-amber-500/10 to-amber-500/[0.02]' : 'from-amber-50 to-white',
            iconBg: isDark ? 'bg-amber-500/15' : 'bg-amber-100',
            color: 'text-warning'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-text-muted text-sm mt-1">Welcome back, <span className="font-medium">{user?.name}</span></p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${wsConnected
                        ? (isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600')
                        : (isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-600')
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {wsConnected ? 'Live' : 'Offline'}
                    </span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                {stats.map((s, i) => (
                    <div key={s.label}
                        className={`relative overflow-hidden bg-gradient-to-br ${s.gradient} bg-surface border border-border rounded-2xl p-5 hover:border-border-light transition-all duration-300 hover:shadow-lg group`}
                        style={{ animationDelay: `${i * 80}ms`, animation: 'fadeSlideUp 0.4s ease-out both' }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-text-muted text-sm font-medium">{s.label}</span>
                            <div className={`w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
                                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
                            </div>
                        </div>
                        <p className={`text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
                        <div className="mt-2 text-text-dim text-xs">{s.label === 'Total Devices' ? `${devices.length} registered` : `${Math.round((s.value / (devices.length || 1)) * 100)}% of fleet`}</div>
                    </div>
                ))}
            </div>

            {/* Map + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Map */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden" style={{ minHeight: '350px', height: '500px' }}>
                    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-text-muted" />
                            <h2 className="font-semibold text-sm">Device Map</h2>
                        </div>
                        <span className="text-text-dim text-xs">{devices.length} devices</span>
                    </div>
                    <MapContainer key={resolvedTheme} center={center} zoom={6} style={{ height: 'calc(100% - 48px)', width: '100%' }} attributionControl={false}>
                        <TileLayer url={isDark ? TILE_URLS.dark : TILE_URLS.light} />
                        {devices.map(d => (
                            <Marker key={d._id} position={[d.lat || 0, d.lng || 0]} icon={makeIcon(d.status, isDark)}
                                eventHandlers={{ click: () => setSelected(d) }}>
                                <Popup>
                                    <div className="text-sm" style={{ color: '#111', minWidth: 150 }}>
                                        <p className="font-bold text-[13px]">{d.name}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">{d._id}</p>
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <span className={`w-2 h-2 rounded-full`} style={{ background: statusColors[d.status] }} />
                                            <span className="text-[11px] font-medium">{d.status}</span>
                                        </div>
                                        <button onClick={() => navigate(`/devices/${d._id}`)}
                                            className="mt-2 w-full text-center py-1.5 bg-[#111] text-white rounded-lg text-[11px] font-medium hover:bg-[#333] transition">
                                            View Details →
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Selected Device Panel */}
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border">
                            <h2 className="font-semibold text-sm">
                                {selected ? selected.name : 'Select a Device'}
                            </h2>
                            {selected && <p className="text-text-dim text-xs mt-0.5">{selected._id}</p>}
                        </div>
                        {selected ? (
                            <div className="p-4">
                                <div className="space-y-0.5">
                                    {[
                                        { label: 'Status', value: selected.status, icon: Activity, valueClass: statusText[selected.status] || '' },
                                        { label: 'Battery', value: `${battPct(selected.battery) ?? '--'}%`, icon: Battery, valueClass: (battPct(selected.battery) ?? 100) < 20 ? 'text-danger' : 'text-success' },
                                        { label: 'Signal', value: csqPct(selected.csq) ?? '--', icon: Signal, valueClass: 'text-info' },
                                        { label: 'Last Event', value: selected.lastEvent?.type || 'N/A', icon: Zap, valueClass: 'text-warning' },
                                        { label: 'Peak G', value: selected.lastEvent?.peak_g ?? '--', icon: Activity },
                                        { label: 'Last Seen', value: timeAgo(selected.lastSeen), icon: Clock, valueClass: 'text-text-muted' }
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                                            <div className="flex items-center gap-2.5 text-text-muted text-xs">
                                                <div className={`w-7 h-7 rounded-lg ${isDark ? 'bg-white/5' : 'bg-slate-50'} flex items-center justify-center`}>
                                                    <item.icon className="w-3.5 h-3.5" />
                                                </div>
                                                {item.label}
                                            </div>
                                            <span className={`text-sm font-semibold ${item.valueClass || ''}`}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => navigate(`/devices/${selected._id}`)}
                                    className={`w-full mt-4 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${isDark ? 'bg-white text-black hover:bg-[#e0e0e0]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>
                                    View Full Details <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="p-6 text-center">
                                <div className={`w-12 h-12 rounded-2xl ${isDark ? 'bg-white/5' : 'bg-slate-50'} flex items-center justify-center mx-auto mb-3`}>
                                    <MapPin className="w-5 h-5 text-text-dim" />
                                </div>
                                <p className="text-text-dim text-sm">Click a marker on the map to view device info</p>
                            </div>
                        )}
                    </div>

                    {/* Devices List */}
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                            <h2 className="font-semibold text-sm">All Devices</h2>
                            <span className="text-text-dim text-xs">{devices.length} total</span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {devices.length === 0 ? (
                                <p className="text-text-dim text-sm text-center py-6">No devices found</p>
                            ) : (
                                devices.map(d => (
                                    <button key={d._id} onClick={() => { setSelected(d); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 text-left transition-all duration-150 hover:bg-surface-2 ${selected?._id === d._id ? (isDark ? 'bg-white/5' : 'bg-slate-50') : ''}`}>
                                        <div className="relative">
                                            <div className={`w-9 h-9 rounded-xl ${statusBg[d.status] || 'bg-gray-100'} flex items-center justify-center`}>
                                                <Cpu className={`w-4 h-4 ${statusText[d.status] || 'text-text-dim'}`} />
                                            </div>
                                            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${isDark ? 'border-[#111]' : 'border-white'}`}
                                                style={{ background: statusColors[d.status] || '#666' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{d.name}</p>
                                            <p className="text-text-dim text-[11px] truncate">{d._id}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[11px] text-text-dim">{timeAgo(d.lastSeen)}</p>
                                            <div className="flex items-center gap-1 mt-0.5 justify-end">
                                                <Battery className="w-3 h-3 text-text-dim" />
                                                <span className="text-[11px] text-text-dim">{battPct(d.battery) ?? '--'}%</span>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-text-dim/50 shrink-0" />
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Recent Alerts */}
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-danger" />
                                <h2 className="font-semibold text-sm">Active Alerts</h2>
                            </div>
                            {alertCount > 0 && (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${isDark ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-600'}`}>
                                    {alertCount}
                                </span>
                            )}
                        </div>
                        <div className="p-4">
                            {alertCount === 0 ? (
                                <div className="text-center py-4">
                                    <ShieldCheck className={`w-8 h-8 mx-auto mb-2 ${isDark ? 'text-emerald-400/40' : 'text-emerald-300'}`} />
                                    <p className="text-text-dim text-sm">All clear — no active alerts</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {devices.filter(d => d.status === 'ALERT').slice(0, 5).map(d => (
                                        <button key={d._id} onClick={() => navigate(`/devices/${d._id}`)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 ${isDark ? 'bg-red-500/5 hover:bg-red-500/10 border border-red-500/10' : 'bg-red-50 hover:bg-red-100/70 border border-red-100'}`}>
                                            <div className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
                                            <div className="flex-1 min-w-0 text-left">
                                                <p className="text-sm font-medium truncate">{d.name}</p>
                                                <p className="text-xs text-text-dim truncate">{d.lastEvent?.type || 'Alert'} • {timeAgo(d.lastSeen)}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
