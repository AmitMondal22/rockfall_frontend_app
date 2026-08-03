import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import { Plus, Trash2, Bell, Zap, AlertTriangle, CheckCircle, XCircle, Clock, Edit3, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';

const severityBadge = { LOW: 'bg-success/20 text-success', MEDIUM: 'bg-warning/20 text-warning', HIGH: 'bg-danger/20 text-danger', CRITICAL: 'bg-red-900/40 text-red-400' };
const statusBadge = { ACTIVE: 'bg-danger/20 text-danger', ACKNOWLEDGED: 'bg-warning/20 text-warning', RESOLVED: 'bg-success/20 text-success' };

export default function AlertRulesPage() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editRule, setEditRule] = useState(null);
    const [form, setForm] = useState({ name: '', conditions: [{ field: 'peak_g', operator: '>', value: '' }], severity: 'HIGH', actions: ['EMAIL'], organizationId: '', eventType: '' });
    const [logFilter, setLogFilter] = useState('');
    const [showLogs, setShowLogs] = useState(true);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { loadRules(); loadOrgs(); loadLogs(); }, []);
    const loadRules = () => api.alerts.getRules().then(d => { setRules(d.rules || []); setLoading(false); }).catch(e => { console.error(e); setLoading(false); });
    const loadOrgs = () => api.organizations.getAll().then(d => setOrgs(d.organizations || [])).catch(() => { });
    const loadLogs = () => api.alerts.getLogs({ limit: '200' }).then(d => setLogs(d.alerts || [])).catch(() => setLogs([]));

    const resetForm = () => setForm({ name: '', conditions: [{ field: 'peak_g', operator: '>', value: '' }], severity: 'HIGH', actions: ['EMAIL'], organizationId: '', eventType: '' });
    const closeForm = () => { setShowForm(false); setEditRule(null); resetForm(); };

    const addCondition = () => setForm(p => ({ ...p, conditions: [...p.conditions, { field: '', operator: '>', value: '' }] }));
    const removeCondition = (i) => setForm(p => ({ ...p, conditions: p.conditions.filter((_, idx) => idx !== i) }));
    const updateCondition = (i, key, val) => setForm(p => ({ ...p, conditions: p.conditions.map((c, idx) => idx === i ? { ...c, [key]: key === 'value' ? parseFloat(val) || val : val } : c) }));
    const toggleAction = (action) => setForm(p => ({ ...p, actions: p.actions.includes(action) ? p.actions.filter(a => a !== action) : [...p.actions, action] }));

    const handleCreate = async (e) => {
        e.preventDefault();
        try { await api.alerts.createRule(form); closeForm(); loadRules(); }
        catch (err) { alert(err.message); }
    };

    const handleEditRule = (r) => {
        setEditRule(r._id);
        setShowForm(false);
        setForm({ name: r.name, conditions: r.conditions || [{ field: 'peak_g', operator: '>', value: '' }], severity: r.severity, actions: r.actions || ['EMAIL'], organizationId: r.organizationId || '', eventType: r.eventType || '' });
    };

    const handleUpdateRule = async (e) => {
        e.preventDefault();
        try { await api.alerts.updateRule(editRule, form); closeForm(); loadRules(); }
        catch (err) { alert(err.message); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this rule?')) return;
        try { await api.alerts.deleteRule(id); loadRules(); } catch (err) { alert(err.message); }
    };

    const handleAcknowledge = async (id) => {
        try { await api.alerts.acknowledge(id); loadLogs(); } catch (err) { alert(err.message); }
    };

    const handleResolve = async (id) => {
        try { await api.alerts.resolve(id); loadLogs(); } catch (err) { alert(err.message); }
    };

    const filteredLogs = logFilter ? logs.filter(l => l.status === logFilter) : logs;

    if (loading) return <PageListSkeleton cardCount={3} />;

    const inputCls = `w-full px-3 py-2.5 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;
    const btnCls = `rounded-xl text-sm font-semibold transition ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Alert Rules</h1><p className="text-text-muted text-sm mt-1">{rules.length} rules configured</p></div>
                <button onClick={() => { closeForm(); setShowForm(true); }} className={`flex items-center gap-2 px-5 py-2.5 ${btnCls}`}><Plus className="w-4 h-4" /> Add Rule</button>
            </div>

            {/* Create / Edit Form */}
            {(showForm || editRule) && (
                <form onSubmit={editRule ? handleUpdateRule : handleCreate} className="bg-surface border border-border rounded-2xl p-4 md:p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{editRule ? 'Edit Rule' : 'New Rule'}</h3>
                        <button type="button" onClick={closeForm} className="p-1 hover:bg-surface-3 rounded-lg"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <div><label className="block text-xs text-text-muted mb-1.5">Rule Name</label><input required placeholder="High Rockfall" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Organization</label>
                            <select value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value }))} className={inputCls}>
                                <option value="">All Organizations</option>
                                {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                            </select></div>
                        <div><label className="block text-xs text-text-muted mb-1.5">Severity</label>
                            <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} className={inputCls}>
                                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select></div>
                    </div>

                    <div><label className="block text-xs text-text-muted mb-2">Conditions</label>
                        {form.conditions.map((c, i) => (
                            <div key={i} className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-2">
                                <select value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)} className={`flex-1 px-3 py-2 bg-surface-2 border border-border rounded-xl text-sm ${isDark ? 'text-white' : 'text-[#111]'}`}>
                                    {['peak_g', 'duration_ms', 'peaks', 'energy_g2', 'mean_g', 'battery', 'csq'].map(f => <option key={f}>{f}</option>)}
                                </select>
                                <select value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)} className={`w-full sm:w-20 px-3 py-2 bg-surface-2 border border-border rounded-xl text-sm ${isDark ? 'text-white' : 'text-[#111]'}`}>
                                    {['>', '<', '>=', '<=', '==', '!='].map(o => <option key={o}>{o}</option>)}
                                </select>
                                <input type="number" step="any" placeholder="Value" value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} className={`flex-1 px-3 py-2 bg-surface-2 border border-border rounded-xl text-sm ${isDark ? 'text-white' : 'text-[#111]'}`} />
                                {form.conditions.length > 1 && <button type="button" onClick={() => removeCondition(i)} className="px-3 text-text-dim hover:text-danger"><Trash2 className="w-4 h-4" /></button>}
                            </div>
                        ))}
                        <button type="button" onClick={addCondition} className="text-xs text-text-muted hover:text-text-dim transition mt-1">+ Add Condition</button>
                    </div>

                    <div><label className="block text-xs text-text-muted mb-2">Actions</label>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                            {['EMAIL', 'SMS', 'WHATSAPP', 'WEBHOOK'].map(a => (
                                <button key={a} type="button" onClick={() => toggleAction(a)}
                                    className={`px-4 py-2 rounded-xl text-xs font-medium transition ${form.actions.includes(a) ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white') : 'bg-surface-2 text-text-dim border border-border hover:border-border-light'}`}>{a}</button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button type="button" onClick={closeForm} className="px-5 py-2.5 text-sm text-text-muted border border-border rounded-xl hover:bg-surface-3 transition">Cancel</button>
                        <button type="submit" className={`px-5 py-2.5 ${btnCls}`}>{editRule ? 'Update Rule' : 'Create Rule'}</button>
                    </div>
                </form>
            )}

            {/* Rules List */}
            <div className="grid gap-3">
                {rules.map(r => (
                    <div key={r._id} className="bg-surface border border-border rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 md:gap-5 hover:border-border-light transition">
                        <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center shrink-0"><Zap className="w-5 h-5 text-text-muted" /></div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{r.name}</h3><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge[r.severity]}`}>{r.severity}</span></div>
                            <p className="text-text-dim text-xs mt-1">{r.conditions?.map(c => `${c.field} ${c.operator} ${c.value}`).join(' AND ')}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">{r.actions?.map(a => <span key={a} className="px-2 py-0.5 bg-surface-3 rounded-lg text-xs text-text-muted">{a}</span>)}</div>
                        <div className={`w-2 h-2 rounded-full ${r.isActive ? 'bg-success' : 'bg-text-dim'}`} />
                        <div className="flex items-center gap-1">
                            <button onClick={() => handleEditRule(r)} className="p-2 rounded-xl hover:bg-surface-3 text-text-dim hover:text-text-muted transition"><Edit3 className="w-4 h-4" /></button>
                            <button onClick={() => handleDelete(r._id)} className="p-2 rounded-xl hover:bg-danger/10 text-text-dim hover:text-danger transition"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                ))}
                {rules.length === 0 && <p className="text-center text-text-dim py-12">No alert rules configured</p>}
            </div>

            {/* Generated Alerts List */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 md:py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 font-semibold text-sm md:text-base">
                        <AlertTriangle className="w-5 h-5 text-danger" /> Generated Alerts
                        {showLogs ? <ChevronUp className="w-4 h-4 text-text-dim" /> : <ChevronDown className="w-4 h-4 text-text-dim" />}
                    </button>
                    <span className="text-text-dim text-xs">{logs.length} total alerts</span>
                    <div className="flex gap-2 sm:ml-auto">
                        {['', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map(f => (
                            <button key={f} onClick={() => setLogFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${logFilter === f ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white') : 'bg-surface-2 text-text-dim hover:text-text-muted'}`}>{f || 'All'}</button>
                        ))}
                    </div>
                </div>

                {showLogs && (
                    <div className="overflow-x-auto" style={{ maxHeight: '500px' }}>
                        <table className="w-full text-xs md:text-sm">
                            <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#111]' : 'bg-white'}`}>
                                <tr className="text-text-muted text-xs border-b border-border">
                                    {['Time', 'Device', 'Rule', 'Severity', 'Event Type', 'Status', 'Message', 'Actions'].map(h => <th key={h} className="px-3 md:px-4 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.map(a => (
                                    <tr key={a._id} className="border-b border-border/30 hover:bg-surface-2 transition">
                                        <td className="px-3 md:px-4 py-2.5 text-text-muted whitespace-nowrap">{a.createdAt ? new Date(a.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5 font-mono text-xs">{a.deviceId}</td>
                                        <td className="px-3 md:px-4 py-2.5 font-medium">{a.ruleName || '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityBadge[a.severity]}`}>{a.severity}</span></td>
                                        <td className="px-3 md:px-4 py-2.5">{a.eventType || '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[a.status]}`}>{a.status}</span></td>
                                        <td className="px-3 md:px-4 py-2.5 text-text-dim max-w-[200px] truncate" title={a.message}>{a.message || '--'}</td>
                                        <td className="px-3 md:px-4 py-2.5">
                                            <div className="flex gap-1">
                                                {a.status === 'ACTIVE' && (
                                                    <button onClick={() => handleAcknowledge(a._id)} className="p-1 rounded hover:bg-warning/10 text-text-dim hover:text-warning transition" title="Acknowledge">
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                {(a.status === 'ACTIVE' || a.status === 'ACKNOWLEDGED') && (
                                                    <button onClick={() => handleResolve(a._id)} className="p-1 rounded hover:bg-success/10 text-text-dim hover:text-success transition" title="Resolve">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredLogs.length === 0 && <p className="text-center text-text-dim py-12">No alerts {logFilter ? `with status ${logFilter}` : 'generated yet'}</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
