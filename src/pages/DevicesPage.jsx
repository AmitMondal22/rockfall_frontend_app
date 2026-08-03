import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Plus, Search, Cpu, Battery, Signal, ChevronRight, LayoutGrid, List, Edit3, X, Activity, Clock, Zap, Mountain, Move, Heart } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

const statusBadge = { ONLINE: 'bg-success/20 text-success', ALERT: 'bg-danger/20 text-danger', MAINTENANCE: 'bg-warning/20 text-warning' };
const battPct = (v) => v != null ? Math.min(Math.round((v / 13) * 100), 100) : null;

export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState([]);
    const [locs, setLocs] = useState([]);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editDevice, setEditDevice] = useState(null);
    const [form, setForm] = useState({ _id: '', name: '', organizationId: '', locationId: '', lat: '', lng: '', description: '' });
    const [viewMode, setViewMode] = useState(() => localStorage.getItem('rf-device-view') || 'card');
    const { isOrgAdmin } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { loadDevices(); loadOrgs(); loadLocs(); }, []);
    const loadDevices = () => api.devices.getAll().then(d => { setDevices(d.devices || []); setLoading(false); }).catch(e => { console.error(e); setLoading(false); });
    const loadOrgs = () => api.organizations.getAll().then(d => setOrgs(d.organizations || [])).catch(() => { });
    const loadLocs = () => api.locations.getAll().then(d => setLocs(d.locations || [])).catch(() => { });

    if (loading) return <PageListSkeleton cardCount={6} />;

    const filtered = devices.filter(d => d._id.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase()));
    const toggleView = (mode) => { setViewMode(mode); localStorage.setItem('rf-device-view', mode); };
    const resetForm = () => setForm({ _id: '', name: '', organizationId: '', locationId: '', lat: '', lng: '', description: '' });
    const closeForm = () => { setShowForm(false); setEditDevice(null); resetForm(); };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.devices.create({ ...form, lat: parseFloat(form.lat), lng: parseFloat(form.lng) });
            closeForm(); loadDevices();
        } catch (err) { alert(err.message); }
    };

    const handleEditClick = (d, e) => {
        e.stopPropagation();
        setEditDevice(d._id);
        setShowForm(false);
        setForm({ _id: d._id, name: d.name, organizationId: d.organizationId || '', locationId: d.locationId || '', lat: d.lat || '', lng: d.lng || '', description: d.description || '' });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const { name, organizationId, locationId, lat, lng, description } = form;
            await api.devices.update(editDevice, { name, organizationId, locationId, lat: parseFloat(lat), lng: parseFloat(lng), description });
            closeForm(); loadDevices();
        } catch (err) { alert(err.message); }
    };

    const inputCls = `w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Devices</h1>
                    <p className="text-text-muted text-sm mt-1">{devices.length} registered devices</p>
                </div>
                {isOrgAdmin && (
                    <button onClick={() => { closeForm(); setShowForm(true); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>
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
                            <label className="block text-xs text-text-muted mb-1.5">Device ID</label>
                            <input type="text" placeholder="TECHA12345" value={form._id} onChange={e => setForm(p => ({ ...p, _id: e.target.value }))} required disabled={!!editDevice} className={`${inputCls} ${editDevice ? 'opacity-50 cursor-not-allowed' : ''}`} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Name</label>
                            <input type="text" placeholder="Rockfall Sensor 1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Organization</label>
                            <select value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value, locationId: '' }))} required className={inputCls}>
                                <option value="">Select Organization</option>
                                {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Location</label>
                            <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))} className={inputCls}>
                                <option value="">No Location</option>
                                {locs.filter(l => !form.organizationId || l.organizationId === form.organizationId).map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Latitude</label>
                            <input type="number" step="any" placeholder="22.5726" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} required className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Longitude</label>
                            <input type="number" step="any" placeholder="88.3639" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} required className={inputCls} />
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1.5">Description</label>
                            <input type="text" placeholder="Optional description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} />
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                        <button type="button" onClick={closeForm} className="px-5 py-2.5 text-sm text-text-muted border border-border rounded-xl hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>{editDevice ? 'Update Device' : 'Create Device'}</button>
                    </div>
                </form>
            )}

            {/* Search + View Toggle */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                    <input type="text" placeholder="Search devices..." value={search} onChange={e => setSearch(e.target.value)}
                        className={`w-full pl-11 pr-4 py-3 bg-surface border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`} />
                </div>
                <div className={`flex rounded-xl border border-border overflow-hidden ${isDark ? 'bg-surface' : 'bg-white'}`}>
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
                        const EVT_I = { ROCKFALL: Mountain, HUMAN_ACTIVITY: Activity, MOTION: Move, HEARTBEAT: Heart };
                        const EVT_C = { ROCKFALL: '#ef4444', HUMAN_ACTIVITY: '#f59e0b', MOTION: '#3b82f6', HEARTBEAT: '#22c55e' };
                        const EVT_L = { ROCKFALL: 'Rockfall', HUMAN_ACTIVITY: 'Human', MOTION: 'Motion', HEARTBEAT: 'Heartbeat' };
                        const EvtIcon = EVT_I[evtType] || Zap;
                        const sc = { ONLINE: '#22c55e', ALERT: '#ef4444', MAINTENANCE: '#f59e0b' }[d.status] || '#71717a';
                        const batC = bat != null && bat < 20 ? '#ef4444' : bat != null && bat < 50 ? '#f59e0b' : '#22c55e';
                        const R = 16, C = 2 * Math.PI * R, off = C - (C * (bat ?? 0)) / 100;

                        return (
                            <div key={d._id} onClick={() => navigate(`/devices/${d._id}`)}
                                className="relative bg-surface rounded-[20px] cursor-pointer group overflow-hidden flex flex-col"
                                style={{
                                    border: '1px solid var(--color-border)',
                                    transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                                    animation: `fadeSlideUp 0.5s ease-out ${ci * 0.06}s both`,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-6px) scale(1.01)';
                                    e.currentTarget.style.boxShadow = `0 24px 48px -16px ${sc}22, 0 0 0 1px ${sc}20`;
                                    e.currentTarget.style.borderColor = `${sc}40`;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = '';
                                    e.currentTarget.style.boxShadow = '';
                                    e.currentTarget.style.borderColor = '';
                                }}>

                                {/* Top accent — gradient strip */}
                                <div style={{ height: 3, background: `linear-gradient(90deg, ${sc} 0%, ${sc}00 100%)` }} />

                                {/* Ambient corner glow */}
                                <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none opacity-[0.06] group-hover:opacity-[0.14]"
                                    style={{ background: `radial-gradient(circle, ${sc}, transparent 70%)`, transition: 'opacity 0.5s' }} />

                                {/* Card body */}
                                <div className="p-5 pb-4 flex flex-col flex-1 gap-3.5">

                                    {/* Header row */}
                                    <div className="flex items-center gap-3">
                                        {/* Device icon with ring */}
                                        <div className="relative shrink-0">
                                            <div className="w-[46px] h-[46px] rounded-[14px] flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                                                style={{ background: `${sc}10`, boxShadow: `inset 0 0 0 1.5px ${sc}20` }}>
                                                <Cpu className="w-[22px] h-[22px]" style={{ color: sc }} />
                                            </div>
                                            {d.status === 'ONLINE' && (
                                                <span className="absolute -top-[3px] -right-[3px] w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                                    style={{ background: 'var(--color-surface)', boxShadow: `0 0 0 2px var(--color-surface)` }}>
                                                    <span className="w-2 h-2 rounded-full" style={{ background: sc, animation: 'pulse 2s infinite' }} />
                                                </span>
                                            )}
                                            {d.status === 'ALERT' && (
                                                <span className="absolute -top-[3px] -right-[3px] w-3.5 h-3.5 rounded-full flex items-center justify-center"
                                                    style={{ background: 'var(--color-surface)', boxShadow: `0 0 0 2px var(--color-surface)` }}>
                                                    <span className="w-2 h-2 rounded-full animate-ping" style={{ background: sc }} />
                                                </span>
                                            )}
                                        </div>

                                        {/* Name / ID */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-[15px] leading-tight truncate">{d.name}</h3>
                                            <p className="text-[10px] font-mono opacity-50 truncate mt-px">{d._id}</p>
                                        </div>

                                        {/* Status pill */}
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[9px] font-extrabold tracking-[0.08em] uppercase shrink-0 select-none"
                                            style={{ background: `${sc}12`, color: sc, border: `1px solid ${sc}18` }}>
                                            <span className="w-[5px] h-[5px] rounded-full" style={{ background: sc }} />
                                            {d.status}
                                        </span>
                                    </div>

                                    {/* Org line */}
                                    <p className="text-text-muted text-[11px] truncate -mt-1">{d.organizationId || '\u2014'}</p>

                                    {/* ── Metrics strip ── */}
                                    <div className="flex items-stretch gap-2 mt-auto pt-3 border-t border-border/30">

                                        {/* Battery — circular ring */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5"
                                            style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
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
                                                    {bat ?? '—'}
                                                </span>
                                            </div>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Battery</span>
                                        </div>

                                        {/* Signal — vertical bars */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-1"
                                            style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
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
                                            <span className="text-[9px] font-bold text-info">{sig ?? '—'}%</span>
                                            <span className="text-[8px] text-text-dim font-semibold uppercase tracking-wider">Signal</span>
                                        </div>

                                        {/* Event */}
                                        <div className="flex-1 flex flex-col items-center justify-center rounded-xl py-2 gap-0.5"
                                            style={{ background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
                                            <div className="relative w-9 h-9 rounded-xl flex items-center justify-center"
                                                style={{ background: evtType ? `${EVT_C[evtType]}10` : 'transparent' }}>
                                                <EvtIcon className="w-4 h-4" style={{ color: evtType ? EVT_C[evtType] : isDark ? '#555' : '#bbb' }} />
                                                {evtType === 'ROCKFALL' && (
                                                    <span className="absolute inset-0 rounded-xl opacity-20 animate-ping" style={{ background: '#ef4444' }} />
                                                )}
                                            </div>
                                            <span className="text-[8px] font-semibold uppercase tracking-wider"
                                                style={{ color: evtType ? EVT_C[evtType] : isDark ? '#555' : '#bbb' }}>
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
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                                            style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
                                            <ChevronRight className={`w-3.5 h-3.5 text-text-dim transition-all duration-300 group-hover:translate-x-0.5 ${isDark ? 'group-hover:text-white' : 'group-hover:text-[#111]'}`} />
                                        </div>
                                    </div>
                                </div>

                                {/* Edit overlay */}
                                <button onClick={(e) => handleEditClick(d, e)}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg text-text-dim hover:text-text-muted transition-all duration-200 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 z-10"
                                    style={{ background: isDark ? 'rgba(17,17,17,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', border: '1px solid var(--color-border)' }}>
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
                                <tr className="text-text-muted text-xs border-b border-border">
                                    {['Device ID', 'Name', 'Status', 'Organization', 'Battery', 'Signal', 'Last Event', 'Last Seen', ''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(d => (
                                    <tr key={d._id} onClick={() => navigate(`/devices/${d._id}`)} className="border-b border-border/30 hover:bg-surface-2 cursor-pointer transition">
                                        <td className="px-4 py-3 font-mono text-xs">{d._id}</td>
                                        <td className="px-4 py-3 font-medium">{d.name}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[d.status] || 'bg-text-dim/20 text-text-dim'}`}>{d.status}</span></td>
                                        <td className="px-4 py-3 text-text-muted">{d.organizationId || '--'}</td>
                                        <td className="px-4 py-3"><div className="flex items-center gap-1.5"><Battery className="w-3.5 h-3.5 text-text-dim" />{battPct(d.battery) ?? '--'}%</div></td>
                                        <td className="px-4 py-3"><div className="flex items-center gap-1.5"><Signal className="w-3.5 h-3.5 text-text-dim" />{d.csq || '--'}</div></td>
                                        <td className="px-4 py-3 text-text-dim">{d.lastEvent?.type || 'N/A'}</td>
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
