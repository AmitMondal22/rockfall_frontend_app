import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import api from '../services/api';
import { Settings as SettingsIcon, Lock, User, Save, CheckCircle, AlertCircle, Edit3, X } from 'lucide-react';
import { SettingsSkeleton } from '../components/Skeleton';

export default function SettingsPage() {
    const { setUser } = useAuth();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const [profile, setProfile] = useState(null);
    const [editName, setEditName] = useState(false);
    const [nameForm, setNameForm] = useState('');
    const [nameMsg, setNameMsg] = useState('');
    const [nameErr, setNameErr] = useState('');
    const [nameSaving, setNameSaving] = useState(false);

    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [pwMsg, setPwMsg] = useState('');
    const [pwErr, setPwErr] = useState('');
    const [pwSaving, setPwSaving] = useState(false);

    useEffect(() => {
        api.auth.me().then(d => {
            setProfile(d.user);
            setNameForm(d.user.name || '');
        }).catch(console.error);
    }, []);

    const handleUpdateName = async (e) => {
        e.preventDefault();
        setNameMsg(''); setNameErr('');
        if (!nameForm.trim() || nameForm.trim().length < 2) { setNameErr('Name must be at least 2 characters'); return; }
        setNameSaving(true);
        try {
            const res = await api.auth.updateProfile({ name: nameForm.trim() });
            setProfile(res.user);
            setUser(res.user);
            setNameMsg('Name updated successfully');
            setEditName(false);
            setTimeout(() => setNameMsg(''), 3000);
        } catch (err) { setNameErr(err.message); }
        finally { setNameSaving(false); }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwMsg(''); setPwErr('');
        if (!pwForm.currentPassword) { setPwErr('Current password is required'); return; }
        if (!pwForm.newPassword || pwForm.newPassword.length < 6) { setPwErr('New password must be at least 6 characters'); return; }
        if (pwForm.newPassword !== pwForm.confirmPassword) { setPwErr('New password and confirm password do not match'); return; }
        setPwSaving(true);
        try {
            const res = await api.auth.changePassword(pwForm);
            setPwMsg(res.message || 'Password changed successfully');
            setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            setTimeout(() => setPwMsg(''), 5000);
        } catch (err) { setPwErr(err.message); }
        finally { setPwSaving(false); }
    };

    const formatDate = (d) => d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';

    const btnCls = `rounded-xl text-sm font-semibold transition disabled:opacity-50 ${isDark ? 'bg-white text-black hover:bg-[#ddd]' : 'bg-[#111] text-white hover:bg-[#333]'}`;
    const inputCls = `w-full px-4 py-3 bg-surface-2 border border-border rounded-xl text-sm placeholder:text-text-dim focus:outline-none transition ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`;

    if (!profile) return <SettingsSkeleton />;

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-text-muted text-sm mt-1">Account settings and preferences</p>
            </div>

            {/* Profile Section */}
            <div className="bg-surface border border-border rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3"><User className="w-5 h-5 text-text-muted" /><h2 className="font-semibold">Profile Information</h2></div>
                </div>

                <div className="flex items-center gap-5 mb-6 pb-6 border-b border-border">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${isDark ? 'bg-white text-black' : 'bg-[#111] text-white'}`}>
                        {profile.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1">
                        {editName ? (
                            <form onSubmit={handleUpdateName} className="flex items-center gap-3">
                                <input type="text" value={nameForm} onChange={e => setNameForm(e.target.value)} autoFocus
                                    className={`px-4 py-2 bg-surface-2 border border-border rounded-xl text-sm focus:outline-none transition w-64 ${isDark ? 'text-white focus:border-white' : 'text-[#111] focus:border-[#111]'}`} />
                                <button type="submit" disabled={nameSaving} className={`px-4 py-2 ${btnCls}`}><Save className="w-4 h-4" /></button>
                                <button type="button" onClick={() => { setEditName(false); setNameForm(profile.name); setNameErr(''); }}
                                    className="px-3 py-2 border border-border rounded-xl text-text-dim hover:bg-surface-3 transition"><X className="w-4 h-4" /></button>
                            </form>
                        ) : (
                            <div className="flex items-center gap-3">
                                <h3 className="text-xl font-bold">{profile.name}</h3>
                                <button onClick={() => setEditName(true)} className="p-1.5 rounded-lg hover:bg-surface-3 text-text-dim transition"><Edit3 className="w-4 h-4" /></button>
                            </div>
                        )}
                        <p className="text-text-muted text-sm mt-0.5">{profile.email}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${isDark ? 'bg-white/10 text-white' : 'bg-[#f0f0f0] text-[#111]'}`}>{profile.role?.replace('_', ' ')}</span>
                </div>

                {nameMsg && <div className="mb-4 flex items-center gap-2 text-success text-sm bg-success/10 px-4 py-3 rounded-xl"><CheckCircle className="w-4 h-4" />{nameMsg}</div>}
                {nameErr && <div className="mb-4 flex items-center gap-2 text-danger text-sm bg-danger/10 px-4 py-3 rounded-xl"><AlertCircle className="w-4 h-4" />{nameErr}</div>}

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    {[['Email', profile.email], ['Role', profile.role], ['Organization', profile.organizationId || 'No organization assigned'], ['Phone', profile.phone || 'Not provided'], ['Devices Assigned', `${profile.assignedDevices?.length || 0} device(s)`], ['Account Status', profile.isActive ? 'Active' : 'Inactive'], ['Last Login', formatDate(profile.lastLogin)], ['Account Created', formatDate(profile.createdAt)]].map(([label, value]) => (
                        <div key={label} className="py-3 border-b border-border/30">
                            <p className="text-xs text-text-dim mb-1 uppercase tracking-wider">{label}</p>
                            <p className="text-sm font-medium">{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Change Password */}
            <form onSubmit={handleChangePassword} className="bg-surface border border-border rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6"><Lock className="w-5 h-5 text-text-muted" /><h2 className="font-semibold">Change Password</h2></div>
                <div className="space-y-4">
                    <div><label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">Current Password</label><input type="password" value={pwForm.currentPassword} onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} required placeholder="Enter your current password" className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">New Password</label><input type="password" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} required placeholder="Enter new password (min 6 characters)" className={inputCls} /></div>
                    <div><label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wider">Confirm New Password</label><input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} required placeholder="Re-enter new password" className={inputCls} /></div>
                </div>
                {pwMsg && <div className="mt-4 flex items-center gap-2 text-success text-sm bg-success/10 px-4 py-3 rounded-xl border border-success/20"><CheckCircle className="w-4 h-4" />{pwMsg}</div>}
                {pwErr && <div className="mt-4 flex items-center gap-2 text-danger text-sm bg-danger/10 px-4 py-3 rounded-xl border border-danger/20"><AlertCircle className="w-4 h-4" />{pwErr}</div>}
                <button type="submit" disabled={pwSaving} className={`mt-6 flex items-center gap-2 px-6 py-3 ${btnCls}`}><Lock className="w-4 h-4" />{pwSaving ? 'Updating...' : 'Update Password'}</button>
            </form>


        </div>
    );
}
