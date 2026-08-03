import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Plus, Users as UsersIcon, Trash2, Shield, MapPin } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

const roleBadge = { SUPER_ADMIN: 'bg-white/10 text-white', ORG_ADMIN: 'bg-warning/20 text-warning', USER: 'bg-info/20 text-info' };

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [orgs, setOrgs] = useState([]);
    const [locs, setLocs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'USER', organizationId: '', locationId: '', phone: '' });
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { loadUsers(); loadOrgs(); loadLocs(); }, []);
    const loadUsers = () => api.users.getAll().then(d => { setUsers(d.users || []); setLoading(false); }).catch(e => { console.error(e); setLoading(false); });
    const loadOrgs = () => api.organizations.getAll().then(d => setOrgs(d.organizations || [])).catch(() => { });
    const loadLocs = () => api.locations.getAll().then(d => setLocs(d.locations || [])).catch(() => { });

    const handleCreate = async (e) => {
        e.preventDefault();
        try { await api.users.create(form); setShowForm(false); setForm({ name: '', email: '', password: '', role: 'USER', organizationId: '', locationId: '', phone: '' }); loadUsers(); }
        catch (err) { alert(err.message); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Deactivate this user?')) return;
        try { await api.users.remove(id); loadUsers(); } catch (err) { alert(err.message); }
    };

    const inputCls = `w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    if (loading) return <PageListSkeleton cardCount={5} />;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Users</h1><p className="text-text-muted text-sm mt-1">{users.length} users</p></div>
                <button onClick={() => setShowForm(!showForm)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}><Plus className="w-4 h-4" /> Add User</button>
            </div>

            {showForm && (
                <form onSubmit={handleCreate} className="bg-surface border border-border rounded-2xl p-6 grid grid-cols-3 gap-4">
                    <div><label className="block text-xs text-text-muted mb-1.5">Name</label>
                        <input type="text" placeholder="Amit Mondal" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Email</label>
                        <input type="email" placeholder="amit@comp.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Password</label>
                        <input type="password" placeholder="••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Organization</label>
                        <select value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value, locationId: '' }))} className={inputCls}>
                            <option value="">No Organization</option>
                            {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                        </select></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Location</label>
                        <select value={form.locationId} onChange={e => setForm(p => ({ ...p, locationId: e.target.value }))} className={inputCls}>
                            <option value="">No Location</option>
                            {locs.filter(l => !form.organizationId || l.organizationId === form.organizationId).map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                        </select></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Phone</label>
                        <input type="text" placeholder="+91..." value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5">Role</label>
                        <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                            <option value="USER">USER</option><option value="ORG_ADMIN">ORG_ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option>
                        </select></div>
                    <div className="col-span-3 flex gap-3 justify-end">
                        <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 text-sm text-text-muted border border-border rounded-xl hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`}>Create User</button>
                    </div>
                </form>
            )}

            <div className="grid gap-3">
                {users.map(u => (
                    <div key={u._id} className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-5 hover:border-border-light transition">
                        <div className="w-10 h-10 rounded-full bg-surface-3 flex items-center justify-center text-sm font-bold">{u.name?.charAt(0)}</div>
                        <div className="flex-1"><h3 className="font-semibold">{u.name}</h3><p className="text-text-dim text-xs">{u.email}</p></div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadge[u.role] || ''}`}>{u.role}</span>
                        <div className="text-xs text-text-dim">{orgs.find(o => o._id === u.organizationId)?.name || u.organizationId || 'No org'}</div>
                        {u.locationId && <div className="flex items-center gap-1 text-xs text-text-dim"><MapPin className="w-3 h-3" />{locs.find(l => l._id === u.locationId)?.name || u.locationId}</div>}
                        <div className="text-xs text-text-dim">{u.assignedDevices?.length || 0} devices</div>
                        <button onClick={() => handleDelete(u._id)} className="p-2 rounded-xl hover:bg-danger/10 text-text-dim hover:text-danger transition"><Trash2 className="w-4 h-4" /></button>
                    </div>
                ))}
                {users.length === 0 && <p className="text-center text-text-dim py-12">No users</p>}
            </div>
        </div>
    );
}
