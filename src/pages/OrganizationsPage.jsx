import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Plus, Building2, MapPin, Cpu, Users, Trash2, ChevronRight, Edit3, X } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

export default function OrganizationsPage() {
    const [orgs, setOrgs] = useState([]);
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editOrg, setEditOrg] = useState(null);
    const [form, setForm] = useState({ _id: '', name: '', address: '', contactEmail: '', contactPhone: '', location: '' });
    const { isSuperAdmin } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    function loadOrgs() {
        api.organizations.getAll().then(d => {
            const list = (d.organizations || []).map(o => ({
                ...o,
                _id: o._id || o.id,
                id: o.id || o._id
            }));
            setOrgs(list);
            setLoading(false);
        }).catch(e => { console.error(e); setLoading(false); });
    }

    function loadExtra() {
        api.devices.getAll().then(d => setDevices(d.devices || [])).catch(() => {});
        api.users.getAll().then(d => setUsers(d.users || [])).catch(() => {});
    }

    useEffect(() => { loadOrgs(); loadExtra(); }, []);

    const resetForm = () => setForm({ _id: '', name: '', address: '', contactEmail: '', contactPhone: '', location: '' });

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.organizations.create(form);
            setShowForm(false); resetForm(); loadOrgs();
        } catch (err) { alert(err.message); }
    };

    const handleEdit = (o, e) => {
        e.stopPropagation();
        setEditOrg(o._id || o.id);
        setShowForm(true);
        setForm({ _id: o._id || o.id, name: o.name, address: o.address || '', contactEmail: o.contactEmail || '', contactPhone: o.contactPhone || '', location: o.location || '' });
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const { name, address, contactEmail, contactPhone, location } = form;
            await api.organizations.update(editOrg, { name, address, contactEmail, contactPhone, location });
            setEditOrg(null); setShowForm(false); resetForm(); loadOrgs();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Deactivate this organization?')) return;
        try { await api.organizations.remove(id); loadOrgs(); } catch (err) { alert(err.message); }
    };

    const inputCls = `w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;
    const btnCls = `rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`;

    if (loading) return <PageListSkeleton cardCount={3} />;

    const getOrgDeviceCount = (orgId) => devices.filter(d => (d.organizationId || d.org_id) === orgId).length;
    const getOrgUserCount = (orgId) => users.filter(u => (u.organizationId || u.org_id) === orgId).length;
    const getOrgOnline = (orgId) => devices.filter(d => (d.organizationId || d.org_id) === orgId && d.status === 'ONLINE').length;
    const getOrgAlerts = (orgId) => devices.filter(d => (d.organizationId || d.org_id) === orgId && d.status === 'ALERT').length;

    const formFields = [
        ...(editOrg ? [{ key: '_id', label: 'Org ID (Auto-generated)', ph: 'org_001', disabled: true }] : []),
        { key: 'name', label: 'Organization Name', ph: 'e.g. Apex Mining Corp', required: true },
        { key: 'location', label: 'Region / Headquarters', ph: 'e.g. Uttarakhand' },
        { key: 'address', label: 'Full Address', ph: 'e.g. Dehradun, UK' },
        { key: 'contactEmail', label: 'Email', ph: 'admin@org.com' },
        { key: 'contactPhone', label: 'Phone', ph: '+91...' }
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Organizations</h1><p className="text-text-muted text-sm mt-1">{orgs.length} organizations</p></div>
                {isSuperAdmin && (
                    <button onClick={() => { setShowForm(!showForm); setEditOrg(null); resetForm(); }} className={`flex items-center gap-2 px-5 py-2.5 ${btnCls}`}><Plus className="w-4 h-4" /> Add Organization</button>
                )}
            </div>

            {/* Create / Edit Form */}
            {(showForm || editOrg) && (
                <form onSubmit={editOrg ? handleUpdate : handleCreate} className="bg-surface border border-border rounded-2xl p-4 md:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">{editOrg ? 'Edit Organization' : 'New Organization'}</h3>
                        <button type="button" onClick={() => { setShowForm(false); setEditOrg(null); resetForm(); }} className="p-1 hover:bg-surface-3 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {formFields.map(f => (
                            <div key={f.key}><label className="block text-xs text-text-muted mb-1.5">{f.label}</label>
                                <input placeholder={f.ph} value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} required={!!f.required} disabled={f.disabled}
                                    className={`${inputCls} ${f.disabled ? 'opacity-50 cursor-not-allowed' : ''}`} /></div>
                        ))}
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                        <button type="button" onClick={() => { setShowForm(false); setEditOrg(null); resetForm(); }} className="px-5 py-2.5 text-sm text-text-muted border border-border rounded-xl hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2.5 ${btnCls}`}>{editOrg ? 'Update' : 'Create'}</button>
                    </div>
                </form>
            )}

            <div className="grid gap-4">
                {orgs.map(o => {
                    const dCount = getOrgDeviceCount(o._id);
                    const uCount = getOrgUserCount(o._id);
                    const online = getOrgOnline(o._id);
                    const alerts = getOrgAlerts(o._id);
                    return (
                        <div key={o._id} onClick={() => navigate(`/organizations/${o._id}`)}
                            className="bg-surface border border-border rounded-2xl p-4 md:p-5 cursor-pointer hover:border-border-light transition group">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-5">
                                <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-surface-3 flex items-center justify-center shrink-0">
                                    <Building2 className="w-6 h-6 md:w-7 md:h-7 text-text-muted" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-base md:text-lg font-semibold">{o.name}</h3>
                                        {o.location && (
                                            <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${isDark ? 'bg-info/20 text-info' : 'bg-blue-50 text-blue-600'}`}>
                                                <MapPin className="w-3 h-3" />{o.location}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-text-dim text-xs mt-0.5">{o._id} • {o.address || 'No address'}</p>
                                    {o.contactEmail && <p className="text-text-dim text-xs">{o.contactEmail}</p>}
                                </div>

                                <div className="flex items-center gap-4 md:gap-6 text-sm">
                                    <div className="text-center"><div className="flex items-center gap-1 text-text-muted"><Cpu className="w-4 h-4" /><span className="font-semibold">{dCount}</span></div><p className="text-[10px] text-text-dim mt-0.5">Devices</p></div>
                                    <div className="text-center"><div className="flex items-center gap-1 text-success"><span className="w-2 h-2 rounded-full bg-success" /><span className="font-semibold">{online}</span></div><p className="text-[10px] text-text-dim mt-0.5">Online</p></div>
                                    <div className="text-center"><div className={`flex items-center gap-1 ${alerts > 0 ? 'text-danger' : 'text-text-dim'}`}>{alerts > 0 && <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />}<span className="font-semibold">{alerts}</span></div><p className="text-[10px] text-text-dim mt-0.5">Alerts</p></div>
                                    <div className="text-center"><div className="flex items-center gap-1 text-text-muted"><Users className="w-4 h-4" /><span className="font-semibold">{uCount}</span></div><p className="text-[10px] text-text-dim mt-0.5">Users</p></div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button onClick={(e) => handleEdit(o, e)} className="p-2 rounded-xl hover:bg-surface-3 text-text-dim hover:text-text-muted transition"><Edit3 className="w-4 h-4" /></button>
                                    <button onClick={(e) => handleDelete(o._id, e)} className="p-2 rounded-xl hover:bg-danger/10 text-text-dim hover:text-danger transition"><Trash2 className="w-4 h-4" /></button>
                                    <ChevronRight className={`w-5 h-5 text-text-dim transition ${isDark ? 'group-hover:text-white' : 'group-hover:text-[#111]'}`} />
                                </div>
                            </div>
                        </div>
                    );
                })}
                {orgs.length === 0 && <p className="text-center text-text-dim py-12">No organizations</p>}
            </div>
        </div>
    );
}
