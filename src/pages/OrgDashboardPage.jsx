import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { OrgDashboardSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { ArrowLeft, Building2, MapPin, Cpu, Users, Battery, Signal, AlertTriangle, Activity, ChevronRight } from 'lucide-react';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' };
const statusBadge = { ONLINE: 'bg-success/20 text-success', ALERT: 'bg-danger/20 text-danger', MAINTENANCE: 'bg-warning/20 text-warning' };
const csqPct = (v) => v != null ? `${Math.round((v / 31) * 100)}%` : null;
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

const TILE_URLS = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
};

const makeIcon = (status, isDark) => L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${statusColors[status] || '#666'};border:3px solid ${isDark ? '#111' : '#fff'};box-shadow:0 0 10px ${statusColors[status] || '#666'}50;"></div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
});

const makeAlertIcon = (isDark) => L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;border-radius:50%;background:#ef4444;border:3px solid ${isDark ? '#111' : '#fff'};box-shadow:0 0 16px #ef444480;display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite"><span style="color:#fff;font-size:14px;font-weight:bold">!</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 16]
});

export default function OrgDashboardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

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
                csq: d.csq ?? dev.csq,
                lastSeen: d.ts || msg.timestamp || new Date().toISOString(),
                lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                    type: d.event_type, peak_g: d.peak_g, duration_ms: d.duration_ms, timestamp: d.ts
                } : dev.lastEvent
            } : dev));
        });

        return () => { clearInterval(pollInterval); unsub(); wsService.disconnect(); };
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
        { label: 'Online', value: onlineCount, icon: Activity, color: 'text-success' },
        { label: 'Alerts', value: alertCount, icon: AlertTriangle, color: 'text-danger' },
        { label: 'Users', value: orgUsers.length, icon: Users, color: 'text-info' }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/organizations')} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition"><ArrowLeft className="w-5 h-5" /></button>
                <div className="w-14 h-14 rounded-xl bg-surface-3 flex items-center justify-center"><Building2 className="w-7 h-7 text-text-muted" /></div>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{org.name}</h1>
                        {org.location && (
                            <span className="flex items-center gap-1.5 rounded-full bg-info/20 px-3 py-1 text-xs font-medium text-info">
                                <MapPin className="w-3.5 h-3.5" />{org.location}
                            </span>
                        )}
                    </div>
                    <p className="text-text-muted text-sm mt-0.5">{org._id} • {org.address || 'No address'} {org.contactEmail ? `• ${org.contactEmail}` : ''}</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
                {stats.map(s => (
                    <div key={s.label} className="bg-surface border border-border rounded-2xl p-4 hover:border-border-light transition">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-text-muted text-xs">{s.label}</span>
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Map + Alerts */}
            <div className="grid grid-cols-3 gap-6">
                {/* Map showing all devices + alert markers */}
                <div className="col-span-2 bg-surface border border-border rounded-2xl overflow-hidden" style={{ height: '520px' }}>
                    <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                        <h2 className="font-semibold">Device Map — {org.name}</h2>
                        <span className="text-text-dim text-xs">{devices.length} devices</span>
                    </div>
                    <MapContainer key={resolvedTheme} center={center} zoom={8} style={{ height: 'calc(100% - 48px)', width: '100%' }} attributionControl={false}>
                        <TileLayer url={isDark ? TILE_URLS.dark : TILE_URLS.light} />
                        {devices.map(d => {
                            const isAlert = d.status === 'ALERT';
                            return (
                                <Marker key={d._id} position={[d.lat || 0, d.lng || 0]}
                                    icon={isAlert ? makeAlertIcon(isDark) : makeIcon(d.status, isDark)}>
                                    <Popup>
                                        <div style={{ color: '#111', fontSize: 13, minWidth: 180 }}>
                                            <p style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</p>
                                            <p style={{ fontSize: 11, color: '#666' }}>{d._id}</p>
                                            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 11 }}>
                                                <span>Status: <b style={{ color: statusColors[d.status] }}>{d.status}</b></span>
                                                <span>Battery: <b>{battPct(d.battery) ?? '--'}%</b></span>
                                                <span>Signal: <b>{csqPct(d.csq) ?? '--'}</b></span>
                                                <span>Peak G: <b>{d.lastEvent?.peak_g ?? '--'}</b></span>
                                            </div>
                                            {isAlert && <p style={{ marginTop: 6, color: '#ef4444', fontWeight: 600, fontSize: 11 }}>⚠️ ALERT ACTIVE</p>}
                                            <button onClick={() => navigate(`/devices/${d._id}`)} style={{ marginTop: 8, color: '#2563eb', fontSize: 11, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none' }}>View Details →</button>
                                        </div>
                                    </Popup>
                                    {isAlert && <Circle center={[d.lat || 0, d.lng || 0]} radius={2000} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }} />}
                                </Marker>
                            );
                        })}
                    </MapContainer>
                </div>

                {/* Alerts Section */}
                <div className="space-y-4">
                    <div className="bg-surface border border-border rounded-2xl overflow-hidden" style={{ maxHeight: '520px' }}>
                        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                            <h2 className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-danger" /> Active Alerts</h2>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${alertCount > 0 ? 'bg-danger/20 text-danger' : 'bg-surface-3 text-text-dim'}`}>{alertCount}</span>
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
                            {alertDevices.length > 0 ? alertDevices.map(d => (
                                <div key={d._id} onClick={() => navigate(`/devices/${d._id}`)}
                                    className="px-5 py-3 border-b border-border/30 hover:bg-surface-2 cursor-pointer transition">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{d.name}</p>
                                            <p className="text-text-dim text-[11px]">{d._id}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-text-dim" />
                                    </div>
                                    <div className="mt-2 flex gap-4 text-[11px] text-text-muted pl-5">
                                        <span>Peak G: <b>{d.lastEvent?.peak_g ?? '--'}</b></span>
                                        <span>Bat: <b>{battPct(d.battery) ?? '--'}%</b></span>
                                        <span>CSQ: <b>{csqPct(d.csq) ?? '--'}</b></span>
                                    </div>
                                </div>
                            )) : (
                                <div className="px-5 py-8 text-center text-text-dim text-sm">
                                    <Activity className="w-8 h-8 mx-auto mb-2 text-text-dim/30" />
                                    No active alerts
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* All Devices List */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <h2 className="font-semibold">All Devices ({devices.length})</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead><tr className="text-text-muted text-xs border-b border-border">
                            {['Device ID', 'Name', 'Status', 'Battery', 'Signal', 'Peak G', 'Last Event', 'Action'].map(h => <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {devices.map(d => (
                                <tr key={d._id} className="border-b border-border/30 hover:bg-surface-2 transition">
                                    <td className="px-4 py-2.5 font-mono text-xs">{d._id}</td>
                                    <td className="px-4 py-2.5 font-medium">{d.name}</td>
                                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[d.status]}`}>{d.status}</span></td>
                                    <td className="px-4 py-2.5"><div className="flex items-center gap-1"><Battery className="w-3.5 h-3.5 text-text-dim" />{battPct(d.battery) ?? '--'}%</div></td>
                                    <td className="px-4 py-2.5"><div className="flex items-center gap-1"><Signal className="w-3.5 h-3.5 text-text-dim" />{csqPct(d.csq) ?? '--'}</div></td>
                                    <td className="px-4 py-2.5 font-medium">{d.lastEvent?.peak_g ?? '--'}</td>
                                    <td className="px-4 py-2.5 text-text-dim">{d.lastEvent?.type || 'N/A'}</td>
                                    <td className="px-4 py-2.5">
                                        <button onClick={() => navigate(`/devices/${d._id}`)} className="rounded-lg px-3 py-1 text-xs font-medium text-text transition hover:bg-surface-3">View →</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {devices.length === 0 && <p className="text-center text-text-dim py-8">No devices assigned</p>}
                </div>
            </div>

            {/* Assigned Users */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                    <h2 className="font-semibold">Assigned Users ({orgUsers.length})</h2>
                </div>
                <div className="divide-y divide-border/30">
                    {orgUsers.map(u => (
                        <div key={u._id} className="px-5 py-3 flex items-center gap-4 hover:bg-surface-2 transition">
                            <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center text-sm font-bold">{u.name?.charAt(0)}</div>
                            <div className="flex-1">
                                <p className="text-sm font-medium">{u.name}</p>
                                <p className="text-text-dim text-xs">{u.email}</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${u.role === 'ORG_ADMIN' ? 'bg-warning/20 text-warning' : u.role === 'SUPER_ADMIN' ? 'bg-surface-3 text-text' : 'bg-info/20 text-info'}`}>{u.role}</span>
                            <span className="text-text-dim text-xs">{u.assignedDevices?.length || 0} devices</span>
                        </div>
                    ))}
                    {orgUsers.length === 0 && <p className="text-center text-text-dim py-8 text-sm">No users assigned</p>}
                </div>
            </div>
        </div>
    );
}
