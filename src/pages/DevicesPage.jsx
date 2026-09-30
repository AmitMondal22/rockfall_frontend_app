import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import wsService from '../services/websocket';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Plus, Search, Cpu, Battery, Signal, ChevronRight, LayoutGrid, List, Edit3, X, Activity, Clock, Zap, Mountain, Move, Heart } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState([]);
    const [locs, setLocs] = useState([]);
    const [assets, setAssets] = useState([]);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editDevice, setEditDevice] = useState(null);
    const [form, setForm] = useState({ _id: '', name: '', organizationId: '', locationId: '', assetId: '', lat: '', lng: '', ratedLoadKn: '', description: '' });
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('rf-device-view') || 'card');
    const { user, isOrgAdmin, canAddDevice, canRemoveDevice } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    function loadDevices() {
        api.devices.getAll().then(d => {
            const normalized = (d.devices || []).map(item => ({
                ...item,
                _id: item._id || item.id,
                id: item.id || item._id,
                organizationId: item.organizationId || item.org_id,
                assetId: item.assetId || item.asset_id,
                lastSeen: item.lastSeen || item.last_seen || item.lastEvent?.timestamp || item.ts || item.timestamp || null
            }));
            setDevices(normalized);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }
    function loadOrgs() {
        api.organizations.getAll().then(d => {
            const normalized = (d.organizations || []).map(item => ({
                ...item,
                _id: item._id || item.id,
                id: item.id || item._id
            }));
            setOrgs(normalized);
        }).catch(() => { });
    }
    function loadLocs() {
        api.locations.getAll().then(d => {
            const normalized = (d.locations || []).map(item => ({
                ...item,
                _id: item._id || item.id,
                id: item.id || item._id,
                organizationId: item.organizationId || item.org_id
            }));
            setLocs(normalized);
        }).catch(() => { });
    }
    function loadAssets() {
        api.assets.getInventory().then(d => {
            setAssets(d.assets || []);
        }).catch(() => { });
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
            setDevices(prev => prev.map(dev => (dev._id === devId || dev.id === devId) ? {
                ...dev,
                status: 'ONLINE',
                battery: d.battery != null ? d.battery : dev.battery,
                csq: d.csq != null ? d.csq : dev.csq,
                lastSeen: d.timestamp || d.ts || msg.timestamp || new Date().toISOString(),
                lastEvent: d.event_type && d.event_type !== 'HEARTBEAT' ? {
                    type: d.event_type, peak_g: d.peak_g, duration_ms: d.duration_ms, timestamp: d.timestamp || d.ts
                } : dev.lastEvent
            } : dev));
        });

        return () => {
            unsub();
        };
    }, []);

    if (loading) return <PageListSkeleton cardCount={6} />;

    const filtered = devices.filter(d => {
        const idStr = String(d._id || d.id || '').toLowerCase();
        const nameStr = String(d.name || '').toLowerCase();
        const searchStr = String(search || '').toLowerCase();
        return idStr.includes(searchStr) || nameStr.includes(searchStr);
    });
    const toggleView = (mode) => { setViewMode(mode); localStorage.setItem('rf-device-view', mode); };
    const resetForm = () => setForm({ _id: '', name: '', organizationId: '', locationId: '', assetId: '', lat: '', lng: '', ratedLoadKn: '', description: '' });
    const closeForm = () => { setShowForm(false); setEditDevice(null); resetForm(); };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.devices.create({
                ...form,
                asset_id: form.assetId || undefined,
                assetId: form.assetId || undefined,
                lat: parseFloat(form.lat),
                lng: parseFloat(form.lng),
                ratedLoadKn: form.ratedLoadKn === '' ? undefined : Number(form.ratedLoadKn)
            });
            closeForm(); loadDevices();
        } catch (err) { alert(err.message); }
    };

    const handleEditClick = (d, e) => {
        e.stopPropagation();
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
            closeForm(); loadDevices();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async (devId, e) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to deactivate device ${devId}?`)) return;
        try {
            await api.devices.remove(devId);
            loadDevices();
        } catch (err) { alert(err.message); }
    };

    const inputCls = `w-full px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Devices & Sensors</h1>
                    <p className="text-text-muted text-sm mt-1">{devices.length} sensors installed across barrier assets</p>
                </div>
                {canAddDevice && (
                    <button onClick={() => { setShowForm(!showForm); setEditDevice(null); resetForm(); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>
                        <Plus className="w-4 h-4" /> Add Device
                    </button>
                )}
            </div>

            {/* Create / Edit Form */}
            {(showForm || editDevice) && (
                <form onSubmit={editDevice ? handleUpdate : handleCreate} className="bg-surface border border-border rounded-2xl p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">{editDevice ? 'Edit Device' : 'New Device'}</h3>
                        <button type="button" onClick={closeForm} className="p-1 hover:bg-surface-3 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center justify-between">
                                <span>Device / Hardware ID (Manual)</span>
                                <span className="text-[10px] text-amber-500 font-normal">Required</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. TECHA101, NODE_A1"
                                value={form._id}
                                onChange={e => setForm(p => ({ ...p, _id: e.target.value }))}
                                required
                                disabled={!!editDevice}
                                className={`${inputCls} font-mono ${editDevice ? 'opacity-50 cursor-not-allowed' : ''}`}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Sensor Name</label>
                            <input type="text" placeholder="e.g. Catch Fence Sensor 01" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Mounted Barrier Asset</label>
                            <select
                                value={form.assetId}
                                onChange={e => {
                                    const aId = e.target.value;
                                    const matched = assets.find(a => (a.id || a._id) === aId);
                                    setForm(p => ({
                                        ...p,
                                        assetId: aId,
                                        locationId: matched?.location_id || matched?.locationId || p.locationId,
                                        organizationId: matched?.org_id || matched?.organizationId || p.organizationId
                                    }));
                                }}
                                className={inputCls}
                            >
                                <option value="">No Barrier (Standalone Sensor)</option>
                                {assets.map(a => (
                                    <option key={a.id || a._id} value={a.id || a._id}>
                                        {a.name} ({a.asset_type || 'Barrier'})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Organization</label>
                            <select value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value, locationId: '' }))} required className={inputCls}>
                                <option value="">Select Organization</option>
                                {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Location (Site)</label>
                            <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))} className={inputCls}>
                                <option value="">Select Location</option>
                                {locs.filter(l => !form.organizationId || l.organizationId === form.organizationId).map(l => (
                                    <option key={l._id} value={l._id}>{l.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Latitude</label>
                            <input type="number" step="any" placeholder="18.272" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Longitude</label>
                            <input type="number" step="any" placeholder="83.078" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Rated Load (kN)</label>
                            <input type="number" step="any" placeholder="Optional" value={form.ratedLoadKn} onChange={e => setForm(p => ({ ...p, ratedLoadKn: e.target.value }))} className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs text-text-muted mb-1.5">Description</label>
                            <input type="text" placeholder="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-4">
                        <button type="button" onClick={closeForm} className="px-4 py-2 border border-border rounded-xl text-xs font-semibold hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2 rounded-xl text-xs font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>
                            {editDevice ? 'Save Changes' : 'Create Device'}
                        </button>
                    </div>
                </form>
            )}

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                    <input type="text" placeholder="Search devices by name or ID..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm focus:outline-none focus:border-border transition" />
                </div>
                <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden self-end sm:self-auto">
                    <button onClick={() => toggleView('card')} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition ${viewMode === 'card' ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white') : 'text-text-muted hover:text-text-dim'}`}>
                        <LayoutGrid className="w-4 h-4" /> Cards
                    </button>
                    <button onClick={() => toggleView('table')} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition ${viewMode === 'table' ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white') : 'text-text-muted hover:text-text-dim'}`}>
                        <List className="w-4 h-4" /> Table
                    </button>
                </div>
            </div>

            {/* Card View */}
            {viewMode === 'card' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map((d, ci) => {
                        const bat = battPct(d.battery);
                        const sig = d.csq != null ? Math.round((d.csq / 31) * 100) : null;
                        const evtType = d.lastEvent?.type;
                        const EVT_I = { ROCKFALL: Mountain, HUMAN_ACTIVITY: Activity, HUMAN: Activity, MOTION: Move, HEARTBEAT: Heart };
                        const EVT_C = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', HUMAN: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e' };
                        const EVT_L = { ROCKFALL: 'Rockfall', HUMAN_ACTIVITY: 'Human', HUMAN: 'Human', MOTION: 'Motion', HEARTBEAT: 'Heartbeat' };
                        const EvtIcon = EVT_I[evtType] || Zap;
                        const batC = bat != null && bat < 20 ? '#ef4444' : bat != null && bat < 50 ? '#f59e0b' : '#22c55e';
                        const R = 16, C = 2 * Math.PI * R, off = C - (C * (bat ?? 0)) / 100;

                        return (
                            <div key={d._id} onClick={() => navigate(`/devices/${d._id}`)}
                                className="relative bg-surface rounded-[20px] cursor-pointer group overflow-hidden flex flex-col border border-border hover:border-indigo-500/40 hover:shadow-lg transition-all duration-300"
                                style={{
                                    animation: `fadeSlideUp 0.4s ease-out ${ci * 0.05}s both`,
                                }}>

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

                                        {/* Battery — circular ring */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5 bg-surface-2/60">
                                            <div className="relative w-10 h-10">
                                                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                                                    <circle cx="20" cy="20" r={R} fill="none" strokeWidth="2.5"
                                                        stroke={isDark ? '#262626' : '#e5e5e5'} />
                                                    <circle cx="20" cy="20" r={R} fill="none" stroke={batC}
                                                        strokeWidth="2.5" strokeLinecap="round"
                                                        strokeDasharray={C} strokeDashoffset={off}
                                                        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: batC }}>
                                                    {bat != null ? `${bat}%` : '—'}
                                                </span>
                                            </div>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Battery</span>
                                        </div>

                                        {/* Signal — vertical bars */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-1 bg-surface-2/60">
                                            <div className="flex items-end gap-[3px] h-[22px]">
                                                {[1, 2, 3, 4, 5].map(i => {
                                                    const lvl = sig != null ? Math.round((sig / 100) * 5) : 0;
                                                    const on = i <= lvl;
                                                    return <div key={i} className="rounded-[2px]" style={{
                                                        width: 5, height: 3 + i * 3.6,
                                                        background: on ? '#3b82f6' : isDark ? '#262626' : '#e0e0e0',
                                                        transition: 'all 0.4s ease'
                                                    }} />;
                                                })}
                                            </div>
                                            <span className="text-[9px] font-bold text-info">{sig != null ? `${sig}%` : '—'}</span>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Signal</span>
                                        </div>

                                        {/* Event */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5 bg-surface-2/60">
                                            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                                                style={{ background: evtType ? `${EVT_C[evtType] || '#3b82f6'}15` : 'transparent' }}>
                                                <EvtIcon className="w-4 h-4" style={{ color: evtType ? (EVT_C[evtType] || '#3b82f6') : isDark ? '#555' : '#bbb' }} />
                                            </div>
                                            <span className="text-[8px] font-semibold uppercase tracking-wider"
                                                style={{ color: evtType ? (EVT_C[evtType] || '#3b82f6') : isDark ? '#555' : '#bbb' }}>
                                                {EVT_L[evtType] || 'None'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="flex items-center justify-between pt-1">
                                        <div className="flex items-center gap-1.5 text-text-dim">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            <span className="text-[10px]">
                                                {d.lastSeen
                                                    ? new Date(d.lastSeen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                                    : 'Never seen'}
                                            </span>
                                        </div>
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 bg-surface-3">
                                            <ChevronRight className="w-3.5 h-3.5 text-text-dim group-hover:text-text" />
                                        </div>
                                    </div>
                                </div>

                                {/* Edit button */}
                                <button onClick={(e) => handleEditClick(d, e)}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg text-text-dim hover:text-text bg-surface-2 border border-border transition-all duration-200 opacity-0 group-hover:opacity-100 z-10">
                                    <Edit3 className="w-3 h-3" />
                                </button>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <p className="text-center text-text-dim py-12 col-span-full">No devices found</p>}
                </div>
            )}

            {/* Table View */}
            {viewMode === 'table' && (
                <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-text-muted text-xs border-b border-border bg-surface-2/40">
                                    {['Device ID', 'Name', 'Organization / Site', 'Battery', 'Signal', 'Last Event', 'Last Seen', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(d => (
                                    <tr key={d._id} onClick={() => navigate(`/devices/${d._id}`)} className="border-b border-border/30 hover:bg-surface-2 cursor-pointer transition">
                                        <td className="px-4 py-3 font-mono text-xs font-semibold">{d._id}</td>
                                        <td className="px-4 py-3 font-medium">{d.name}</td>
                                        <td className="px-4 py-3 text-text-muted text-xs">{d.location || d.organizationId || '--'}</td>
                                        <td className="px-4 py-3"><div className="flex items-center gap-1.5 text-xs"><Battery className="w-3.5 h-3.5 text-text-dim" />{battPct(d.battery) != null ? `${battPct(d.battery)}%` : '--'}</div></td>
                                        <td className="px-4 py-3"><div className="flex items-center gap-1.5 text-xs"><Signal className="w-3.5 h-3.5 text-text-dim" />{d.csq != null ? `${Math.round((d.csq / 31) * 100)}%` : '--'}</div></td>
                                        <td className="px-4 py-3 text-text-dim text-xs">{d.lastEvent?.type || 'N/A'}</td>
                                        <td className="px-4 py-3 text-text-dim text-xs">{d.lastSeen ? new Date(d.lastSeen).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Never'}</td>
                                        <td className="px-4 py-3"><button onClick={(e) => handleEditClick(d, e)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim"><Edit3 className="w-3.5 h-3.5" /></button></td>
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
