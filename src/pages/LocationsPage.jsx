import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Plus, MapPin, Cpu, Users, Trash2, ChevronRight, Search, Building2, Edit3, X } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

export default function LocationsPage() {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState([]);
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editLoc, setEditLoc] = useState(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ _id: '', name: '', organizationId: '', description: '', address: '', lat: '', lng: '' });
    const [showAssignDevice, setShowAssignDevice] = useState(null);
    const [showAssignUser, setShowAssignUser] = useState(null);
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { loadAll(); }, []);
    const loadAll = () => {
        api.locations.getAll().then(d => { setLocations(d.locations || []); setLoading(false); }).catch(e => { console.error(e); setLoading(false); });
        api.organizations.getAll().then(d => setOrgs(d.organizations || [])).catch(() => { });
        api.devices.getAll().then(d => setDevices(d.devices || [])).catch(() => { });
        api.users.getAll().then(d => setUsers(d.users || [])).catch(() => { });
    };

    if (loading) return <PageListSkeleton cardCount={4} />;

    const filtered = locations.filter(l =>
        l.name.toLowerCase().includes(search.toLowerCase()) ||
        l._id.toLowerCase().includes(search.toLowerCase()) ||
        (l.address || '').toLowerCase().includes(search.toLowerCase())
    );

    const resetForm = () => setForm({ _id: '', name: '', organizationId: '', description: '', address: '', lat: '', lng: '' });
    const closeForm = () => { setShowForm(false); setEditLoc(null); resetForm(); };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.locations.create({ ...form, lat: form.lat ? parseFloat(form.lat) : undefined, lng: form.lng ? parseFloat(form.lng) : undefined });
            closeForm(); loadAll();
        } catch (err) { alert(err.message); }
    };

    const handleEditLoc = (l, e) => {
        e.stopPropagation();
        setEditLoc(l._id);
        setShowForm(false);
        setForm({ _id: l._id, name: l.name, organizationId: l.organizationId || '', description: l.description || '', address: l.address || '', lat: l.lat || '', lng: l.lng || '' });
    };

    const handleUpdateLoc = async (e) => {
        e.preventDefault();
        try {
            const { name, organizationId, description, address, lat, lng } = form;
            await api.locations.update(editLoc, { name, organizationId, description, address, lat: lat ? parseFloat(lat) : undefined, lng: lng ? parseFloat(lng) : undefined });
            closeForm(); loadAll();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Deactivate this location?')) return;
        try { await api.locations.remove(id); loadAll(); } catch (err) { alert(err.message); }
    };

    const handleAssignDevice = async (deviceId, locationId) => {
        try {
            await api.devices.update(deviceId, { locationId });
            loadAll();
        } catch (err) { alert(err.message); }
    };

    const handleAssignUser = async (userId, locationId) => {
        try {
            await api.users.update(userId, { locationId });
            loadAll();
        } catch (err) { alert(err.message); }
    };

    const getLocDevices = (locId) => devices.filter(d => d.locationId === locId);
    const getLocUsers = (locId) => users.filter(u => u.locationId === locId);
    const getOrgName = (orgId) => orgs.find(o => o._id === orgId)?.name || orgId;
    const getUnassignedDevices = (orgId) => devices.filter(d => d.organizationId === orgId && !d.locationId);
    const getUnassignedUsers = (orgId) => users.filter(u => u.organizationId === orgId && !u.locationId);

    const inputCls = `w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;
    const btnCls = `rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Locations</h1><p className="text-text-muted text-sm mt-1">{locations.length} locations</p></div>
                <button onClick={() => { closeForm(); setShowForm(true); }} className={`flex items-center gap-2 px-5 py-2.5 ${btnCls}`}><Plus className="w-4 h-4" /> Add Location</button>
            </div>

            {/* Create / Edit Form */}
            {(showForm || editLoc) && (
                <form onSubmit={editLoc ? handleUpdateLoc : handleCreate} className="bg-surface border border-border rounded-2xl p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">{editLoc ? 'Edit Location' : 'New Location'}</h3>
                        <button type="button" onClick={closeForm} className="p-1 hover:bg-surface-3 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div><label className="block text-xs text-text-muted mb-1.5">Location ID</label><input placeholder="loc_himalaya_01" value={form._id} onChange={e => setForm(p => ({ ...p, _id: e.target.value }))} required disabled={!!editLoc} className={`${inputCls} ${editLoc ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Name</label><input placeholder="Himalaya Site 1" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputCls} /></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Organization</label>
                            <select value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value }))} required className={inputCls}>
                                <option value="">Select Organization</option>
                                {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                            </select></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Address</label><input placeholder="Himalaya Region, Uttarakhand" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className={inputCls} /></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Latitude</label><input type="number" step="any" placeholder="30.7346" value={form.lat} onChange={e => setForm(p => ({ ...p, lat: e.target.value }))} className={inputCls} /></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Longitude</label><input type="number" step="any" placeholder="79.0669" value={form.lng} onChange={e => setForm(p => ({ ...p, lng: e.target.value }))} className={inputCls} /></div>
                        <div className="sm:col-span-2 md:col-span-3"><label className="block text-xs text-text-muted mb-1.5">Description</label><input placeholder="Rockfall monitoring at Himalaya site" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={inputCls} /></div>
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                        <button type="button" onClick={closeForm} className="px-5 py-2.5 text-sm text-text-muted border border-border rounded-xl hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2.5 ${btnCls}`}>{editLoc ? 'Update' : 'Create'} Location</button>
                    </div>
                </form>
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-dim" />
                <input type="text" placeholder="Search locations..." value={search} onChange={e => setSearch(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 bg-surface border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`} />
            </div>

            {/* Location Cards */}
            <div className="grid gap-4">
                {filtered.map(loc => {
                    const locDevices = getLocDevices(loc._id);
                    const locUsers = getLocUsers(loc._id);
                    const onlineCount = locDevices.filter(d => d.status === 'ONLINE').length;
                    const alertCount = locDevices.filter(d => d.status === 'ALERT').length;

                    return (
                        <div key={loc._id} className="bg-surface border border-border rounded-2xl overflow-hidden">
                            {/* Location Header */}
                            <div className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 md:gap-5">
                                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/locations/${loc._id}`)}>
                                    <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-info/20' : 'bg-blue-50'}`}>
                                        <MapPin className={`w-5 h-5 md:w-7 md:h-7 ${isDark ? 'text-info' : 'text-blue-600'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-base md:text-lg font-semibold">{loc.name}</h3>
                                            <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-surface-3 text-text-muted' : 'bg-[#f0f0f0] text-[#666]'}`}>{loc._id}</span>
                                            <ChevronRight className="w-4 h-4 text-text-dim" />
                                        </div>
                                        <p className="text-text-dim text-[11px] md:text-xs mt-0.5">
                                            <Building2 className="w-3 h-3 inline mr-1" />{getOrgName(loc.organizationId)}
                                            {loc.address && <span> • {loc.address}</span>}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 md:gap-6 text-sm">
                                    <div className="text-center"><span className="font-bold">{locDevices.length}</span><p className="text-[10px] text-text-dim">Devices</p></div>
                                    <div className="text-center"><span className="font-bold text-success">{onlineCount}</span><p className="text-[10px] text-text-dim">Online</p></div>
                                    {alertCount > 0 && <div className="text-center"><span className="font-bold text-danger">{alertCount}</span><p className="text-[10px] text-text-dim">Alerts</p></div>}
                                    <div className="text-center"><span className="font-bold">{locUsers.length}</span><p className="text-[10px] text-text-dim">Users</p></div>
                                </div>

                                <div className="flex gap-2">
                                    <button onClick={(e) => handleEditLoc(loc, e)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDark ? 'bg-surface-3 text-text-muted hover:text-white' : 'bg-[#f0f0f0] text-[#666] hover:text-[#111]'}`}><Edit3 className="w-3 h-3" /></button>
                                    <button onClick={() => setShowAssignDevice(showAssignDevice === loc._id ? null : loc._id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDark ? 'bg-surface-3 text-text-muted hover:text-white' : 'bg-[#f0f0f0] text-[#666] hover:text-[#111]'}`}>+ Device</button>
                                    <button onClick={() => setShowAssignUser(showAssignUser === loc._id ? null : loc._id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDark ? 'bg-surface-3 text-text-muted hover:text-white' : 'bg-[#f0f0f0] text-[#666] hover:text-[#111]'}`}>+ User</button>
                                    <button onClick={(e) => handleDelete(loc._id, e)} className="p-1.5 rounded-lg hover:bg-danger/10 text-text-dim hover:text-danger transition"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>

                            {/* Assign Device Panel */}
                            {showAssignDevice === loc._id && (
                                <div className={`px-5 py-3 border-t border-border ${isDark ? 'bg-surface-2' : 'bg-[#fafafa]'}`}>
                                    <p className="text-xs text-text-muted font-medium mb-2">Assign unassigned devices from {getOrgName(loc.organizationId)}:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {getUnassignedDevices(loc.organizationId).map(d => (
                                            <button key={d._id} onClick={() => handleAssignDevice(d._id, loc._id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${isDark ? 'border-border text-text-muted hover:bg-surface-3 hover:text-white' : 'border-[#ddd] text-[#666] hover:bg-[#f0f0f0] hover:text-[#111]'}`}>
                                                <Cpu className="w-3 h-3 inline mr-1" />{d.name} ({d._id})
                                            </button>
                                        ))}
                                        {getUnassignedDevices(loc.organizationId).length === 0 && <span className="text-xs text-text-dim">No unassigned devices</span>}
                                    </div>
                                </div>
                            )}

                            {/* Assign User Panel */}
                            {showAssignUser === loc._id && (
                                <div className={`px-5 py-3 border-t border-border ${isDark ? 'bg-surface-2' : 'bg-[#fafafa]'}`}>
                                    <p className="text-xs text-text-muted font-medium mb-2">Assign unassigned users from {getOrgName(loc.organizationId)}:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {getUnassignedUsers(loc.organizationId).map(u => (
                                            <button key={u._id} onClick={() => handleAssignUser(u._id, loc._id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${isDark ? 'border-border text-text-muted hover:bg-surface-3 hover:text-white' : 'border-[#ddd] text-[#666] hover:bg-[#f0f0f0] hover:text-[#111]'}`}>
                                                <Users className="w-3 h-3 inline mr-1" />{u.name} ({u.email})
                                            </button>
                                        ))}
                                        {getUnassignedUsers(loc.organizationId).length === 0 && <span className="text-xs text-text-dim">No unassigned users</span>}
                                    </div>
                                </div>
                            )}

                            {/* Assigned Devices */}
                            {locDevices.length > 0 && (
                                <div className="border-t border-border/30">
                                    <div className="px-5 py-2 flex items-center gap-2 text-[10px] text-text-dim uppercase tracking-wider font-medium"><Cpu className="w-3 h-3" /> Assigned Devices</div>
                                    <div className="px-4 md:px-5 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {locDevices.map(d => {
                                            const statusCls = { ONLINE: 'bg-success', ALERT: 'bg-danger animate-pulse', MAINTENANCE: 'bg-warning' };
                                            return (
                                                <div key={d._id} onClick={() => navigate(`/devices/${d._id}`)}
                                                    className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition ${isDark ? 'hover:bg-surface-3' : 'hover:bg-[#f5f5f5]'}`}>
                                                    <span className={`w-2 h-2 rounded-full ${statusCls[d.status]}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate">{d.name}</p>
                                                        <p className="text-[10px] text-text-dim">{d._id}</p>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); handleAssignDevice(d._id, null); }}
                                                        className="text-text-dim hover:text-danger text-[10px]">✕</button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Assigned Users */}
                            {locUsers.length > 0 && (
                                <div className="border-t border-border/30">
                                    <div className="px-5 py-2 flex items-center gap-2 text-[10px] text-text-dim uppercase tracking-wider font-medium"><Users className="w-3 h-3" /> Assigned Users</div>
                                    <div className="px-4 md:px-5 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {locUsers.map(u => (
                                            <div key={u._id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${isDark ? 'hover:bg-surface-3' : 'hover:bg-[#f5f5f5]'}`}>
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${isDark ? 'bg-surface-3' : 'bg-[#e8e8e8]'}`}>{u.name?.charAt(0)}</div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium truncate">{u.name}</p>
                                                    <p className="text-[10px] text-text-dim">{u.email}</p>
                                                </div>
                                                <button onClick={() => handleAssignUser(u._id, null)}
                                                    className="text-text-dim hover:text-danger text-[10px]">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filtered.length === 0 && <p className="text-center text-text-dim py-12">No locations found</p>}
            </div>
        </div>
    );
}
