import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Cpu, Battery, Signal, AlertTriangle, Activity, Clock, ChevronRight, Wifi, ShieldCheck, Zap, MapPin } from 'lucide-react';
import { DashboardSkeleton } from '../components/Skeleton';
import FreeMapLayerControl from '../components/FreeMapLayerControl';
import {
    FREE_TILE_LAYERS,
    getDefaultFreeTile,
    createDeviceMarkerIcon,
    MapBoundsFitter,
    MapResizer
} from '../utils/mapUtils';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' };
const statusBg = { ONLINE: 'bg-emerald-500/10', ALERT: 'bg-red-500/10', MAINTENANCE: 'bg-amber-500/10' };
const statusText = { ONLINE: 'text-success', ALERT: 'text-danger', MAINTENANCE: 'text-warning' };
const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

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
    const [activeLayerId, setActiveLayerId] = useState('auto');
    const { user } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    const activeTileLayer = useMemo(() => {
        if (activeLayerId === 'auto') return getDefaultFreeTile(isDark);
        return FREE_TILE_LAYERS[activeLayerId] || getDefaultFreeTile(isDark);
    }, [activeLayerId, isDark]);

    const fetchDevices = () => {
        api.devices.getAll().then(d => {
            const list = (d.devices || []).map(dev => ({
                ...dev,
                _id: dev._id || dev.id,
                id: dev.id || dev._id
            }));
            setDevices(list);
            if (list.length > 0) {
                setSelected(prev => {
                    if (!prev) return list[0];
                    const prevId = prev._id || prev.id;
                    const found = list.find(item => (item._id || item.id) === prevId);
                    return found || list[0];
                });
            }
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
            setDevices(prev => prev.map(dev => {
                const devId = dev._id || dev.id;
                return devId === msg.deviceId ? {
                    ...dev,
                    status: 'ONLINE',
                    battery: d.battery != null ? d.battery : dev.battery,
                    csq: d.csq ?? dev.csq,
                    lastSeen: d.ts || msg.timestamp || new Date().toISOString(),
                    lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                        type: d.event_type, peak_g: d.peak_g, duration_ms: d.duration_ms, timestamp: d.ts
                    } : dev.lastEvent
                } : dev;
            }));
        });

        return () => {
            clearInterval(pollInterval);
            unsubStatus();
            unsub();
            wsService.disconnect();
        };
    }, []);

    if (loading) return <DashboardSkeleton />;

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const alertCount = devices.filter(d => d.status === 'ALERT').length;
    const center = devices.length > 0
        ? [devices.reduce((s, d) => s + (d.lat || 0), 0) / devices.length, devices.reduce((s, d) => s + (d.lng || 0), 0) / devices.length]
        : [22.5726, 88.3639];

    const selectedId = selected ? (selected._id || selected.id) : null;

    return (
        <div className="space-y-6">
            {/* Header / Hero */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
                    <p className="text-text-muted text-sm mt-1">Real-time rockfall hazard & IoT sensor telemetry</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${wsConnected ? (isDark ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (isDark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700')}`}>
                        <Wifi className="w-3.5 h-3.5" />
                        <span>{wsConnected ? 'Live Stream Active' : 'Polling Data'}</span>
                    </div>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Total Devices', value: devices.length, sub: 'Registered sensors', icon: Cpu, color: 'text-text' },
                    { label: 'Online Sensors', value: onlineCount, sub: `${devices.length ? Math.round((onlineCount / devices.length) * 100) : 0}% operational`, icon: Activity, color: 'text-success' },
                    { label: 'Active Alerts', value: alertCount, sub: alertCount > 0 ? 'Action required' : 'All clear', icon: AlertTriangle, color: alertCount > 0 ? 'text-danger' : 'text-text-muted' },
                    { label: 'System Health', value: '100%', sub: 'All services online', icon: ShieldCheck, color: 'text-info' }
                ].map(stat => (
                    <div key={stat.label} className="bg-surface border border-border rounded-2xl p-5 hover:border-border-hover transition-all duration-200">
                        <div className="flex items-center justify-between">
                            <span className="text-text-muted text-xs font-medium">{stat.label}</span>
                            <div className={`w-9 h-9 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-50'} flex items-center justify-center`}>
                                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            </div>
                        </div>
                        <p className={`text-2xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
                        <p className="text-text-dim text-xs mt-1">{stat.sub}</p>
                    </div>
                ))}
            </div>

            {/* Main Content Grid: Map + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Map */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden relative flex flex-col shadow-sm" style={{ minHeight: '380px', height: '520px' }}>
                    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface-2/40">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                            <h2 className="font-semibold text-sm">Real-time Telemetry Sensor Map</h2>
                        </div>
                        <span className="text-text-dim text-xs font-semibold">{devices.length} sensors mapped</span>
                    </div>

                    <div className="flex-1 w-full relative map-container-isolated">
                        <FreeMapLayerControl
                            currentLayerId={activeLayerId}
                            onSelectLayer={setActiveLayerId}
                            isDark={isDark}
                            position="top-right"
                        />

                        <MapContainer
                            key={`${resolvedTheme}-${activeLayerId}`}
                            center={center}
                            zoom={6}
                            style={{ height: '100%', width: '100%' }}
                            attributionControl={false}
                        >
                            <TileLayer
                                url={activeTileLayer.url}
                                attribution={activeTileLayer.attribution}
                                maxZoom={activeTileLayer.maxZoom || 19}
                                subdomains={activeTileLayer.subdomains || 'abc'}
                            />
                            <MapResizer />
                            <MapBoundsFitter points={devices.map(d => ({ lat: d.lat, lng: d.lng }))} maxZoom={14} />

                            {devices.map(d => {
                                const dId = d._id || d.id;
                                const isSelected = selectedId === dId;
                                const markerIcon = createDeviceMarkerIcon({
                                    status: d.status,
                                    isDark,
                                    eventType: d.lastEvent?.type,
                                    selected: isSelected,
                                    size: isSelected ? 36 : 30
                                });

                                return (
                                    <Marker
                                        key={dId}
                                        position={[d.lat || 0, d.lng || 0]}
                                        icon={markerIcon}
                                        eventHandlers={{ click: () => setSelected(d) }}
                                    >
                                        <Popup>
                                            <div className="text-sm p-1" style={{ color: '#111', minWidth: 160 }}>
                                                <p className="font-bold text-[13px]">{d.name}</p>
                                                <p className="text-[11px] font-mono text-gray-500 mt-0.5">{dId}</p>
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    <span className="w-2 h-2 rounded-full" style={{ background: statusColors[d.status] || '#666' }} />
                                                    <span className="text-[11px] font-semibold">{d.status}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-700">
                                                    <div>Battery: <b>{battPct(d.battery) != null ? `${battPct(d.battery)}%` : '--'}</b></div>
                                                    <div>Signal: <b>{csqPct(d.csq) ?? '--'}</b></div>
                                                </div>
                                                <button
                                                    onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)}
                                                    className="mt-2.5 w-full text-center py-1.5 bg-[#111] text-white rounded-lg text-[11px] font-medium hover:bg-[#333] transition"
                                                >
                                                    View Details →
                                                </button>
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Selected Device Panel */}
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border">
                            <h2 className="font-semibold text-sm">
                                {selected ? selected.name : 'Select a Device'}
                            </h2>
                            {selected && <p className="text-text-dim text-xs mt-0.5">{selectedId}</p>}
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
                                <button onClick={() => selectedId && navigate(`/devices/${encodeURIComponent(selectedId)}`)}
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
                                devices.map(d => {
                                    const dId = d._id || d.id;
                                    return (
                                        <button key={dId} onClick={() => { setSelected(d); }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-0 text-left transition-all duration-150 hover:bg-surface-2 ${selectedId === dId ? (isDark ? 'bg-white/5' : 'bg-slate-50') : ''}`}>
                                            <div className="relative">
                                                <div className={`w-9 h-9 rounded-xl ${statusBg[d.status] || 'bg-gray-100'} flex items-center justify-center`}>
                                                    <Cpu className={`w-4 h-4 ${statusText[d.status] || 'text-text-dim'}`} />
                                                </div>
                                                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${isDark ? 'border-[#111]' : 'border-white'}`}
                                                    style={{ background: statusColors[d.status] || '#666' }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold truncate">{d.name}</p>
                                                <p className="text-[11px] text-text-dim truncate">{dId}</p>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Active Alerts */}
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
                                    {devices.filter(d => d.status === 'ALERT').slice(0, 5).map(d => {
                                        const dId = d._id || d.id;
                                        return (
                                            <button key={dId} onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-150 ${isDark ? 'bg-red-500/5 hover:bg-red-500/10 border border-red-500/10' : 'bg-red-50 hover:bg-red-100/70 border border-red-100'}`}>
                                                <div className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
                                                <div className="flex-1 min-w-0 text-left">
                                                    <p className="text-sm font-medium truncate">{d.name}</p>
                                                    <p className="text-xs text-text-dim truncate">{d.lastEvent?.type || 'Alert'} • {timeAgo(d.lastSeen)}</p>
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
