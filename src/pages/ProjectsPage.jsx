import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  FolderGit2,
  Plus,
  Building2,
  MapPin,
  Package,
  Cpu,
  Search,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  X,
  Edit2,
  Trash2
} from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('ALL');

  // Add / Edit Project Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form, setForm] = useState({
    name: '',
    org_id: '',
    description: '',
    status: 'ACTIVE',
    client_name: '',
    start_date: '',
    end_date: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, orgRes] = await Promise.all([
        api.projects.getAll(),
        api.organizations.getAll()
      ]);
      setProjects(projRes.projects || []);
      setOrgs(orgRes.organizations || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = () => {
    setEditingProject(null);
    setForm({
      name: '',
      org_id: orgs[0]?._id || orgs[0]?.id || '',
      description: '',
      status: 'ACTIVE',
      client_name: '',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: ''
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (e, project) => {
    e.stopPropagation();
    setEditingProject(project);
    setForm({
      name: project.name || '',
      org_id: project.org_id || project.organizationId || '',
      description: project.description || '',
      status: project.status || 'ACTIVE',
      client_name: project.client_name || '',
      start_date: project.start_date ? new Date(project.start_date).toISOString().slice(0, 10) : '',
      end_date: project.end_date ? new Date(project.end_date).toISOString().slice(0, 10) : ''
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleSaveProject = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      if (editingProject) {
        await api.projects.update(editingProject.id || editingProject._id, form);
      } else {
        await api.projects.create(form);
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.projects.remove(deleteTarget.id || deleteTarget._id);
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete project.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.client_name && p.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesOrg = selectedOrg === 'ALL' || (p.org_id || p.organizationId) === selectedOrg;
    return matchesSearch && matchesOrg;
  });

  const inputCls =
    'w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-text outline-none transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

  if (loading) return <PageListSkeleton cardCount={4} />;

  return (
    <div className="space-y-6">
      {/* Header & Hierarchy Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-text-dim mb-1">
            <span className="hover:underline cursor-pointer" onClick={() => navigate('/organizations')}>
              Organizations
            </span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-indigo-400 font-semibold">Projects</span>
          </div>
          <h1 className="text-2xl font-extrabold flex items-center gap-3">
            <FolderGit2 className="w-7 h-7 text-indigo-500" /> Geotechnical Projects
          </h1>
          <p className="text-text-muted text-sm mt-0.5">
            Hierarchical Project management across organizations, containing site locations, barriers & sensor clusters.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add New Project
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            placeholder="Search projects, clients or sites…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-surface-2 text-xs outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-text-dim font-medium whitespace-nowrap">Organization:</span>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Organizations</option>
            {orgs.map((o) => (
              <option key={o._id || o.id} value={o._id || o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProjects.map((p) => {
          const orgName = p.organization?.name || orgs.find((o) => (o._id || o.id) === (p.org_id || p.organizationId))?.name || 'Organization';
          const locCount = p.locationsCount ?? p.locations?.length ?? 0;
          const assetCount = p.assetsCount ?? p.assets?.length ?? 0;
          const devCount = p.devicesCount ?? p.devices?.length ?? 0;

          return (
            <div
              key={p.id || p._id}
              onClick={() => navigate(`/projects/${p.id || p._id}`)}
              className="group bg-surface border border-border rounded-2xl p-5 hover:border-indigo-500/50 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold">
                    <FolderGit2 className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {p.status || 'ACTIVE'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleOpenEdit(e, p)}
                      className="p-1.5 rounded-lg hover:bg-surface-2 text-text-dim hover:text-text transition"
                      title="Edit Project"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(p);
                      }}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-dim hover:text-rose-400 transition"
                      title="Archive Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-base group-hover:text-indigo-400 transition-colors">
                  {p.name}
                </h3>
                <p className="text-xs text-text-muted mt-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-text-dim" /> {orgName}
                </p>
                {p.description && (
                  <p className="text-xs text-text-dim mt-2 line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                )}
              </div>

              {/* Hierarchy Stat Badges */}
              <div className="mt-5 pt-4 border-t border-border space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-surface-2 p-2 rounded-xl border border-border/50">
                    <span className="block text-[10px] text-text-dim uppercase font-semibold">Sites</span>
                    <span className="font-bold text-sm text-text flex items-center justify-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-indigo-400" /> {locCount}
                    </span>
                  </div>
                  <div className="bg-surface-2 p-2 rounded-xl border border-border/50">
                    <span className="block text-[10px] text-text-dim uppercase font-semibold">Barriers</span>
                    <span className="font-bold text-sm text-text flex items-center justify-center gap-1 mt-0.5">
                      <Package className="w-3 h-3 text-amber-400" /> {assetCount}
                    </span>
                  </div>
                  <div className="bg-surface-2 p-2 rounded-xl border border-border/50">
                    <span className="block text-[10px] text-text-dim uppercase font-semibold">Sensors</span>
                    <span className="font-bold text-sm text-text flex items-center justify-center gap-1 mt-0.5">
                      <Cpu className="w-3 h-3 text-emerald-400" /> {devCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-indigo-400 font-semibold pt-1">
                  <span>Explore Project Hierarchy</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="col-span-full text-center py-16 bg-surface border border-border rounded-2xl">
            <FolderGit2 className="w-10 h-10 text-text-dim mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-text-muted">No projects found</p>
            <p className="text-xs text-text-dim mt-1">Add a project to group locations, barriers, and sensors.</p>
          </div>
        )}
      </div>

      {/* CREATE / EDIT PROJECT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <FolderGit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">
                    {editingProject ? 'Edit Geotechnical Project' : 'Add New Project'}
                  </h2>
                  <p className="text-xs text-text-dim">
                    Configure project boundaries under an organization
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

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-danger text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Project Name</label>
                <input
                  type="text"
                  placeholder="e.g. Kuppavalasa Slope Stabilization Project"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  required
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Parent Organization</label>
                  <select
                    value={form.org_id}
                    onChange={(e) => setForm((p) => ({ ...p, org_id: e.target.value }))}
                    className={inputCls}
                  >
                    {orgs.map((o) => (
                      <option key={o._id || o.id} value={o._id || o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">Client / Division</label>
                  <input
                    type="text"
                    placeholder="e.g. Railway Division"
                    value={form.client_name}
                    onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">Description & Scope</label>
                <textarea
                  rows={3}
                  placeholder="Description of the geotechnical mitigation project..."
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className={inputCls}
                />
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
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingProject ? 'Update Project' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">Archive Project</h3>
                <p className="text-xs text-text-dim">Confirm project archive</p>
              </div>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Are you sure you want to archive project <strong className="text-text">{deleteTarget.name}</strong>?
              Its associated locations, barrier assets, and sensors will remain safe.
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
                onClick={handleDeleteProject}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 transition shadow-sm disabled:opacity-50"
              >
                {deleting ? 'Archiving…' : 'Yes, Archive Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
