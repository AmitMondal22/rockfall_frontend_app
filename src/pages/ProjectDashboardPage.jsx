import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  FolderGit2,
  Building2,
  MapPin,
  Package,
  Cpu,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Activity,
  Layers,
  Calendar,
  AlertTriangle,
  Plus,
  Radio,
  ExternalLink
} from 'lucide-react';
import { PageListSkeleton } from '../components/Skeleton';
import { useTheme } from '../hooks/useTheme';

export default function ProjectDashboardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const loadProject = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.projects.getById(id);
      setProject(data.project);
    } catch (err) {
      setError(err.message || 'Failed to load project.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  if (loading) return <PageListSkeleton cardCount={3} />;

  if (error || !project) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/projects')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-text-muted hover:text-text transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </button>
        <div className="p-8 text-center bg-surface border border-border rounded-2xl">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
          <p className="font-bold text-sm">{error || 'Project not found'}</p>
        </div>
      </div>
    );
  }

  const locations = project.locations || [];
  const assets = project.assets || [];
  const devices = project.devices || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-text-dim flex-wrap">
        <span className="hover:underline cursor-pointer" onClick={() => navigate('/organizations')}>
          Organizations
        </span>
        <ChevronRight className="w-3 h-3" />
        <span className="hover:underline cursor-pointer" onClick={() => navigate('/projects')}>
          Projects
        </span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-indigo-400 font-semibold">{project.name}</span>
      </div>

      {/* Project Overview Header */}
      <div className="bg-surface border border-border rounded-3xl p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold text-xl shrink-0">
              <FolderGit2 className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-extrabold">{project.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {project.status || 'ACTIVE'}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-text-dim" />
                <span>{project.organization?.name || 'Organization'}</span>
                {project.client_name && (
                  <>
                    <span>•</span>
                    <span>Client: {project.client_name}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => navigate('/locations')}
              className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-semibold hover:bg-surface-3 transition flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4 text-indigo-400" /> View Sites
            </button>
            <button
              onClick={() => navigate('/assets')}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-sm flex items-center gap-1.5"
            >
              <Package className="w-4 h-4" /> Manage Barriers
            </button>
          </div>
        </div>

        {project.description && (
          <p className="text-xs text-text-muted mt-4 leading-relaxed max-w-4xl">
            {project.description}
          </p>
        )}

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Site Locations</span>
              <MapPin className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold mt-2">{locations.length}</p>
            <p className="text-[10px] text-text-dim mt-0.5">Geographical sectors</p>
          </div>

          <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Barrier Assets</span>
              <Package className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold mt-2">{assets.length}</p>
            <p className="text-[10px] text-text-dim mt-0.5">Catch fences & nets</p>
          </div>

          <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Sensors Mounted</span>
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold mt-2">{devices.length}</p>
            <p className="text-[10px] text-text-dim mt-0.5">Active vibration nodes</p>
          </div>

          <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">System State</span>
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold mt-2 text-emerald-400">Nominal</p>
            <p className="text-[10px] text-text-dim mt-0.5">Real-time telemetry live</p>
          </div>
        </div>
      </div>

      {/* Hierarchical Tree Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sites / Locations List */}
        <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-400" />
                Sites & Locations ({locations.length})
              </h2>
              <p className="text-xs text-text-dim mt-0.5">Physical monitoring sectors under this project</p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {locations.map((loc) => (
              <div
                key={loc.id || loc._id}
                onClick={() => navigate(`/locations/${loc.id || loc._id}`)}
                className="p-3.5 rounded-2xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-indigo-500/40 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-xs">{loc.name}</h3>
                  <p className="text-[11px] text-text-dim mt-0.5">
                    Lat: {loc.lat ? loc.lat.toFixed(4) : '18.272'}, Lng: {loc.lng ? loc.lng.toFixed(4) : '83.078'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-text-muted font-medium">{loc.assets?.length || 0} barriers</span>
                  <ChevronRight className="w-4 h-4 text-text-dim" />
                </div>
              </div>
            ))}

            {locations.length === 0 && (
              <p className="text-center py-8 text-xs text-text-dim">No locations attached to this project.</p>
            )}
          </div>
        </div>

        {/* Barrier Assets & Deployed Sensors */}
        <div className="bg-surface border border-border rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-bold flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                Barrier Assets & Installed Sensors ({assets.length})
              </h2>
              <p className="text-xs text-text-dim mt-0.5">Structural barriers with attached telemetry nodes</p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto">
            {assets.map((ast) => (
              <div
                key={ast.id || ast._id}
                onClick={() => navigate(`/assets`)}
                className="p-3.5 rounded-2xl border border-border bg-surface-2 hover:bg-surface-3 hover:border-amber-500/40 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-xs">{ast.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {ast.asset_type || 'FENCE_BARRIER'}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-dim mt-0.5">Status: {ast.status || 'OPERATIONAL'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-bold font-mono text-emerald-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> {ast.devices?.length || 0} sensors
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-dim" />
                </div>
              </div>
            ))}

            {assets.length === 0 && (
              <p className="text-center py-8 text-xs text-text-dim">No barrier assets created under this project.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
