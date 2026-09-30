import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { OrgDashboardSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { ArrowLeft, Building2, MapPin, Cpu, Users, Battery, Signal, AlertTriangle, Activity, ChevronRight } from 'lucide-react';
import FreeMapLayerControl from '../components/FreeMapLayerControl';
import {
    FREE_TILE_LAYERS,
    getDefaultFreeTile,
    createDeviceMarkerIcon,
    MapBoundsFitter,
    MapResizer
} from '../utils/mapUtils';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' };
const statusBadge = { ONLINE: 'bg-success/20 text-success', ALERT: 'bg-danger/20 text-danger', MAINTENANCE: 'bg-warning/20 text-warning' };
const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

export default function OrgDashboardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const [activeLayerId, setActiveLayerId] = useState('auto');
    const isDark = resolvedTheme === 'dark';

    const activeTileLayer = useMemo(() => {
        if (activeLayerId === 'auto') return getDefaultFreeTile(isDark);
        return FREE_TILE_LAYERS[activeLayerId] || getDefaultFreeTile(isDark);
    }, [activeLayerId, isDark]);

    const [org, setOrg] = useState(null);
    const [devices, setDevices] = useState([]);
    const [orgUsers, setOrgUsers] = useState([]);

    const fetchOrgData = useCallback(() => {
        if (!id || id === 'undefined' || id === 'null') {
            api.organizations.getAll().then(d => {
                const list = d.organizations || [];
                if (list.length > 0) {
                    const first = list[0];
                    setOrg(first);
                    setDevices(first.devices || []);
                    setOrgUsers(first.users || []);
                }
            }).catch(console.error);
            return;
        }
        api.organizations.getById(id).then(d => {
            if (d && d.organization) setOrg(d.organization);
        }).catch(console.error);
        api.devices.getAll().then(d => {
            const orgDevices = (d.devices || []).filter(dev => (dev.organizationId || dev.org_id) === id);
            setDevices(orgDevices);
        }).catch(console.error);
        api.users.getAll().then(d => {
            setOrgUsers((d.users || []).filter(u => (u.organizationId || u.org_id) === id));
        }).catch(() => { });
    }, [id]);

    useEffect(() => {
        fetchOrgData();
        const pollInterval = setInterval(fetchOrgData, 10000);

        wsService.connect('/ws/dashboard');
        const unsub = wsService.on('device_update', (msg) => {
            const d = msg.data || {};
            setDevices(prev => prev.map(dev => (dev._id === msg.deviceId || dev.id === msg.deviceId) ? {
                ...dev,
                status: 'ONLINE',
                battery: d.battery != null ? d.battery : dev.battery,
                csq: d.csq != null ? d.csq : dev.csq,
                lastSeen: d.ts || msg.timestamp || new Date().toISOString(),
                lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                    type: d.event_type, peak_g: d.peak_g, duration_ms: d.duration_ms, timestamp: d.ts
                } : dev.lastEvent
            } : dev));
        });

        return () => {
            clearInterval(pollInterval);
            unsub();
            wsService.disconnect();
        };
    }, [fetchOrgData]);

    if (!org) return <OrgDashboardSkeleton />;

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const alertCount = devices.filter(d => d.status === 'ALERT').length;
    const alertDevices = devices.filter(d => d.status === 'ALERT');

    const center = devices.length > 0
        ? [devices.reduce((s, d) => s + (d.lat || 0), 0) / devices.length, devices.reduce((s, d) => s + (d.lng || 0), 0) / devices.length]
        : [22.5726, 88.3639];

    const stats = [
        { label: 'Total Devices', value: devices.length, icon: Cpu, color: 'text-text' },
        { label: 'Online Sensors', value: onlineCount, icon: Activity, color: 'text-success' },
        { label: 'Active Alerts', value: alertCount, icon: AlertTriangle, color: alertCount > 0 ? 'text-danger' : 'text-text-muted' },
        { label: 'Assigned Users', value: orgUsers.length, icon: Users, color: 'text-info' }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/organizations')} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">{org.name}</h1>
                    <p className="text-text-dim text-xs mt-0.5 flex items-center gap-2">
                        {org.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{org.location}</span>}
                        {org.contactEmail && <span>• {org.contactEmail}</span>}
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4">
                {stats.map(s => (
                    <div key={s.label} className="bg-surface border border-border rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-text-muted text-xs">{s.label}</span>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Map + Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Map showing all devices + alert markers */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden relative flex flex-col shadow-sm" style={{ minHeight: '380px', height: '520px' }}>
                    <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0 bg-surface-2/40">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                            <h2 className="font-semibold text-sm">Device Map — {org.name}</h2>
                        </div>
                        <span className="text-text-dim text-xs font-semibold">{devices.length} devices</span>
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
                            zoom={8}
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
                                const isAlert = d.status === 'ALERT';
                                const markerIcon = createDeviceMarkerIcon({
                                    status: d.status,
                                    isDark,
                                    eventType: d.lastEvent?.type,
                                    selected: false,
                                    size: isAlert ? 36 : 30
                                });

                                return (
                                    <Marker
                                        key={d._id}
                                        position={[d.lat || 0, d.lng || 0]}
                                        icon={markerIcon}
                                    >
                                        <Popup>
                                            <div style={{ color: '#111', fontSize: 13, minWidth: 180 }} className="p-1">
                                                <p style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</p>
                                                <p style={{ fontSize: 11, color: '#666' }} className="font-mono">{d._id}</p>
                                                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                                                    <span>Status: <b style={{ color: statusColors[d.status] || '#666' }}>{d.status}</b></span>
                                                    <span>Battery: <b>{battPct(d.battery) ?? '--'}%</b></span>
                                                    <span>Signal: <b>{csqPct(d.csq) ?? '--'}</b></span>
                                                    <span>Peak G: <b>{d.lastEvent?.peak_g ?? '--'}</b></span>
                                                </div>
                                                {isAlert && (
                                                    <p style={{ marginTop: 6, color: '#ef4444', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <AlertTriangle style={{ width: 13, height: 13 }} /> ALERT ACTIVE
                                                    </p>
                                                )}
                                                <button onClick={() => navigate(`/devices/${encodeURIComponent(d._id)}`)} style={{ marginTop: 8, color: '#2563eb', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}>View Details →</button>
                                            </div>
                                        </Popup>
                                        {isAlert && <Circle center={[d.lat || 0, d.lng || 0]} radius={2000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }} />}
                                    </Marker>
                                );
                            })}
                        </MapContainer>
                    </div>
                </div>

                {/* Alerts Section */}
                <div className="space-y-4">
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm" style={{ maxHeight: '520px' }}>
                        <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface-2/40">
                            <h2 className="font-semibold flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4 text-danger" /> Active Alerts</h2>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${alertCount > 0 ? 'bg-danger/20 text-danger' : 'bg-surface-3 text-text-dim'}`}>{alertCount}</span>
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
                            {alertDevices.length > 0 ? alertDevices.map(d => (
                                <div key={d._id} onClick={() => navigate(`/devices/${encodeURIComponent(d._id)}`)}
                                    className="px-5 py-3 border-b border-border/30 hover:bg-surface-2 cursor-pointer transition">
                                    <div className="flex items-center gap-3">
                                        <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm truncate">{d.name}</p>
                                            <p className="text-text-dim text-xs font-mono">{d._id}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-text-dim" />
                                    </div>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                                        <span className="flex items-center gap-1"><Battery className="w-3.5 h-3.5" />{battPct(d.battery) ?? '--'}%</span>
                                        <span className="flex items-center gap-1"><Signal className="w-3.5 h-3.5" />{csqPct(d.csq) ?? '--'}</span>
                                        {d.lastEvent && <span>Peak: <b>{d.lastEvent.peak_g || 0}g</b></span>}
                                    </div>
                                </div>
                            )) : (
                                <p className="text-text-dim text-center py-8 text-xs">No active alerts for this organization</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Devices Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface-2/40">
                    <h2 className="font-semibold text-sm">All Devices ({devices.length})</h2>
                    <span className="text-text-dim text-xs">{onlineCount} online</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-text-muted text-xs bg-surface-2/30">
                                {['Device ID', 'Name', 'Status', 'Battery', 'Signal', 'Peak G', 'Last Event', 'Action'].map(h => <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map(d => (
                                <tr key={d._id} className="border-b border-border/30 hover:bg-surface-2 transition">
                                    <td className="px-4 py-2.5 font-mono text-xs">{d._id}</td>
                                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge[d.status] || 'bg-slate-500/20 text-slate-400'}`}>{d.status}</span></td>
                                    <td className="px-4 py-2.5 text-xs">{battPct(d.battery) ?? '--'}%</td>
                                    <td className="px-4 py-2.5 text-xs">{csqPct(d.csq) ?? '--'}</td>
                                    <td className="px-4 py-2.5 text-xs">{d.lastEvent?.peak_g ?? '--'}</td>
                                    <td className="px-4 py-2.5 text-xs text-text-dim">{d.lastEvent?.type || '--'}</td>
                                    <td className="px-4 py-2.5"><button onClick={() => navigate(`/devices/${encodeURIComponent(d._id)}`)} className="text-indigo-400 hover:underline text-xs font-semibold">View →</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Org Users */}
            <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm">
                <h2 className="font-semibold mb-3 flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-indigo-400" /> Assigned Personnel ({orgUsers.length})</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {orgUsers.map(u => (
                        <div key={u._id || u.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center font-bold text-xs text-indigo-400">
                                {(u.name || u.email || 'U')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-xs truncate">{u.name || 'Unnamed'}</p>
                                <p className="text-text-dim text-[11px] truncate">{u.email}</p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-3 border border-border text-text-muted font-mono">{u.role}</span>
                        </div>
                    ))}
                    {orgUsers.length === 0 && <p className="text-text-dim text-xs col-span-full py-4 text-center">No users assigned to this organization</p>}
                </div>
            </div>
        </div>
    );
}
