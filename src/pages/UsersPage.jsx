import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  Plus,
  Trash2,
  Edit2,
  MapPin,
  Search,
  Users,
  Shield,
  Building2,
  Mail,
  Lock,
  Phone,
  AlertTriangle,
  X,
  CheckCircle2,
  UserCheck,
  FolderGit2,
  Mountain,
  ShieldCheck,
  Cpu,
  Key,
  Crown,
  User
} from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';

const ROLE_INFO = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    desc: 'Full global system control across all organizations & projects',
    badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold',
    Icon: Crown
  },
  ORG_ADMIN: {
    label: 'Org Admin',
    desc: 'Manages entire organization, all projects, sites & assets',
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold',
    Icon: Building2
  },
  PROJECT_USER: {
    label: 'Project User',
    desc: 'Manages project sites, barrier assets, and can add/remove devices',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold',
    Icon: FolderGit2
  },
  PROJECT_ADMIN: {
    label: 'Project Admin',
    desc: 'Project Administrator with full project control and device removal access',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/30 font-bold',
    Icon: FolderGit2
  },
  LOCATION_USER: {
    label: 'Site / Location User',
    desc: 'Manages physical site barrier assets. Can add devices (cannot remove)',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold',
    Icon: MapPin
  },
  SITE_USER: {
    label: 'Site User',
    desc: 'Site monitoring staff. Can add devices (cannot remove)',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold',
    Icon: MapPin
  },
  ASSET_USER: {
    label: 'Asset Operator',
    desc: 'Assigned specific barrier fence/net. Can add devices (cannot remove)',
    badge: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-bold',
    Icon: ShieldCheck
  },
  USER: {
    label: 'Standard Viewer',
    desc: 'Read-only viewer for telemetry and safety dashboards',
    badge: 'bg-slate-500/10 text-slate-400 border border-slate-500/30',
    Icon: User
  }
};

export default function UsersPage() {
  const { user: currentUser, isSuperAdmin, isOrgAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [locs, setLocs] = useState([]);
  const [assets, setAssets] = useState([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = Add, object = Edit
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'LOCATION_USER',
    organizationId: '',
    projectId: '',
    locationId: '',
    assignedAssets: [],
    phone: ''
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const userOrgId = currentUser?.org_id || currentUser?.organizationId;
  const currentOrgName =
    currentUser?.organization?.name ||
    orgs.find((o) => (o._id || o.id) === userOrgId)?.name ||
    currentUser?.organizationName ||
    'My Organization';

  function loadData() {
    setLoading(true);
    Promise.all([
      api.users.getAll().catch(() => ({ users: [] })),
      api.organizations.getAll().catch(() => ({ organizations: [] })),
      api.projects.getAll().catch(() => ({ projects: [] })),
      api.locations.getAll().catch(() => ({ locations: [] })),
      api.assets.getAll().catch(() => ({ assets: [] }))
    ]).then(([uRes, oRes, pRes, lRes, aRes]) => {
      setUsers(uRes.users || []);
      setOrgs(oRes.organizations || []);
      setProjects(pRes.projects || []);
      setLocs(lRes.locations || []);
      setAssets(aRes.assets || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingUser(null);
    const defaultOrg = (!isSuperAdmin && userOrgId) ? userOrgId : (orgs[0]?._id || orgs[0]?.id || '');
    setForm({
      name: '',
      email: '',
      password: '',
      role: 'LOCATION_USER',
      organizationId: defaultOrg,
      projectId: currentUser?.project_id || '',
      locationId: currentUser?.location_id || '',
      assignedAssets: [],
      phone: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    const userOrg = user.org_id || user.organizationId || user.organization?.id || (!isSuperAdmin ? userOrgId : '');
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '', // Leave empty unless changing
      role: user.role || 'USER',
      organizationId: userOrg,
      projectId: user.project_id || user.projectId || user.project?.id || '',
      locationId: user.location_id || user.locationId || user.location?.id || '',
      assignedAssets: Array.isArray(user.assigned_assets || user.assignedAssets) ? (user.assigned_assets || user.assignedAssets) : [],
      phone: user.phone || ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      const targetOrg = (!isSuperAdmin && userOrgId) ? userOrgId : (form.organizationId || null);

      if (editingUser) {
        // Edit existing user
        const userId = editingUser.id || editingUser._id;
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          organizationId: targetOrg,
          org_id: targetOrg,
          projectId: form.projectId || null,
          project_id: form.projectId || null,
          locationId: form.locationId || null,
          location_id: form.locationId || null,
          assignedAssets: form.assignedAssets || [],
          assigned_assets: form.assignedAssets || [],
          phone: form.phone || null
        };
        if (form.password && form.password.trim()) {
          payload.password = form.password.trim();
        }
        await api.users.update(userId, payload);
      } else {
        // Create new user
        if (!form.password) {
          throw new Error('Password is required for new user creation.');
        }
        await api.users.create({
          ...form,
          organizationId: targetOrg,
          org_id: targetOrg,
          projectId: form.projectId || null,
          project_id: form.projectId || null,
          locationId: form.locationId || null,
          location_id: form.locationId || null,
          assigned_assets: form.assignedAssets || []
        });
      }

      setIsModalOpen(false);
      setEditingUser(null);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const userId = deleteTarget.id || deleteTarget._id;
      await api.users.remove(userId);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  // Filter users: only users in current org if not Super Admin
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Organization restriction for non-Super Admin (e.g. ORG_ADMIN)
      if (!isSuperAdmin && userOrgId) {
        const uOrgId = u.org_id || u.organizationId || u.organization?.id;
        if (uOrgId && uOrgId !== userOrgId) return false;
      }

      const matchesSearch =
        (u.name && u.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (u.role && u.role.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter, isSuperAdmin, userOrgId]);

  // Available Organizations in dropdowns
  const availableOrgs = useMemo(() => {
    if (isSuperAdmin || !userOrgId) return orgs;
    const orgMatches = orgs.filter(o => (o._id || o.id) === userOrgId);
    if (orgMatches.length > 0) return orgMatches;
    return [{ id: userOrgId, _id: userOrgId, name: currentOrgName }];
  }, [orgs, isSuperAdmin, userOrgId, currentOrgName]);

  // Dependent dropdowns for form
  const availableProjects = useMemo(() => {
    const targetOrgId = (!isSuperAdmin && userOrgId) ? userOrgId : form.organizationId;
    if (!targetOrgId) return projects;
    return projects.filter(p => (p.org_id || p.organizationId) === targetOrgId);
  }, [projects, form.organizationId, isSuperAdmin, userOrgId]);

  const availableLocations = useMemo(() => {
    const targetOrgId = (!isSuperAdmin && userOrgId) ? userOrgId : form.organizationId;
    if (form.projectId) {
      return locs.filter(l => (l.project_id || l.projectId) === form.projectId);
    }
    if (targetOrgId) {
      return locs.filter(l => (l.org_id || l.organizationId) === targetOrgId);
    }
    return locs;
  }, [locs, form.projectId, form.organizationId, isSuperAdmin, userOrgId]);

  const availableAssets = useMemo(() => {
    const targetOrgId = (!isSuperAdmin && userOrgId) ? userOrgId : form.organizationId;
    if (form.locationId) {
      return assets.filter(a => (a.location_id || a.locationId) === form.locationId);
    }
    if (form.projectId) {
      return assets.filter(a => (a.project_id || a.projectId) === form.projectId);
    }
    if (targetOrgId) {
      return assets.filter(a => (a.org_id || a.organizationId) === targetOrgId);
    }
    return assets;
  }, [assets, form.locationId, form.projectId, form.organizationId, isSuperAdmin, userOrgId]);

  // Role filter buttons
  const filterRoles = useMemo(() => {
    const base = ['ALL'];
    if (isSuperAdmin) base.push('SUPER_ADMIN');
    base.push('ORG_ADMIN', 'PROJECT_USER', 'LOCATION_USER', 'ASSET_USER', 'USER');
    return base;
  }, [isSuperAdmin]);

  const inputCls =
    'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-text outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  if (loading) return <PageListSkeleton cardCount={5} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Users className="w-7 h-7 text-indigo-500" /> User Role & Hierarchy Management
            </h1>
            {!isSuperAdmin && userOrgId && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Building2 className="w-3.5 h-3.5" />
                {currentOrgName}
              </span>
            )}
          </div>
          <p className="text-text-muted text-sm mt-1">
            {!isSuperAdmin
              ? `Manage and assign roles for users belonging to ${currentOrgName}.`
              : 'Configure access levels: Super Admin, Organization Admin, Project User, Site User, and Asset Operators across all organizations.'}
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add New User
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search by name, email or role…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-surface-2 text-xs outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs text-text-dim font-medium whitespace-nowrap">Filter Role:</span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {filterRoles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  roleFilter === r
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-surface-2 text-text-muted hover:bg-surface-3'
                }`}
              >
                {r === 'ALL' ? 'All Roles' : ROLE_INFO[r]?.label || r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users List Grid */}
      <div className="grid gap-3">
        {filteredUsers.map((u) => {
          const roleData = ROLE_INFO[u.role] || ROLE_INFO.USER;
          const orgName =
            u.organization?.name ||
            orgs.find((o) => (o._id || o.id) === (u.org_id || u.organizationId))?.name ||
            (!isSuperAdmin ? currentOrgName : 'Global Access');
          const prjName =
            u.project?.name ||
            projects.find((p) => (p._id || p.id) === (u.project_id || u.projectId))?.name;
          const locName =
            u.location?.name ||
            locs.find((l) => (l._id || l.id) === (u.location_id || u.locationId))?.name;
          const assignedAssetsList = Array.isArray(u.assigned_assets || u.assignedAssets) ? (u.assigned_assets || u.assignedAssets) : [];

          return (
            <div
              key={u.id || u._id}
              className="bg-surface border border-border rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-indigo-500/30 transition shadow-sm"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  {roleData.Icon ? <roleData.Icon className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-text truncate">{u.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleData.badge}`}>
                      {roleData.label}
                    </span>
                    {['PROJECT_USER', 'PROJECT_ADMIN'].includes(u.role) && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                        Can Add & Remove Devices
                      </span>
                    )}
                    {['LOCATION_USER', 'SITE_USER', 'ASSET_USER'].includes(u.role) && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        Add Device Only
                      </span>
                    )}
                  </div>
                  <p className="text-text-dim text-xs mt-0.5 flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" /> {u.email}
                    {u.phone && (
                      <span className="text-text-muted flex items-center gap-1">
                        • <Phone className="w-3 h-3 text-text-dim" /> {u.phone}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Hierarchy Badges */}
              <div className="flex items-center gap-4 text-xs text-text-dim flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-2 border border-border">
                  <Building2 className="w-3.5 h-3.5 text-text-muted shrink-0" />
                  <span className="font-medium text-text truncate max-w-[130px]">{orgName}</span>
                </div>
                {prjName && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-2 border border-border">
                    <FolderGit2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate max-w-[130px]">{prjName}</span>
                  </div>
                )}
                {locName && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-2 border border-border">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate max-w-[130px]">{locName}</span>
                  </div>
                )}
                {assignedAssetsList.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                    <Mountain className="w-3.5 h-3.5 shrink-0" />
                    <span>{assignedAssetsList.length} Barrier{assignedAssetsList.length === 1 ? '' : 's'}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(u)}
                  className="p-2 rounded-xl border border-border bg-surface-2 hover:bg-indigo-500/10 hover:border-indigo-500/30 text-text-muted hover:text-indigo-400 transition"
                  title="Edit User"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(u)}
                  className="p-2 rounded-xl border border-border bg-surface-2 hover:bg-rose-500/10 hover:border-rose-500/30 text-text-muted hover:text-rose-400 transition"
                  title="Delete User"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredUsers.length === 0 && (
          <div className="text-center py-16 bg-surface border border-border rounded-2xl">
            <Users className="w-10 h-10 text-text-dim mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-text-muted">No users found</p>
            <p className="text-xs text-text-dim mt-1">
              {!isSuperAdmin
                ? `No users found for organization "${currentOrgName}".`
                : 'Try changing your search query or role filter.'}
            </p>
          </div>
        )}
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
          <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  {editingUser ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-base font-bold">{editingUser ? 'Edit User Profile & Role' : 'Create User & Assign Role'}</h2>
                  <p className="text-xs text-text-dim">
                    {editingUser ? `Managing access permissions for ${editingUser.name}` : 'Assign hierarchical access scope across organization, projects and sites'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-text-dim hover:bg-surface-2 hover:text-text transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="e.g. rajesh@rockfall.com"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    {editingUser ? 'Password (blank to keep existing)' : 'Account Password'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? '••••••••' : 'Enter account password'}
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    required={!editingUser}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Contact Phone</label>
                  <input
                    type="text"
                    placeholder="+91..."
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                {/* Role Selector with Full Permissions Description */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-text-muted mb-1">Assigned Access Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                    className={inputCls}
                  >
                    {isSuperAdmin && (
                      <option value="SUPER_ADMIN">SUPER_ADMIN — Global Administrator (All Orgs & Projects)</option>
                    )}
                    <option value="ORG_ADMIN">ORG_ADMIN — Organization Admin (All Projects & Sites in Org)</option>
                    <option value="PROJECT_USER">PROJECT_USER — Project Manager (Add & Remove Devices in Project)</option>
                    <option value="LOCATION_USER">LOCATION_USER — Site / Location User (Add Device Only)</option>
                    <option value="ASSET_USER">ASSET_USER — Barrier Asset Operator (Add Device Only)</option>
                    <option value="USER">USER — Read-Only Viewer</option>
                  </select>
                  <p className="mt-1 text-[11px] text-text-dim">
                    {ROLE_INFO[form.role]?.desc}
                  </p>
                </div>

                {/* Hierarchy Scope Assignment */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Organization Scope</label>
                  <select
                    value={form.organizationId}
                    disabled={!isSuperAdmin}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, organizationId: e.target.value, projectId: '', locationId: '' }))
                    }
                    className={`${inputCls} ${!isSuperAdmin ? 'opacity-70 cursor-not-allowed bg-surface-3' : ''}`}
                  >
                    {isSuperAdmin && <option value="">Global / Unassigned</option>}
                    {availableOrgs.map((o) => (
                      <option key={o._id || o.id} value={o._id || o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {!isSuperAdmin && (
                    <p className="mt-0.5 text-[10px] text-text-dim">Locked to your organization</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Project Scope</label>
                  <select
                    value={form.projectId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, projectId: e.target.value, locationId: '' }))
                    }
                    className={inputCls}
                  >
                    <option value="">All / No Specific Project</option>
                    {availableProjects.map((p) => (
                      <option key={p._id || p.id} value={p._id || p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Site / Location Scope</label>
                  <select
                    value={form.locationId}
                    onChange={(e) => setForm((p) => ({ ...p, locationId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">All / No Specific Site</option>
                    {availableLocations.map((l) => (
                      <option key={l._id || l.id} value={l._id || l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Specific Barrier Asset Assignment if ASSET_USER */}
                {form.role === 'ASSET_USER' && (
                  <div className="sm:col-span-2 p-3 rounded-2xl border border-border bg-surface/50 space-y-2">
                    <label className="block text-xs font-semibold text-text-muted">
                      Assigned Barrier Asset(s)
                    </label>
                    <div className="max-h-32 overflow-y-auto space-y-1.5">
                      {availableAssets.map(a => {
                        const aId = a._id || a.id;
                        const isSelected = form.assignedAssets.includes(aId);
                        return (
                          <label key={aId} className="flex items-center gap-2 p-2 rounded-xl border border-border/60 bg-surface-2 text-xs cursor-pointer hover:border-indigo-500/40">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setForm(p => ({
                                  ...p,
                                  assignedAssets: isSelected
                                    ? p.assignedAssets.filter(id => id !== aId)
                                    : [...p.assignedAssets, aId]
                                }));
                              }}
                              className="accent-indigo-500"
                            />
                            <span className="font-semibold text-text">{a.name || aId}</span>
                            <span className="text-[10px] text-text-dim">({a.asset_type || 'FENCE_BARRIER'})</span>
                          </label>
                        );
                      })}
                      {availableAssets.length === 0 && (
                        <p className="text-xs text-text-dim">No barrier assets found for this site/project.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-surface-2 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {saving ? 'Saving…' : editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">Confirm Delete User</h3>
                <p className="text-xs text-text-dim">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Are you sure you want to permanently delete the user account{' '}
              <strong className="text-text font-bold">{deleteTarget.name}</strong> (
              <span className="font-mono text-text-dim">{deleteTarget.email}</span>)? They will immediately lose platform access.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
