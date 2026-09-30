import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline } from 'react-leaflet';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import wsService from '../services/websocket';
import { OrgDashboardSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { ArrowLeft, MapPin, Cpu, Users, Battery, Signal, AlertTriangle, Activity, Clock, Zap, ChevronRight, Mountain, Heart, Move, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';
import FreeMapLayerControl from '../components/FreeMapLayerControl';
import {
    FREE_TILE_LAYERS,
    getDefaultFreeTile,
    createDeviceMarkerIcon,
    MapBoundsFitter,
    MapResizer
} from '../utils/mapUtils';

const statusColors = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b', OFFLINE: '#94a3b8' };
const statusBadge = { ONLINE: 'bg-success/20 text-success', ALERT: 'bg-danger/20 text-danger', MAINTENANCE: 'bg-warning/20 text-warning', OFFLINE: 'bg-slate-500/20 text-slate-400' };
const csqPct = (v) => v != null && !isNaN(Number(v)) ? `${Math.min(Math.round((Number(v) / 31) * 100), 100)}%` : '--';
const battPct = (v) => v != null && !isNaN(Number(v)) ? `${Math.max(0, Math.min(Math.round((Number(v) / 13) * 100), 100))}%` : '--';
const eventColors = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', HUMAN: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e', OTHER: '#a855f7' };
const eventIcons = { ROCKFALL: Mountain, HUMAN_ACTIVITY: Users, HUMAN: Users, MOTION: Move, HEARTBEAT: Heart, OTHER: Activity };

const EVENT_EMOJIS = { ROCKFALL: '🪨', HUMAN_ACTIVITY: '🚶', HUMAN: '🚶', MOTION: '🔄', HEARTBEAT: '💚', OTHER: '⚡' };
const EVENT_LABELS = { ROCKFALL: 'Rockfall', HUMAN_ACTIVITY: 'Human', HUMAN: 'Human', MOTION: 'Motion', HEARTBEAT: 'Heartbeat', OTHER: 'Telemetry' };

export default function LocationDashboardPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const [activeLayerId, setActiveLayerId] = useState('auto');
    const isDark = resolvedTheme === 'dark';

    const activeTileLayer = useMemo(() => {
        if (activeLayerId === 'auto') return getDefaultFreeTile(isDark);
        return FREE_TILE_LAYERS[activeLayerId] || getDefaultFreeTile(isDark);
    }, [activeLayerId, isDark]);

    const [loc, setLoc] = useState(null);
    const [devices, setDevices] = useState([]);
    const [locUsers, setLocUsers] = useState([]);
    const [events, setEvents] = useState([]);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const fetchLocData = useCallback(async (isQuiet = false) => {
        if (!isQuiet) setLoading(true);
        setError('');
        try {
            // 1. Fetch location details
            const locRes = await api.locations.getById(id);
            const locationData = locRes.location || locRes.data || locRes;
            if (!locationData) {
                throw new Error('Location not found or has been removed.');
            }
            setLoc(locationData);

            // 2. Fetch all devices to match by locationId, location_id, or location name
            let allDevices = [];
            try {
                const devRes = await api.devices.getAll();
                allDevices = (devRes.devices || []).map(dev => ({
                    ...dev,
                    _id: dev._id || dev.id,
                    id: dev.id || dev._id
                }));
            } catch (err) {
                console.warn('Devices fetch warning:', err.message);
            }

            // Extract location devices from response or allDevices
            const locName = locationData.name;
            const directLocDevices = (locationData.devices || []).map(dev => ({
                ...dev,
                _id: dev._id || dev.id,
                id: dev.id || dev._id
            }));

            let matchedDevices = allDevices.filter(dev => 
                String(dev.locationId || dev.location_id) === String(id) ||
                (locName && dev.location === locName) ||
                dev.location === id
            );

            if (matchedDevices.length === 0 && directLocDevices.length > 0) {
                matchedDevices = directLocDevices;
            }

            // 3. Fetch historical events for all matched devices
            const eventPromises = matchedDevices.map(dev => {
                const devId = dev._id || dev.id;
                return api.historical.getEvents(devId, { range: 'all', limit: '50' })
                    .then(r => (r.events || []).map(e => ({ ...e, deviceName: dev.name, deviceId: devId })))
                    .catch(() => []);
            });

            const results = await Promise.all(eventPromises);
            const allEvents = results.flat().sort((a, b) => {
                const timeA = new Date(a.timestamp || a.ts || a._time || a.createdAt || 0).getTime();
                const timeB = new Date(b.timestamp || b.ts || b._time || b.createdAt || 0).getTime();
                return timeB - timeA;
            });
            setEvents(allEvents);

            // Enrich devices with latest events and coordinates
            const enriched = matchedDevices.map((dev, idx) => {
                const devEvents = results[idx] || [];
                const latestEvt = devEvents.find(e => e.event_type && e.event_type !== 'HEARTBEAT');
                const hb = devEvents.find(e => e.event_type === 'HEARTBEAT');
                const lastEvt = latestEvt || hb;

                return {
                    ...dev,
                    lat: (dev.lat != null && !isNaN(Number(dev.lat))) ? Number(dev.lat) : (locationData.lat ? Number(locationData.lat) : 18.272),
                    lng: (dev.lng != null && !isNaN(Number(dev.lng))) ? Number(dev.lng) : (locationData.lng ? Number(locationData.lng) : 83.078),
                    lastEvent: dev.lastEvent?.type ? dev.lastEvent : (lastEvt ? {
                        type: lastEvt.event_type,
                        peak_g: lastEvt.peak_g,
                        duration_ms: lastEvt.duration_ms,
                        energy_g2: lastEvt.energy_g2,
                        timestamp: lastEvt.timestamp || lastEvt.ts || lastEvt._time || lastEvt.createdAt
                    } : null)
                };
            });
            setDevices(enriched);

            // Aggregate events for chart timeline
            const chartPoints = {};
            allEvents.slice(0, 60).forEach(e => {
                const timeVal = e.timestamp || e.ts || e._time || e.createdAt;
                if (!timeVal) return;
                const d = new Date(timeVal);
                if (isNaN(d.getTime())) return;
                const key = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                if (!chartPoints[key]) chartPoints[key] = { time: key, rawTime: d.getTime(), peak_g: 0, events: 0, energy: 0 };
                chartPoints[key].events++;
                chartPoints[key].peak_g = Math.max(chartPoints[key].peak_g, parseFloat(e.peak_g || 0));
                chartPoints[key].energy = Math.max(chartPoints[key].energy, parseFloat(e.energy_g2 || 0));
            });
            setChartData(Object.values(chartPoints).sort((a, b) => a.rawTime - b.rawTime));

            // 4. Fetch assigned personnel
            try {
                const usersRes = await api.users.getAll();
                const users = (usersRes.users || []).filter(u => 
                    String(u.locationId || u.location_id) === String(id) ||
                    (u.assignedDevices && u.assignedDevices.some(ad => matchedDevices.some(md => md._id === ad)))
                );
                setLocUsers(users);
            } catch (err) {
                console.warn('Users fetch warning:', err.message);
            }

        } catch (err) {
            console.error('Location page load error:', err);
            setError(err.message || 'Failed to load location dashboard data.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchLocData();
        const pollInterval = setInterval(() => fetchLocData(true), 15000);

        wsService.connect('/ws/dashboard');
        const unsub = wsService.on('device_update', (msg) => {
            const d = msg.data || {};
            setDevices(prev => prev.map(dev => {
                const devId = dev._id || dev.id;
                if (devId !== msg.deviceId) return dev;
                const liveTimestamp = d.ts || msg.timestamp || new Date().toISOString();
                return {
                    ...dev,
                    status: 'ONLINE',
                    battery: d.battery != null ? d.battery : dev.battery,
                    csq: d.csq ?? dev.csq,
                    lastSeen: liveTimestamp,
                    lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                        type: d.event_type,
                        peak_g: d.peak_g,
                        duration_ms: d.duration_ms,
                        energy_g2: d.energy_g2,
                        timestamp: liveTimestamp
                    } : dev.lastEvent
                };
            }));
        });

        return () => {
            clearInterval(pollInterval);
            unsub();
            wsService.disconnect();
        };
    }, [fetchLocData]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchLocData(true);
        setRefreshing(false);
    };

    if (loading && !loc) return <OrgDashboardSkeleton />;

    if (error && !loc) {
        return (
            <div className="grid min-h-[420px] place-items-center">
                <div className="max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-lg">
                    <AlertCircle className="mx-auto h-8 w-8 text-danger" />
                    <h1 className="mt-3 text-lg font-semibold">Location unavailable</h1>
                    <p className="mt-2 text-sm text-text-muted">{error}</p>
                    <div className="mt-5 flex items-center justify-center gap-3">
                        <button type="button" onClick={() => navigate('/locations')} className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-surface-2">Back to Locations</button>
                        <button type="button" onClick={() => fetchLocData()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"><RefreshCw className="h-4 w-4" /> Retry</button>
                    </div>
                </div>
            </div>
        );
    }

    const onlineCount = devices.filter(d => d.status === 'ONLINE').length;
    const alertCount = devices.filter(d => d.status === 'ALERT').length;
    const alertDevices = devices.filter(d => d.status === 'ALERT');
    const alertEvents = events.filter(e => e.event_type === 'ROCKFALL' || e.severity === 'CRITICAL');

    // Safe Leaflet center coordinates
    const defaultLat = (loc && loc.lat != null && !isNaN(Number(loc.lat))) ? Number(loc.lat) : 18.272;
    const defaultLng = (loc && loc.lng != null && !isNaN(Number(loc.lng))) ? Number(loc.lng) : 83.078;
    const center = devices.length > 0 && devices[0].lat != null && !isNaN(Number(devices[0].lat))
        ? [Number(devices[0].lat), Number(devices[0].lng)]
        : [defaultLat, defaultLng];

    const chartColors = {
        grid: isDark ? '#222' : '#e0e0e0',
        line: isDark ? '#fff' : '#111',
        tooltip: isDark ? '#111' : '#fff',
        tooltipBorder: isDark ? '#333' : '#e0e0e0',
        tooltipText: isDark ? '#fff' : '#111'
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/locations')} className="p-2.5 rounded-xl border border-border hover:bg-surface-3 transition"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <MapPin className="w-6 h-6 text-indigo-500" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl md:text-2xl font-bold">{loc?.name || 'Monitoring Site'}</h1>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3 border border-border text-text-muted font-mono">{loc?.id || loc?._id || id}</span>
                        </div>
                        <p className="text-text-dim text-xs mt-0.5">{loc?.address || loc?.description || 'Geo-technical Monitoring Site'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs text-text-dim">Auto-refresh: 15s</span>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-2 transition disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-danger">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted text-xs font-medium">Sensors</span>
                        <Cpu className="w-4 h-4 text-indigo-400" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{devices.length}</p>
                    <p className="text-text-dim text-[11px] mt-0.5">Monitoring nodes active</p>
                </div>

                <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted text-xs font-medium">Site Status</span>
                        <Activity className={`w-4 h-4 ${alertCount > 0 ? 'text-danger' : 'text-success'}`} />
                    </div>
                    <p className={`text-2xl font-bold mt-1 ${alertCount > 0 ? 'text-danger' : 'text-success'}`}>
                        {alertCount > 0 ? `${alertCount} ALERT` : 'NORMAL'}
                    </p>
                    <p className="text-text-dim text-[11px] mt-0.5">{alertCount > 0 ? 'Action required' : 'All clear & stable'}</p>
                </div>

                <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted text-xs font-medium">Telemetry Events</span>
                        <Zap className="w-4 h-4 text-warning" />
                    </div>
                    <p className="text-2xl font-bold mt-1">{events.length}</p>
                    <p className="text-text-dim text-[11px] mt-0.5">{alertEvents.length} rockfall / impact</p>
                </div>

                <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted text-xs font-medium">Coordinates</span>
                        <MapPin className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-sm font-bold font-mono mt-2 truncate">{defaultLat.toFixed(4)}, {defaultLng.toFixed(4)}</p>
                    <p className="text-text-dim text-[11px] mt-0.5">{locUsers.length} personnel assigned</p>
                </div>
            </div>

            {/* Main Content Grid: Interactive Map + Alerts Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Interactive Site Map */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm relative" style={{ minHeight: '400px', height: '520px' }}>
                    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface-2/40">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                            <h2 className="font-semibold text-sm">Site Sensors & Barrier Layout Map</h2>
                        </div>
                        <span className="text-text-dim text-xs font-medium">{devices.length} sensors mapped</span>
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
                            zoom={14}
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
                            <MapBoundsFitter
                                points={[
                                    ...devices.map(d => ({ lat: d.lat, lng: d.lng })),
                                    ...(loc?.assets || []).flatMap(a => a.coordinates || [])
                                ]}
                                maxZoom={16}
                            />
                            {devices.map(d => {
                                const dId = d._id || d.id;
                                const evtType = d.lastEvent?.type || 'OTHER';
                                const isAlert = d.status === 'ALERT';
                                const icon = createDeviceMarkerIcon({
                                    status: d.status,
                                    isDark,
                                    eventType: evtType,
                                    selected: false,
                                    size: isAlert ? 36 : 30
                                });
                                const dLat = (d.lat != null && !isNaN(Number(d.lat))) ? Number(d.lat) : defaultLat;
                                const dLng = (d.lng != null && !isNaN(Number(d.lng))) ? Number(d.lng) : defaultLng;

                                return (
                                    <Marker key={dId} position={[dLat, dLng]} icon={icon}>
                                        <Popup>
                                            <div className="text-sm p-1" style={{ color: '#111', minWidth: 180 }}>
                                                <p className="font-bold text-sm">{d.name}</p>
                                                <p className="text-[11px] text-gray-500 font-mono">{dId}</p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusBadge[d.status] || 'bg-slate-500/20 text-slate-400'}`}>{d.status}</span>
                                                    <span className="text-[11px]">🔋 {battPct(d.battery)}</span>
                                                </div>
                                                <div className="mt-1 text-[11px]">
                                                    <span>Signal: <b>{csqPct(d.csq)}</b></span>
                                                </div>
                                                {d.lastEvent && (
                                                    <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 6, background: `${eventColors[evtType] || '#666'}15`, fontSize: 11 }}>
                                                        <span style={{ color: eventColors[evtType] || '#666', fontWeight: 600 }}>{EVENT_EMOJIS[evtType] || '⚡'} {EVENT_LABELS[evtType] || 'Event'}</span>
                                                        {d.lastEvent?.peak_g != null && <span style={{ marginLeft: 8 }}>Peak: <b>{parseFloat(d.lastEvent.peak_g).toFixed(3)}g</b></span>}
                                                    </div>
                                                )}
                                                <button onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)} style={{ marginTop: 8, color: '#2563eb', fontSize: 11, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>View Device Dashboard →</button>
                                            </div>
                                        </Popup>
                                        {d.status === 'ALERT' && <Circle center={[dLat, dLng]} radius={1500} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 1 }} />}
                                    </Marker>
                                );
                            })}
                            {/* Render Deployed Barrier Asset Polylines */}
                            {(loc?.assets || []).map(asset => {
                                const rawCoords = asset.coordinates || [];
                                const validCoords = rawCoords
                                    .filter(c => c && c.lat != null && c.lng != null && !isNaN(Number(c.lat)) && !isNaN(Number(c.lng)))
                                    .map(c => [Number(c.lat), Number(c.lng)]);
                                if (validCoords.length < 2) return null;
                                const bType = asset.asset_type || asset.barrierType || 'FENCE_BARRIER';
                                const color = bType === 'DRAPERY_NET' ? '#10b981' : (bType === 'ROCK_SHED' ? '#94a3b8' : (bType === 'EMBANKMENT' ? '#ea580c' : '#f59e0b'));

                                return (
                                    <Fragment key={asset.id || asset._id}>
                                        <Polyline
                                            positions={validCoords}
                                            pathOptions={{
                                                color: '#1e1b4b',
                                                weight: 10,
                                                opacity: 0.5
                                            }}
                                        />
                                        <Polyline
                                            positions={validCoords}
                                            pathOptions={{
                                                color: color,
                                                weight: 6,
                                                dashArray: bType === 'ROCK_SHED' || bType === 'EMBANKMENT' ? undefined : '12, 6',
                                                opacity: 0.95
                                            }}
                                        />
                                    </Fragment>
                                );
                            })}
                            {devices.length > 1 && (() => {
                                const validPositions = devices
                                    .filter(d => d.lat != null && d.lng != null && !isNaN(Number(d.lat)) && !isNaN(Number(d.lng)))
                                    .map(d => [Number(d.lat), Number(d.lng)]);
                                return validPositions.length > 1 ? (
                                    <Polyline
                                        positions={validPositions}
                                        pathOptions={{
                                            color: isDark ? '#888' : '#555',
                                            weight: 2.5,
                                            dashArray: '10, 8',
                                            opacity: 0.7
                                        }}
                                    />
                                ) : null;
                            })()}
                        </MapContainer>
                    </div>
                </div>

                {/* Active Alerts Panel */}
                <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col shadow-sm" style={{ maxHeight: '500px' }}>
                    <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0 bg-surface-2/40">
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-danger" />
                            Recent Site Incidents
                        </h2>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${alertCount > 0 ? 'bg-danger/20 text-danger' : 'bg-surface-3 text-text-dim'}`}>
                            {alertCount + alertEvents.length}
                        </span>
                    </div>

                    <div className="overflow-y-auto flex-1 p-3 space-y-2">
                        {alertDevices.map(d => {
                            const dId = d._id || d.id;
                            return (
                                <div key={dId} onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)} className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 cursor-pointer transition">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
                                            <p className="font-bold text-xs">{d.name}</p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-text-dim" />
                                    </div>
                                    <p className="text-[11px] text-text-dim mt-1 font-mono">{dId}</p>
                                </div>
                            );
                        })}

                        {alertEvents.slice(0, 20).map((e, i) => (
                            <div key={i} className="p-3 rounded-xl border border-border bg-surface-2/50 text-xs">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-3.5 h-3.5 text-danger shrink-0" />
                                    <span className="font-semibold">{e.deviceName || e.deviceId}</span>
                                    <span className="text-text-dim text-[10px] ml-auto font-mono">
                                        {e.timestamp || e.ts ? new Date(e.timestamp || e.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-1.5 text-[11px] text-text-muted">
                                    <span>Peak: <b className="text-text">{parseFloat(e.peak_g || 0).toFixed(3)} G</b></span>
                                    <span>Dur: <b className="text-text">{e.duration_ms || 0} ms</b></span>
                                    <span>Energy: <b className="text-amber-500">{e.energy_g2 || 0} g²</b></span>
                                </div>
                            </div>
                        ))}

                        {alertDevices.length === 0 && alertEvents.length === 0 && (
                            <div className="p-8 text-center text-text-dim text-xs flex flex-col items-center">
                                <ShieldCheck className="w-8 h-8 mb-2 text-success opacity-80" />
                                <span>No active alerts or critical events for this site</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Location Barrier Assets Section */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h2 className="font-semibold text-sm flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                            Deployed Barrier Assets at {loc?.name}
                        </h2>
                        <p className="text-xs text-text-dim mt-0.5">Flexible rockfall catch fences, drapery nets & mounted telemetry sensors</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => navigate(`/assets/new?locationId=${encodeURIComponent(id)}&orgId=${encodeURIComponent(loc?.organizationId || loc?.org_id || '')}`)}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-500 transition shadow-sm"
                        >
                            + Deploy Barrier Asset
                        </button>
                        <span className="text-xs font-semibold px-2.5 py-1 bg-surface-2 border border-border rounded-lg text-text-muted">
                            {loc?.assets?.length || 0} Barriers
                        </span>
                    </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(loc?.assets || []).map(asset => {
                        const aId = asset.id || asset._id;
                        return (
                            <div
                                key={aId}
                                onClick={() => navigate(`/assets/${aId}`)}
                                className="p-4 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-amber-500/40 transition cursor-pointer space-y-3"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-xs text-text">{asset.name || aId}</h3>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        {asset.asset_type || 'FENCE_BARRIER'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-text-dim pt-2 border-t border-border/50">
                                    <span>Status: <b className="text-emerald-400 font-medium">{asset.status || 'OPERATIONAL'}</b></span>
                                    <span className="font-mono font-bold text-indigo-400 flex items-center gap-1">
                                        <Cpu className="w-3.5 h-3.5" /> {asset.devices?.length || 0} Sensors Mounted
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    {(!loc?.assets || loc.assets.length === 0) && (
                        <div className="col-span-full py-8 text-center text-xs text-text-dim">
                            No barrier assets currently installed at this site location. Click "+ Deploy Barrier Asset" to configure a rockfall barrier.
                        </div>
                    )}
                </div>
            </div>

            {/* Location Sensors Table */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h2 className="font-semibold text-sm">Active Vibration & Impact Sensors</h2>
                        <p className="text-xs text-text-dim mt-0.5">Real-time status, health, and latest impact parameters mounted on barriers</p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-surface-2 border border-border rounded-lg text-text-muted">
                        {devices.length} Devices
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-surface-2/60 border-b border-border text-xs text-text-muted">
                            <tr>
                                {['Device Name', 'Device ID', 'Battery', 'Signal', 'Last Event', 'Peak Force', 'Last Seen', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map(d => {
                                const dId = d._id || d.id;
                                const evtType = d.lastEvent?.type || 'OTHER';
                                const Icon = eventIcons[evtType] || Activity;

                                return (
                                    <tr key={dId} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-4 py-3 font-semibold">{d.name}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-text-dim">{dId}</td>
                                        <td className="px-4 py-3 text-xs">{battPct(d.battery)}</td>
                                        <td className="px-4 py-3 text-xs">{csqPct(d.csq)}</td>
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: eventColors[evtType] || '#999' }}>
                                                <Icon className="w-3.5 h-3.5" />
                                                {evtType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">{d.lastEvent?.peak_g != null ? `${parseFloat(d.lastEvent.peak_g).toFixed(3)} G` : '--'}</td>
                                        <td className="px-4 py-3 text-xs text-text-dim whitespace-nowrap">
                                            {d.lastSeen ? new Date(d.lastSeen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)}
                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition shadow-sm"
                                            >
                                                Dashboard →
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {devices.length === 0 && (
                        <p className="text-center text-text-dim py-8 text-xs">No devices are currently assigned to this location.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
