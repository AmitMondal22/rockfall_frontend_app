import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import api from '../services/api';
import wsService from '../services/websocket';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import {
    Plus,
    Search,
    Cpu,
    Battery,
    Signal,
    ChevronRight,
    LayoutGrid,
    List,
    Map as MapIcon,
    Edit3,
    X,
    Activity,
    Clock,
    Zap,
    Mountain,
    Move,
    Heart,
    MapPin,
    Radio,
    Maximize2,
    Compass,
    Layers,
    Filter,
    CheckCircle2,
    AlertTriangle,
    ShieldCheck,
    Navigation
} from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';
import FreeMapLayerControl from '../components/FreeMapLayerControl';
import {
    FREE_TILE_LAYERS,
    getDefaultFreeTile,
    createDeviceMarkerIcon,
    MapBoundsFitter,
    MapFlyTo,
    MapResizer,
    MapClickHandler
} from '../utils/mapUtils';

const battPct = (v) => (v != null && !isNaN(Number(v)) ? Math.min(Math.round((Number(v) / 13) * 100), 100) : null);
const csqPct = (v) => (v != null && !isNaN(Number(v)) ? `${Math.min(Math.round((Number(v) / 31) * 100), 100)}%` : null);

const EVT_ICONS = { ROCKFALL: Mountain, HUMAN_ACTIVITY: Activity, HUMAN: Activity, MOTION: Move, HEARTBEAT: Heart };
const EVT_COLORS = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', HUMAN: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e' };
const EVT_LABELS = { ROCKFALL: 'Rockfall', HUMAN_ACTIVITY: 'Human', HUMAN: 'Human', MOTION: 'Motion', HEARTBEAT: 'Heartbeat' };

export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState([]);
    const [locs, setLocs] = useState([]);
    const [assets, setAssets] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [showForm, setShowForm] = useState(false);
    const [editDevice, setEditDevice] = useState(null);
    const [selectedMapDevice, setSelectedMapDevice] = useState(null);
    const [flyToCoords, setFlyToCoords] = useState(null);
    const [activeLayerId, setActiveLayerId] = useState('auto');
    const [mapPickingActive, setMapPickingActive] = useState(false);
    const [form, setForm] = useState({
        _id: '',
        name: '',
        organizationId: '',
        locationId: '',
        assetId: '',
        lat: '',
        lng: '',
        ratedLoadKn: '',
        description: ''
    });
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('rf-device-view') || 'card');

    const { user, isOrgAdmin, canAddDevice, canRemoveDevice } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    function loadDevices() {
        api.devices
            .getAll()
            .then((d) => {
                const normalized = (d.devices || []).map((item) => ({
                    ...item,
                    _id: item._id || item.id,
                    id: item.id || item._id,
                    organizationId: item.organizationId || item.org_id,
                    assetId: item.assetId || item.asset_id,
                    lat: item.lat != null && !isNaN(Number(item.lat)) ? Number(item.lat) : null,
                    lng: item.lng != null && !isNaN(Number(item.lng)) ? Number(item.lng) : null,
                    lastSeen: item.lastSeen || item.last_seen || item.lastEvent?.timestamp || item.ts || item.timestamp || null
                }));
                setDevices(normalized);
                setLoading(false);
            })
            .catch((e) => {
                console.error(e);
                setLoading(false);
            });
    }

    function loadOrgs() {
        api.organizations
            .getAll()
            .then((d) => {
                const normalized = (d.organizations || []).map((item) => ({
                    ...item,
                    _id: item._id || item.id,
                    id: item.id || item._id
                }));
                setOrgs(normalized);
            })
            .catch(() => {});
    }

    function loadLocs() {
        api.locations
            .getAll()
            .then((d) => {
                const normalized = (d.locations || []).map((item) => ({
                    ...item,
                    _id: item._id || item.id,
                    id: item.id || item._id,
                    organizationId: item.organizationId || item.org_id
                }));
                setLocs(normalized);
            })
            .catch(() => {});
    }

    function loadAssets() {
        api.assets
            .getInventory()
            .then((d) => {
                setAssets(d.assets || []);
            })
            .catch(() => {});
    }

    useEffect(() => {
        loadDevices();
        loadOrgs();
        loadLocs();
        loadAssets();

        wsService.connect('/ws/dashboard');
        const unsub = wsService.on('device_update', (msg) => {
            const d = msg.data || {};
            const devId = msg.deviceId || d.device_id || d.uid;
            if (!devId) return;
            setDevices((prev) =>
                prev.map((dev) =>
                    dev._id === devId || dev.id === devId
                        ? {
                              ...dev,
                              status: 'ONLINE',
                              battery: d.battery != null ? d.battery : dev.battery,
                              csq: d.csq != null ? d.csq : dev.csq,
                              lastSeen: d.timestamp || d.ts || msg.timestamp || new Date().toISOString(),
                              lastEvent:
                                  d.event_type && d.event_type !== 'HEARTBEAT'
                                      ? {
                                            type: d.event_type,
                                            peak_g: d.peak_g,
                                            duration_ms: d.duration_ms,
                                            timestamp: d.timestamp || d.ts
                                        }
                                      : dev.lastEvent
                          }
                        : dev
                )
            );
        });

        return () => {
            unsub();
        };
    }, []);

    const toggleView = (mode) => {
        setViewMode(mode);
        localStorage.setItem('rf-device-view', mode);
    };

    const resetForm = () => {
        setForm({
            _id: '',
            name: '',
            organizationId: '',
            locationId: '',
            assetId: '',
            lat: '',
            lng: '',
            ratedLoadKn: '',
            description: ''
        });
        setMapPickingActive(false);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditDevice(null);
        resetForm();
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.devices.create({
                ...form,
                asset_id: form.assetId || undefined,
                assetId: form.assetId || undefined,
                lat: form.lat !== '' ? parseFloat(form.lat) : undefined,
                lng: form.lng !== '' ? parseFloat(form.lng) : undefined,
                ratedLoadKn: form.ratedLoadKn === '' ? undefined : Number(form.ratedLoadKn)
            });
            closeForm();
            loadDevices();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleEditClick = (d, e) => {
        if (e) e.stopPropagation();
        const devId = d._id || d.id;
        setEditDevice(devId);
        setShowForm(true);
        setForm({
            _id: devId,
            name: d.name,
            organizationId: d.organizationId || d.org_id || '',
            locationId: d.locationId || d.location_id || '',
            assetId: d.assetId || d.asset_id || '',
            lat: d.lat ?? '',
            lng: d.lng ?? '',
            ratedLoadKn: d.ratedLoadKn ?? '',
            description: d.description || ''
        });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const { name, organizationId, locationId, assetId, lat, lng, ratedLoadKn, description } = form;
            await api.devices.update(editDevice, {
                name,
                organizationId,
                locationId,
                asset_id: assetId || undefined,
                assetId: assetId || undefined,
                lat: lat !== '' ? parseFloat(lat) : undefined,
                lng: lng !== '' ? parseFloat(lng) : undefined,
                ratedLoadKn: ratedLoadKn === '' ? undefined : Number(ratedLoadKn),
                description
            });
            closeForm();
            loadDevices();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDelete = async (devId, e) => {
        if (e) e.stopPropagation();
        if (!confirm(`Are you sure you want to deactivate device ${devId}?`)) return;
        try {
            await api.devices.remove(devId);
            loadDevices();
        } catch (err) {
            alert(err.message);
        }
    };

    // Filtered devices based on search query and status filter
    const filtered = useMemo(() => {
        return devices.filter((d) => {
            const idStr = String(d._id || d.id || '').toLowerCase();
            const nameStr = String(d.name || '').toLowerCase();
            const locStr = String(d.location || d.locationId || '').toLowerCase();
            const searchStr = String(search || '').toLowerCase();
            const matchesSearch = idStr.includes(searchStr) || nameStr.includes(searchStr) || locStr.includes(searchStr);
            const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [devices, search, statusFilter]);

    // Active Free Basemap Tile Layer
    const activeTileLayer = useMemo(() => {
        if (activeLayerId === 'auto') {
            return getDefaultFreeTile(isDark);
        }
        return FREE_TILE_LAYERS[activeLayerId] || getDefaultFreeTile(isDark);
    }, [activeLayerId, isDark]);

    // Devices with valid coordinates for map plotting
    const mappedDevices = useMemo(() => {
        return filtered.filter((d) => d.lat != null && d.lng != null && !isNaN(Number(d.lat)) && !isNaN(Number(d.lng)));
    }, [filtered]);

    // Map Center calculation
    const mapCenter = useMemo(() => {
        if (mappedDevices.length > 0) {
            const avgLat = mappedDevices.reduce((sum, d) => sum + Number(d.lat), 0) / mappedDevices.length;
            const avgLng = mappedDevices.reduce((sum, d) => sum + Number(d.lng), 0) / mappedDevices.length;
            return [avgLat, avgLng];
        }
        return [18.272, 83.078]; // Default site coordinates
    }, [mappedDevices]);

    if (loading) return <PageListSkeleton cardCount={6} />;

    const onlineCount = devices.filter((d) => d.status === 'ONLINE').length;
    const alertCount = devices.filter((d) => d.status === 'ALERT').length;

    const inputCls = `w-full px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs focus:outline-none transition ${
        isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'
    }`;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Devices & Sensors</h1>
                    <p className="text-text-muted text-sm mt-1">
                        {devices.length} IoT telemetry sensors & barrier load monitoring nodes
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {canAddDevice && (
                        <button
                            onClick={() => {
                                setShowForm(!showForm);
                                setEditDevice(null);
                                resetForm();
                            }}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm ${
                                isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'
                            }`}
                        >
                            <Plus className="w-4 h-4" /> Add Device
                        </button>
                    )}
                </div>
            </div>

            {/* Create / Edit Form Modal / Card */}
            {(showForm || editDevice) && (
                <form
                    onSubmit={editDevice ? handleUpdate : handleCreate}
                    className="bg-surface border border-border rounded-2xl p-4 md:p-6 shadow-md transition-all duration-300"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Cpu className="w-4 h-4 text-indigo-500" />
                            </div>
                            <h3 className="font-semibold text-sm">{editDevice ? 'Edit Device Parameters' : 'Register New IoT Sensor'}</h3>
                        </div>
                        <button type="button" onClick={closeForm} className="p-1 hover:bg-surface-3 rounded-lg text-text-dim hover:text-text">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center justify-between">
                                <span>Device / Hardware ID</span>
                                <span className="text-[10px] text-amber-500 font-normal">Required</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. TECHA101, NODE_A1"
                                value={form._id}
                                onChange={(e) => setForm((p) => ({ ...p, _id: e.target.value }))}
                                required
                                disabled={!!editDevice}
                                className={`${inputCls} font-mono ${editDevice ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Sensor Name</label>
                            <input
                                type="text"
                                placeholder="e.g. Catch Fence Sensor 01"
                                value={form.name}
                                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Mounted Barrier Asset</label>
                            <select
                                value={form.assetId}
                                onChange={(e) => {
                                    const aId = e.target.value;
                                    const matched = assets.find((a) => (a.id || a._id) === aId);
                                    setForm((p) => ({
                                        ...p,
                                        assetId: aId,
                                        locationId: matched?.location_id || matched?.locationId || p.locationId,
                                        organizationId: matched?.org_id || matched?.organizationId || p.organizationId
                                    }));
                                }}
                                className={inputCls}
                            >
                                <option value="">No Barrier (Standalone Sensor)</option>
                                {assets.map((a) => (
                                    <option key={a.id || a._id} value={a.id || a._id}>
                                        {a.name} ({a.asset_type || 'Barrier'})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Organization</label>
                            <select
                                value={form.organizationId}
                                onChange={(e) => setForm((p) => ({ ...p, organizationId: e.target.value, locationId: '' }))}
                                required
                                className={inputCls}
                            >
                                <option value="">Select Organization</option>
                                {orgs.map((o) => (
                                    <option key={o._id} value={o._id}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Location (Site)</label>
                            <select
                                value={form.locationId}
                                onChange={(e) => {
                                    const locId = e.target.value;
                                    const locObj = locs.find((l) => l._id === locId);
                                    setForm((p) => ({
                                        ...p,
                                        locationId: locId,
                                        lat: p.lat || (locObj?.lat ? String(locObj.lat) : ''),
                                        lng: p.lng || (locObj?.lng ? String(locObj.lng) : '')
                                    }));
                                }}
                                className={inputCls}
                            >
                                <option value="">Select Location</option>
                                {locs
                                    .filter((l) => !form.organizationId || l.organizationId === form.organizationId)
                                    .map((l) => (
                                        <option key={l._id} value={l._id}>
                                            {l.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Rated Load (kN)</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="Optional (e.g. 500)"
                                value={form.ratedLoadKn}
                                onChange={(e) => setForm((p) => ({ ...p, ratedLoadKn: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5 flex items-center justify-between">
                                <span>Latitude</span>
                                <span className="text-[10px] text-indigo-400">GPS Coord</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                placeholder="e.g. 18.2721"
                                value={form.lat}
                                onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5 flex items-center justify-between">
                                <span>Longitude</span>
                                <span className="text-[10px] text-indigo-400">GPS Coord</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                placeholder="e.g. 83.0784"
                                value={form.lng}
                                onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Description</label>
                            <input
                                type="text"
                                placeholder="Sensor description / notes"
                                value={form.description}
                                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                        <span className="text-[11px] text-text-dim flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                            Use coordinates to enable interactive map plotting & hazard tracking
                        </span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={closeForm}
                                className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-surface-3 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className={`px-5 py-2 rounded-xl text-xs font-semibold transition ${
                                    isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'
                                }`}
                            >
                                {editDevice ? 'Save Changes' : 'Create Device'}
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* Toolbar: Search, Status Filters, View Mode Switcher */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                        <input
                            type="text"
                            placeholder="Search devices by name, ID, or site..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-xs focus:outline-none focus:border-border transition"
                        />
                    </div>

                    {/* Status Filter Badges */}
                    <div className="hidden sm:flex items-center gap-1 bg-surface border border-border rounded-xl p-1">
                        {['ALL', 'ONLINE', 'ALERT', 'MAINTENANCE'].map((st) => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                                    statusFilter === st
                                        ? isDark
                                            ? 'bg-white/15 text-white'
                                            : 'bg-slate-900 text-white'
                                        : 'text-text-muted hover:text-text'
                                }`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>

                {/* View Mode Switcher: Cards, Table, Map */}
                <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden self-end md:self-auto p-0.5 shadow-sm">
                    <button
                        onClick={() => toggleView('card')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition ${
                            viewMode === 'card'
                                ? isDark
                                    ? 'bg-white text-black shadow-sm'
                                    : 'bg-[#111] text-white shadow-sm'
                                : 'text-text-muted hover:text-text'
                        }`}
                        title="Card Grid View"
                    >
                        <LayoutGrid className="w-3.5 h-3.5" /> Cards
                    </button>
                    <button
                        onClick={() => toggleView('table')}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition ${
                            viewMode === 'table'
                                ? isDark
                                    ? 'bg-white text-black shadow-sm'
                                    : 'bg-[#111] text-white shadow-sm'
                                : 'text-text-muted hover:text-text'
                        }`}
                        title="Detailed Table View"
                    >
                        <List className="w-3.5 h-3.5" /> Table
                    </button>
                    <button
                        onClick={() => toggleView('map')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
                            viewMode === 'map'
                                ? isDark
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-indigo-600 text-white shadow-sm'
                                : 'text-text-muted hover:text-text'
                        }`}
                        title="Interactive Free Map View"
                    >
                        <MapIcon className="w-3.5 h-3.5" /> Map View
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </button>
                </div>
            </div>

            {/* ===================== MAP VIEW ===================== */}
            {viewMode === 'map' && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-lg flex flex-col md:flex-row min-h-[620px] h-[720px] relative">
                    {/* Left Device Navigation List */}
                    <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0 bg-surface-2/30">
                        <div className="p-3.5 border-b border-border flex items-center justify-between bg-surface">
                            <div className="flex items-center gap-2">
                                <Radio className="w-4 h-4 text-indigo-400" />
                                <span className="font-semibold text-xs">Sensors ({filtered.length})</span>
                            </div>
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                {mappedDevices.length} on Map
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-2 space-y-1">
                            {filtered.map((d) => {
                                const dId = d._id || d.id;
                                const isSelected = selectedMapDevice?._id === dId;
                                const bat = battPct(d.battery);
                                const sig = d.csq != null ? Math.round((d.csq / 31) * 100) : null;
                                const hasCoords = d.lat != null && d.lng != null && !isNaN(Number(d.lat)) && !isNaN(Number(d.lng));

                                return (
                                    <div
                                        key={dId}
                                        onClick={() => {
                                            setSelectedMapDevice(d);
                                            if (hasCoords) {
                                                setFlyToCoords({ lat: Number(d.lat), lng: Number(d.lng) });
                                            }
                                        }}
                                        className={`p-3 rounded-xl cursor-pointer transition-all ${
                                            isSelected
                                                ? isDark
                                                    ? 'bg-indigo-600/20 border border-indigo-500/40'
                                                    : 'bg-indigo-50 border border-indigo-200'
                                                : 'hover:bg-surface-2 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={`w-2 h-2 rounded-full ${
                                                            d.status === 'ONLINE'
                                                                ? 'bg-emerald-500'
                                                                : d.status === 'ALERT'
                                                                ? 'bg-red-500 animate-pulse'
                                                                : d.status === 'MAINTENANCE'
                                                                ? 'bg-amber-500'
                                                                : 'bg-slate-400'
                                                        }`}
                                                    />
                                                    <p className="font-bold text-xs truncate">{d.name}</p>
                                                </div>
                                                <p className="text-[10px] font-mono text-text-dim truncate mt-0.5">{dId}</p>
                                            </div>
                                            {hasCoords ? (
                                                <span className="text-[10px] text-indigo-400 flex items-center gap-0.5 shrink-0">
                                                    <Navigation className="w-3 h-3" /> Pin
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-text-dim shrink-0">No GPS</span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] text-text-muted mt-2 pt-2 border-t border-border/30">
                                            <div className="flex items-center gap-2">
                                                <span className="flex items-center gap-1">
                                                    <Battery className="w-3 h-3 text-text-dim" /> {bat != null ? `${bat}%` : '--'}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Signal className="w-3 h-3 text-text-dim" /> {sig != null ? `${sig}%` : '--'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-text-dim">
                                                {d.lastEvent?.type ? `${d.lastEvent.type}` : 'Active'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}

                            {filtered.length === 0 && (
                                <p className="text-center text-xs text-text-dim py-8">No matching sensors found</p>
                            )}
                        </div>

                        {/* Quick Map Controls Summary Footer */}
                        <div className="p-3 border-t border-border bg-surface text-[11px] flex items-center justify-between text-text-muted">
                            <span>Online: <b className="text-emerald-400">{onlineCount}</b></span>
                            <span>Alerts: <b className="text-danger">{alertCount}</b></span>
                            <button
                                type="button"
                                onClick={() => {
                                    if (mappedDevices.length > 0) {
                                        setFlyToCoords({ lat: mapCenter[0], lng: mapCenter[1], zoom: 12 });
                                    }
                                }}
                                className="text-indigo-400 hover:underline flex items-center gap-1"
                            >
                                <Compass className="w-3.5 h-3.5" /> Center Map
                            </button>
                        </div>
                    </div>

                    {/* Interactive Leaflet Map Container */}
                    <div className="flex-1 relative w-full h-full bg-surface-2 map-container-isolated">
                        {/* Free Map Tile Layer Selector */}
                        <FreeMapLayerControl
                            currentLayerId={activeLayerId}
                            onSelectLayer={setActiveLayerId}
                            isDark={isDark}
                            position="top-right"
                        />

                        {/* Map View */}
                        <MapContainer
                            key={`${resolvedTheme}-${activeLayerId}`}
                            center={mapCenter}
                            zoom={12}
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
                            {flyToCoords && (
                                <MapFlyTo lat={flyToCoords.lat} lng={flyToCoords.lng} zoom={flyToCoords.zoom || 15} />
                            )}
                            <MapBoundsFitter
                                points={mappedDevices.map((d) => ({ lat: d.lat, lng: d.lng }))}
                                maxZoom={15}
                            />

                            {/* Render Mapped Device Markers */}
                            {mappedDevices.map((d) => {
                                const dId = d._id || d.id;
                                const isSelected = selectedMapDevice?._id === dId;
                                const isAlert = d.status === 'ALERT';
                                const evtType = d.lastEvent?.type;
                                const icon = createDeviceMarkerIcon({
                                    status: d.status,
                                    isDark,
                                    eventType: evtType,
                                    selected: isSelected,
                                    size: isSelected ? 38 : 32
                                });

                                return (
                                    <Marker
                                        key={dId}
                                        position={[Number(d.lat), Number(d.lng)]}
                                        icon={icon}
                                        eventHandlers={{
                                            click: () => {
                                                setSelectedMapDevice(d);
                                            }
                                        }}
                                    >
                                        <Popup>
                                            <div className="p-1 min-w-[200px]" style={{ color: '#111' }}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-xs text-slate-900">{d.name}</span>
                                                    <span
                                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                            d.status === 'ONLINE'
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : d.status === 'ALERT'
                                                                ? 'bg-red-100 text-red-800'
                                                                : 'bg-amber-100 text-amber-800'
                                                        }`}
                                                    >
                                                        {d.status}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{dId}</p>

                                                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-700">
                                                    <div>Battery: <b>{battPct(d.battery) != null ? `${battPct(d.battery)}%` : '--'}</b></div>
                                                    <div>Signal: <b>{csqPct(d.csq) ?? '--'}</b></div>
                                                    <div>Event: <b>{d.lastEvent?.type || 'None'}</b></div>
                                                    <div>Peak G: <b>{d.lastEvent?.peak_g ?? '--'}</b></div>
                                                </div>

                                                <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                                                    <button
                                                        onClick={() => navigate(`/devices/${encodeURIComponent(dId)}`)}
                                                        className="flex-1 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-slate-800 transition text-center"
                                                    >
                                                        Full Telemetry →
                                                    </button>
                                                </div>
                                            </div>
                                        </Popup>
                                        {isAlert && (
                                            <Circle
                                                center={[Number(d.lat), Number(d.lng)]}
                                                radius={1200}
                                                pathOptions={{
                                                    color: '#ef4444',
                                                    fillColor: '#ef4444',
                                                    fillOpacity: 0.12,
                                                    weight: 1.5
                                                }}
                                            />
                                        )}
                                    </Marker>
                                );
                            })}
                        </MapContainer>

                        {/* Floating Selected Device Overlay Drawer */}
                        {selectedMapDevice && (
                            <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-80 z-[400] bg-surface/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                            <Cpu className="w-4 h-4 text-indigo-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-xs truncate">{selectedMapDevice.name}</h4>
                                            <p className="text-[10px] font-mono text-text-dim truncate">{selectedMapDevice._id}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedMapDevice(null)}
                                        className="p-1 hover:bg-surface-3 rounded-lg text-text-dim hover:text-text"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-border/50 text-[11px]">
                                    <div className="flex items-center gap-1.5 text-text-muted">
                                        <Battery className="w-3.5 h-3.5 text-text-dim" />
                                        <span>Battery: <b className="text-text">{battPct(selectedMapDevice.battery) ?? '--'}%</b></span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-text-muted">
                                        <Signal className="w-3.5 h-3.5 text-text-dim" />
                                        <span>Signal: <b className="text-text">{csqPct(selectedMapDevice.csq) ?? '--'}</b></span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-text-muted">
                                        <Activity className="w-3.5 h-3.5 text-text-dim" />
                                        <span>Peak: <b className="text-text">{selectedMapDevice.lastEvent?.peak_g ?? '--'} G</b></span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-text-muted">
                                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="truncate">{selectedMapDevice.location || selectedMapDevice.organizationId || 'Active Node'}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2 mt-3 pt-2">
                                    <button
                                        onClick={() => navigate(`/devices/${encodeURIComponent(selectedMapDevice._id)}`)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                                            isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'
                                        }`}
                                    >
                                        View Device Dashboard <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={(e) => handleEditClick(selectedMapDevice, e)}
                                        className="p-2 rounded-xl border border-border hover:bg-surface-3 text-text-muted hover:text-text transition"
                                        title="Edit Device"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ===================== CARD VIEW ===================== */}
            {viewMode === 'card' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map((d, ci) => {
                        const bat = battPct(d.battery);
                        const sig = d.csq != null ? Math.round((d.csq / 31) * 100) : null;
                        const evtType = d.lastEvent?.type;
                        const EvtIcon = EVT_ICONS[evtType] || Zap;
                        const batC = bat != null && bat < 20 ? '#ef4444' : bat != null && bat < 50 ? '#f59e0b' : '#22c55e';
                        const R = 16,
                            C = 2 * Math.PI * R,
                            off = C - (C * (bat ?? 0)) / 100;

                        return (
                            <div
                                key={d._id}
                                onClick={() => navigate(`/devices/${encodeURIComponent(d._id)}`)}
                                className="relative bg-surface rounded-[20px] cursor-pointer group overflow-hidden flex flex-col border border-border hover:border-indigo-500/40 hover:shadow-lg transition-all duration-300"
                                style={{
                                    animation: `fadeSlideUp 0.4s ease-out ${ci * 0.05}s both`
                                }}
                            >
                                {/* Card body */}
                                <div className="p-5 pb-4 flex flex-col flex-1 gap-3.5">
                                    {/* Header row */}
                                    <div className="flex items-center gap-3">
                                        <div className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center transition-transform duration-300 group-hover:scale-110 bg-indigo-500/10 border border-indigo-500/20 shrink-0">
                                            <Cpu className="w-[20px] h-[20px] text-indigo-500" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-[15px] leading-tight truncate">{d.name}</h3>
                                            <p className="text-[11px] font-mono text-text-dim truncate mt-0.5">{d._id}</p>
                                        </div>
                                    </div>

                                    {/* Org / Site line */}
                                    <p className="text-text-muted text-[11px] truncate -mt-1">
                                        {d.location || d.organizationId || '—'}
                                    </p>

                                    {/* Metrics strip */}
                                    <div className="flex items-stretch gap-2 mt-auto pt-3 border-t border-border/30">
                                        {/* Battery */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5 bg-surface-2/60">
                                            <div className="relative w-10 h-10">
                                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                                    <circle
                                                        cx="20"
                                                        cy="20"
                                                        r={R}
                                                        fill="none"
                                                        strokeWidth="2.5"
                                                        stroke={isDark ? '#262626' : '#e5e5e5'}
                                                    />
                                                    <circle
                                                        cx="20"
                                                        cy="20"
                                                        r={R}
                                                        fill="none"
                                                        stroke={batC}
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeDasharray={C}
                                                        strokeDashoffset={off}
                                                        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
                                                    />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: batC }}>
                                                    {bat != null ? `${bat}%` : '—'}
                                                </span>
                                            </div>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Battery</span>
                                        </div>

                                        {/* Signal */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-1 bg-surface-2/60">
                                            <div className="flex items-end gap-[3px] h-[22px]">
                                                {[1, 2, 3, 4, 5].map((i) => {
                                                    const lvl = sig != null ? Math.round((sig / 100) * 5) : 0;
                                                    const on = i <= lvl;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className="rounded-[2px]"
                                                            style={{
                                                                width: 5,
                                                                height: 3 + i * 3.6,
                                                                background: on ? '#3b82f6' : isDark ? '#262626' : '#e0e0e0',
                                                                transition: 'all 0.4s ease'
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                            <span className="text-[9px] font-bold text-info">{sig != null ? `${sig}%` : '—'}</span>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Signal</span>
                                        </div>

                                        {/* Event */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5 bg-surface-2/60">
                                            <div
                                                className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                                                style={{ background: evtType ? `${EVT_COLORS[evtType] || '#3b82f6'}15` : 'transparent' }}
                                            >
                                                <EvtIcon
                                                    className="w-4 h-4"
                                                    style={{ color: evtType ? EVT_COLORS[evtType] || '#3b82f6' : isDark ? '#555' : '#bbb' }}
                                                />
                                            </div>
                                            <span
                                                className="text-[8px] font-semibold uppercase tracking-wider"
                                                style={{ color: evtType ? EVT_COLORS[evtType] || '#3b82f6' : isDark ? '#555' : '#bbb' }}
                                            >
                                                {EVT_LABELS[evtType] || 'None'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-1.5 text-text-dim">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            <span className="text-[10px]">
                                                {d.lastSeen
                                                    ? new Date(d.lastSeen).toLocaleString('en-IN', {
                                                          timeZone: 'Asia/Kolkata',
                                                          day: '2-digit',
                                                          month: 'short',
                                                          hour: '2-digit',
                                                          minute: '2-digit'
                                                      })
                                                    : 'Never seen'}
                                            </span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 bg-surface-3">
                                            <ChevronRight className="w-3.5 h-3.5 text-text-dim group-hover:text-text" />
                                        </div>
                                    </div>
                                </div>

                                {/* Edit button */}
                                <button
                                    onClick={(e) => handleEditClick(d, e)}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg text-text-dim hover:text-text bg-surface-2 border border-border transition-all duration-200 opacity-0 group-hover:opacity-100 z-10"
                                >
                                    <Edit3 className="w-3 h-3" />
                                </button>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <p className="text-center text-text-dim py-12 col-span-full">No devices found</p>}
                </div>
            )}

            {/* ===================== TABLE VIEW ===================== */}
            {viewMode === 'table' && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-text-muted text-xs border-b border-border bg-surface-2/40">
                                    {['Device ID', 'Name', 'Organization / Site', 'Battery', 'Signal', 'Last Event', 'Coordinates', 'Last Seen', ''].map(
                                        (h) => (
                                            <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">
                                                {h}
                                            </th>
                                        )
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((d) => (
                                    <tr
                                        key={d._id}
                                        onClick={() => navigate(`/devices/${encodeURIComponent(d._id)}`)}
                                        className="border-b border-border/30 hover:bg-surface-2 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs font-semibold">{d._id}</td>
                                        <td className="px-4 py-3 font-medium">{d.name}</td>
                                        <td className="px-4 py-3 text-text-muted text-xs">{d.location || d.organizationId || '--'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Battery className="w-3.5 h-3.5 text-text-dim" />
                                                {battPct(d.battery) != null ? `${battPct(d.battery)}%` : '--'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Signal className="w-3.5 h-3.5 text-text-dim" />
                                                {d.csq != null ? `${Math.round((d.csq / 31) * 100)}%` : '--'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-text-dim text-xs">{d.lastEvent?.type || 'N/A'}</td>
                                        <td className="px-4 py-3 text-text-dim text-xs font-mono">
                                            {d.lat != null && d.lng != null ? `${Number(d.lat).toFixed(4)}, ${Number(d.lng).toFixed(4)}` : '--'}
                                        </td>
                                        <td className="px-4 py-3 text-text-dim text-xs">
                                            {d.lastSeen
                                                ? new Date(d.lastSeen).toLocaleString('en-IN', {
                                                      timeZone: 'Asia/Kolkata',
                                                      day: '2-digit',
                                                      month: 'short',
                                                      hour: '2-digit',
                                                      minute: '2-digit'
                                                  })
                                                : 'Never'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={(e) => handleEditClick(d, e)}
                                                className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim"
                                            >
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && <p className="text-center text-text-dim py-12">No devices found</p>}
                    </div>
                </div>
            )}
        </div>
    );
}
