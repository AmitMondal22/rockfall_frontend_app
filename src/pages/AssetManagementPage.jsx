import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Cpu,
  Edit3,
  Eye,
  Filter,
  Layers,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  MapPin,
  Mountain,
  Package,
  Plus,
  Radio,
  RefreshCw,
  Route,
  Ruler,
  Search,
  ShieldCheck,
  Signal,
  Trash2,
  X,
  Zap
} from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { BARRIER_STYLES } from './AddBarrierAssetPage';

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

const finiteNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const segmentDistance = (a, b) => {
  const toRadians = (deg) => deg * Math.PI / 180;
  const lat1 = toRadians(a.lat || a.latitude);
  const lat2 = toRadians(b.lat || b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians((b.lng || b.longitude) - (a.lng || a.longitude));
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const pointAlongPath = (points, positionPct) => {
  if (!points || !points.length) return null;
  if (points.length === 1) return { lat: Number(points[0].lat || points[0].latitude), lng: Number(points[0].lng || points[0].longitude) };
  const pct = Math.max(0, Math.min(100, finiteNumber(positionPct) ?? 0));
  const lengths = points.slice(1).map((point, index) => segmentDistance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return { lat: Number(points[0].lat || points[0].latitude), lng: Number(points[0].lng || points[0].longitude) };
  const target = total * pct / 100;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const next = traversed + lengths[index];
    if (target <= next || index === lengths.length - 1) {
      const ratio = lengths[index] === 0 ? 0 : (target - traversed) / lengths[index];
      const p1 = points[index];
      const p2 = points[index + 1];
      const lat1 = Number(p1.lat || p1.latitude);
      const lng1 = Number(p1.lng || p1.longitude);
      const lat2 = Number(p2.lat || p2.latitude);
      const lng2 = Number(p2.lng || p2.longitude);
      return {
        lat: Number((lat1 + (lat2 - lat1) * ratio).toFixed(6)),
        lng: Number((lng1 + (lng2 - lng1) * ratio).toFixed(6)),
      };
    }
    traversed = next;
  }
  const last = points.at(-1);
  return { lat: Number(last.lat || last.latitude), lng: Number(last.lng || last.longitude) };
};

const projectPointOnSegment = (p1, p2, click) => {
  const lat1 = Number(p1.lat || p1.latitude);
  const lng1 = Number(p1.lng || p1.longitude);
  const lat2 = Number(p2.lat || p2.latitude);
  const lng2 = Number(p2.lng || p2.longitude);
  const dx = lng2 - lng1;
  const dy = lat2 - lat1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: { lat: lat1, lng: lng1 }, t: 0 };
  const t = Math.max(0, Math.min(1, ((click.lng - lng1) * dx + (click.lat - lat1) * dy) / lenSq));
  return {
    point: {
      lat: Number((lat1 + t * dy).toFixed(6)),
      lng: Number((lng1 + t * dx).toFixed(6))
    },
    t
  };
};

const findPositionFromClick = (points, clickLat, clickLng) => {
  if (!points || !points.length) return { pct: 50, lat: clickLat, lng: clickLng };
  if (points.length === 1) return { pct: 0, lat: Number(points[0].lat || points[0].latitude), lng: Number(points[0].lng || points[0].longitude) };

  const lengths = points.slice(1).map((p, i) => segmentDistance(points[i], p));
  const totalLen = lengths.reduce((sum, l) => sum + l, 0);

  let bestDist = Infinity;
  let bestPct = 0;
  let bestPoint = points[0];

  let traversed = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segLen = lengths[i];
    const { point, t } = projectPointOnSegment(p1, p2, { lat: clickLat, lng: clickLng });
    const d = segmentDistance({ lat: clickLat, lng: clickLng }, point);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = point;
      const distToPt = traversed + t * segLen;
      bestPct = totalLen === 0 ? 0 : Math.round((distToPt / totalLen) * 100);
    }
    traversed += segLen;
  }

  return { pct: Math.max(0, Math.min(100, bestPct)), lat: bestPoint.lat, lng: bestPoint.lng };
};

function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function FitMapBounds({ points, maxZoom = 17 }) {
  const map = useMap();
  useEffect(() => {
    if (!points || !points.length) return;
    const pts = points.map(p => [Number(p.lat || p.latitude), Number(p.lng || p.longitude)]);
    if (pts.length === 1) {
      map.setView(pts[0], Math.min(maxZoom, 15));
      return;
    }
    map.fitBounds(pts, { padding: [36, 36], maxZoom });
  }, [map, maxZoom, points]);
  return null;
}

const formatNumber = (value, suffix = '') => {
  const number = finiteNumber(value);
  return number === null ? '—' : `${NUMBER_FORMAT.format(number)}${suffix}`;
};

const statusTone = (status) => {
  if (status === 'ONLINE' || status === 'ACTIVE' || status === 'OPERATIONAL') return 'border-emerald-500/30 bg-emerald-500/10 text-success';
  if (status === 'ALERT' || status === 'TAMPERED') return 'border-rose-500/30 bg-rose-500/10 text-danger';
  return 'border-amber-500/30 bg-amber-500/10 text-warning';
};

const assetIdOf = (asset) => String(asset?._id ?? asset?.id ?? asset?.assetId ?? '');

export default function AssetManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isSuperAdmin, isAdmin, isOrgAdmin, isProjectUser, canRemoveDevice, canAddDevice } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [assets, setAssets] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [registeredDevices, setRegisteredDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Attach Device Modal State
  const [attachAsset, setAttachAsset] = useState(null);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [attachDeviceId, setAttachDeviceId] = useState('');
  const [attachPositionPct, setAttachPositionPct] = useState(50);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const orgParam = isSuperAdmin ? undefined : (user?.organizationId || user?.org_id);
      const [assetRes, orgRes, locRes, devRes] = await Promise.allSettled([
        api.assets.getAll(isSuperAdmin ? undefined : orgParam),
        api.organizations.getAll(),
        api.locations.getAll(isSuperAdmin ? undefined : orgParam),
        api.devices.getAll(isSuperAdmin ? undefined : orgParam)
      ]);

      if (assetRes.status === 'fulfilled') {
        const rawAssets = assetRes.value?.assets || assetRes.value?.data || assetRes.value || [];
        setAssets(Array.isArray(rawAssets) ? rawAssets : []);
      } else {
        console.error('Failed to load assets:', assetRes.reason);
        throw assetRes.reason;
      }

      if (orgRes.status === 'fulfilled') {
        const rawOrgs = Array.isArray(orgRes.value?.organizations)
          ? orgRes.value.organizations
          : (orgRes.value?.organization ? [orgRes.value.organization] : []);
        setOrganizations(rawOrgs);
      }

      if (locRes.status === 'fulfilled') {
        setLocations(Array.isArray(locRes.value?.locations) ? locRes.value.locations : []);
      }

      if (devRes.status === 'fulfilled') {
        setRegisteredDevices(Array.isArray(devRes.value?.devices) ? devRes.value.devices : []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load barrier assets.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSuperAdmin, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle flash messages
  useEffect(() => {
    if (location.state?.createdAssetId) {
      setNotice(`Barrier asset "${location.state.createdAssetId}" was successfully saved.`);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Location index for fast lookup
  const locationIndex = useMemo(() => {
    return new Map(locations.map(l => [String(l.id || l._id), l.name || l.id]));
  }, [locations]);

  // Filtered Assets Pipeline
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const id = assetIdOf(asset).toLowerCase();
      const name = String(asset.name || '').toLowerCase();
      const desc = String(asset.description || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      // Text search
      if (q && !id.includes(q) && !name.includes(q) && !desc.includes(q)) {
        return false;
      }

      // Organization filter
      const assetOrg = String(asset.org_id || asset.organizationId || '');
      if (selectedOrg && assetOrg !== selectedOrg) {
        return false;
      }

      // Location filter
      const assetLoc = String(asset.location_id || asset.locationId || '');
      if (selectedLocation && assetLoc !== selectedLocation) {
        return false;
      }

      // Barrier Type filter
      const bType = asset.asset_type || asset.specifications?.barrierType || 'FENCE_BARRIER';
      if (selectedType && bType !== selectedType) {
        return false;
      }

      // Status filter
      const status = asset.status || 'OPERATIONAL';
      if (selectedStatus && status !== selectedStatus) {
        return false;
      }

      return true;
    });
  }, [assets, searchQuery, selectedOrg, selectedLocation, selectedType, selectedStatus]);

  const hasActiveFilters = Boolean(searchQuery || selectedOrg || selectedLocation || selectedType || selectedStatus);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedOrg('');
    setSelectedLocation('');
    setSelectedType('');
    setSelectedStatus('');
  };

  // Attach Device Modal Handlers
  const handleOpenAttach = (asset) => {
    setAttachAsset(asset);
    setAttachError('');
    setAttachDeviceId('');
    setAttachPositionPct(50);
    const attachedIds = new Set((asset.devices || []).map(d => String(d._id || d.id || d.deviceId)));
    const eligible = registeredDevices.filter(d => !attachedIds.has(String(d._id || d.id)));
    setAvailableDevices(eligible);
  };

  const currentMountPoints = useMemo(() => {
    if (!attachAsset?.coordinates || !attachAsset.coordinates.length) return { lat: 0, lng: 0 };
    return pointAlongPath(attachAsset.coordinates, attachPositionPct) || { lat: 0, lng: 0 };
  }, [attachAsset, attachPositionPct]);

  const handleMapPick = (clickLat, clickLng) => {
    if (!attachAsset?.coordinates) return;
    const { pct } = findPositionFromClick(attachAsset.coordinates, clickLat, clickLng);
    setAttachPositionPct(pct);
  };

  const handleCoordinateChange = (latVal, lngVal) => {
    if (!attachAsset?.coordinates) return;
    const l = parseFloat(latVal);
    const g = parseFloat(lngVal);
    if (!Number.isNaN(l) && !Number.isNaN(g)) {
      const { pct } = findPositionFromClick(attachAsset.coordinates, l, g);
      setAttachPositionPct(pct);
    }
  };

  const handleAttachSubmit = async (e) => {
    e.preventDefault();
    if (!attachDeviceId || !attachAsset) return;
    setAttaching(true);
    setAttachError('');
    try {
      const assetId = assetIdOf(attachAsset);
      await api.assets.attachDevice(assetId, attachDeviceId, attachPositionPct, {
        lat: currentMountPoints.lat,
        lng: currentMountPoints.lng
      });
      setAttachAsset(null);
      loadData({ quiet: true });
    } catch (err) {
      setAttachError(err.message || 'Failed to mount sensor node.');
    } finally {
      setAttaching(false);
    }
  };

  const handleDeleteAsset = async (asset) => {
    const id = assetIdOf(asset);
    if (!window.confirm(`Are you sure you want to delete physical barrier "${asset.name || id}"? This cannot be undone.`)) return;
    try {
      await api.assets.delete(id);
      loadData({ quiet: true });
    } catch (err) {
      alert(err.message || 'Failed to delete asset.');
    }
  };

  return (
    <div className="space-y-6 text-text">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-info">
            <Mountain className="h-4 w-4" /> Physical Rockfall Protection
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl text-text">
            Barrier Assets & Telemetry Analysis
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">
            Manage deployed flexible catch fences, drapery nets, and rock sheds with mounted vibration & load telemetry nodes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => { setRefreshing(true); loadData({ quiet: true }); }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-text hover:bg-surface-2 transition disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => navigate('/assets/new')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition"
            >
              <Plus className="h-4 w-4" /> Deploy Barrier Asset
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-success">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</span>
          <button type="button" onClick={() => setNotice('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Asset inventory could not be loaded.</strong><p className="mt-0.5 text-xs opacity-80">{error}</p></div>
        </div>
      )}

      {/* KPI Stats Bar */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Barriers</span>
            <Package className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-text">{assets.length}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">Deployed physical catch fences</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Mounted Sensors</span>
            <Cpu className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-text">
            {assets.reduce((sum, a) => sum + (a.devices?.length || 0), 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">Active monitoring nodes attached</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Operational Status</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-success">
            {assets.filter(a => (a.status || 'OPERATIONAL') !== 'ALERT').length} Active
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">Stable barrier structures</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Filtered Results</span>
            <Filter className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-text">{filteredAssets.length}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">Matching selected filters</p>
        </div>
      </div>

      {/* Search & Multi-Filters Toolbar */}
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-sm">Filter & Search Barrier Assets</h2>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'grid' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
              title="Grid Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition ${viewMode === 'table' ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
              title="Table List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-text-dim" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, ID, notes…"
              className="w-full rounded-xl border border-border bg-surface-2 pl-9 pr-8 py-2.5 text-xs text-text outline-none focus:border-indigo-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-text-dim hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Organization Filter */}
          <div>
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              disabled={!isAdmin && organizations.length <= 1}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500 transition"
            >
              <option value="">All Organizations</option>
              {organizations.map((org) => (
                <option key={org._id || org.id} value={org._id || org.id}>
                  {org.name || org._id}
                </option>
              ))}
            </select>
          </div>

          {/* Site Location Filter */}
          <div>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500 transition"
            >
              <option value="">All Locations (Sites)</option>
              {locations.map((loc) => (
                <option key={loc._id || loc.id} value={loc._id || loc.id}>
                  {loc.name || loc._id}
                </option>
              ))}
            </select>
          </div>

          {/* Barrier Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500 transition"
            >
              <option value="">All Barrier Types</option>
              <option value="FENCE_BARRIER">🛡️ Flexible Catch Fence</option>
              <option value="DRAPERY_NET">🕸️ Drapery Mesh / Net</option>
              <option value="ROCK_SHED">🏛️ Protective Rock Shed</option>
              <option value="ATTENUATOR">⚡ Attenuator System</option>
              <option value="EMBANKMENT">🧱 Reinforced Embankment</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500 transition"
            >
              <option value="">All Statuses</option>
              <option value="OPERATIONAL">Operational</option>
              <option value="ACTIVE">Active</option>
              <option value="ALERT">Alert / Critical</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2 rounded-xl border border-border bg-surface-2 text-xs font-semibold text-text-muted hover:text-danger hover:border-danger/30 transition flex items-center gap-1"
                title="Reset all filters"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Assets Content */}
      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center gap-3 rounded-3xl border border-border bg-surface text-sm text-text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin text-info" /> Loading physical barrier assets…
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface p-12 text-center shadow-sm">
          <Package className="mx-auto h-12 w-12 text-text-dim" />
          <h3 className="mt-4 text-base font-semibold">No barrier assets found</h3>
          <p className="mt-1 text-xs text-text-muted">
            {hasActiveFilters
              ? 'No physical barriers matched your selected filter criteria. Try adjusting or resetting filters.'
              : 'No barrier assets are currently registered in this organization.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 px-4 py-2 rounded-xl bg-surface-2 border border-border text-xs font-semibold hover:bg-surface-3 transition"
            >
              Clear Filters
            </button>
          ) : isOrgAdmin ? (
            <button
              type="button"
              onClick={() => navigate('/assets/new')}
              className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition"
            >
              + Deploy First Barrier Asset
            </button>
          ) : null}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Card View */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAssets.map((asset) => {
            const id = assetIdOf(asset);
            const specs = asset.specifications || {};
            const bType = asset.asset_type || specs.barrierType || 'FENCE_BARRIER';
            const style = BARRIER_STYLES[bType] || BARRIER_STYLES.FENCE_BARRIER;
            const locName = locationIndex.get(String(asset.location_id || asset.locationId)) || asset.location_id || 'Site Location';
            const devicesCount = (asset.devices || []).length;
            const pointsCount = (asset.coordinates || []).length;

            return (
              <article
                key={id}
                className="rounded-3xl border border-border bg-surface p-5 shadow-sm transition hover:border-indigo-500/40 hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <span>{style.icon}</span>
                      <span>{style.name}</span>
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${statusTone(asset.status)}`}>
                      {asset.status || 'OPERATIONAL'}
                    </span>
                  </div>

                  {/* Title & ID */}
                  <h3 className="mt-3.5 text-base font-bold text-text truncate">{asset.name}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    <span className="font-mono text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                      {id}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 text-info shrink-0" />
                      {locName}
                    </span>
                  </div>

                  <p className="mt-2.5 text-xs text-text-muted line-clamp-2 min-h-[32px]">
                    {asset.description || 'Flexible rockfall barrier installed for slope protection.'}
                  </p>

                  {/* Specs Mini-Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-border bg-surface-2 p-2.5">
                      <span className="block text-[10px] text-text-muted font-medium">Rated Energy</span>
                      <strong className="font-mono text-text font-bold">{formatNumber(specs.capacityKj, ' kJ')}</strong>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 p-2.5">
                      <span className="block text-[10px] text-text-muted font-medium">Span Length</span>
                      <strong className="font-mono text-text font-bold">{formatNumber(specs.lengthM, ' m')}</strong>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 p-2.5">
                      <span className="block text-[10px] text-text-muted font-medium">Height</span>
                      <strong className="font-mono text-text font-bold">{formatNumber(specs.heightM, ' m')}</strong>
                    </div>
                    <div className="rounded-xl border border-border bg-surface-2 p-2.5">
                      <span className="block text-[10px] text-text-muted font-medium">Mounted Sensors</span>
                      <strong className="text-indigo-400 font-bold flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> {devicesCount} Nodes
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/assets/${encodeURIComponent(id)}`)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </button>

                  {isOrgAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate(`/assets/${encodeURIComponent(id)}/edit`)}
                        className="p-2 rounded-xl border border-border bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3 transition"
                        title="Edit Geometry & Specs"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAttach(asset)}
                        className="p-2 rounded-xl border border-border bg-surface-2 text-indigo-400 hover:bg-indigo-500/10 transition"
                        title="Mount Sensor Node"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAsset(asset)}
                        className="p-2 rounded-xl border border-rose-500/20 text-text-dim hover:text-danger hover:bg-rose-500/10 transition"
                        title="Delete Barrier Asset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-3xl border border-border bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 border-b border-border text-xs text-text-muted">
                <tr>
                  <th className="px-5 py-3.5 text-left font-medium">Barrier Asset</th>
                  <th className="px-4 py-3.5 text-left font-medium">Type</th>
                  <th className="px-4 py-3.5 text-left font-medium">Site Location</th>
                  <th className="px-4 py-3.5 text-left font-medium">Rated Capacity</th>
                  <th className="px-4 py-3.5 text-left font-medium">Span Length</th>
                  <th className="px-4 py-3.5 text-left font-medium">Sensors</th>
                  <th className="px-4 py-3.5 text-left font-medium">Status</th>
                  <th className="px-5 py-3.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((asset) => {
                  const id = assetIdOf(asset);
                  const specs = asset.specifications || {};
                  const bType = asset.asset_type || specs.barrierType || 'FENCE_BARRIER';
                  const style = BARRIER_STYLES[bType] || BARRIER_STYLES.FENCE_BARRIER;
                  const locName = locationIndex.get(String(asset.location_id || asset.locationId)) || asset.location_id || '—';
                  const devicesCount = (asset.devices || []).length;

                  return (
                    <tr key={id} className="border-b border-border/30 hover:bg-surface-2 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-text">{asset.name}</div>
                        <div className="font-mono text-xs text-indigo-400">{id}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <span>{style.icon}</span>
                          <span>{style.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-text-muted">{locName}</td>
                      <td className="px-4 py-3.5 font-mono text-xs font-bold">{formatNumber(specs.capacityKj, ' kJ')}</td>
                      <td className="px-4 py-3.5 font-mono text-xs">{formatNumber(specs.lengthM, ' m')}</td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-bold text-indigo-400">
                          {devicesCount} Nodes
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusTone(asset.status)}`}>
                          {asset.status || 'OPERATIONAL'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/assets/${encodeURIComponent(id)}`)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition"
                          >
                            View
                          </button>
                          {isOrgAdmin && (
                            <button
                              type="button"
                              onClick={() => navigate(`/assets/${encodeURIComponent(id)}/edit`)}
                              className="p-1.5 rounded-lg border border-border bg-surface-2 text-text-muted hover:text-text"
                              title="Edit Geometry"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Attach Device Modal */}
      {attachAsset && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border bg-surface p-5 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-text">Mount Sensor to {attachAsset.name}</h3>
                <p className="mt-0.5 text-xs text-text-muted">Select an unattached device and its percentage position along the barrier.</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachAsset(null)}
                className="rounded-xl border border-border p-1.5 text-text-muted hover:bg-surface-2 hover:text-text transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {attachError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-danger">
                  {attachError}
                </div>
              )}

              {!availableDevices.length && !attachError ? (
                <div className="rounded-2xl border border-border bg-surface-2 p-6 text-center text-xs text-text-muted">
                  No unattached registered devices are currently available for this organization.
                </div>
              ) : (
                <form id="quick-mount-form" onSubmit={handleAttachSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="quick-attach-dev" className="mb-1.5 block text-xs font-medium text-text-muted">Choose Hardware Device</label>
                    <select
                      id="quick-attach-dev"
                      required
                      value={attachDeviceId}
                      onChange={(e) => setAttachDeviceId(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500"
                    >
                      <option value="">Select registered sensor</option>
                      {availableDevices.map((d) => (
                        <option key={d._id || d.id} value={d._id || d.id}>
                          {d.name || d._id || d.id} ({d._id || d.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Position Percentage & Coordinates Controls */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <label htmlFor="quick-attach-pos" className="font-semibold text-text">
                        Placement Position on Barrier: <span className="font-mono text-indigo-400 font-bold">{attachPositionPct}%</span>
                      </label>
                      <span className="text-[11px] text-text-muted">Drag slider or click barrier on map</span>
                    </div>

                    <input
                      id="quick-attach-pos"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={attachPositionPct}
                      onChange={(e) => setAttachPositionPct(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />

                    {/* Live Lat / Long Coordinate Readout & Input */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl border border-border bg-surface-2/60">
                      <div>
                        <label className="block text-[11px] font-semibold text-text-muted mb-1">
                          Latitude (°N)
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={currentMountPoints.lat ? Number(currentMountPoints.lat.toFixed(6)) : ''}
                          onChange={(e) => handleCoordinateChange(e.target.value, currentMountPoints.lng)}
                          placeholder="Latitude"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-text-muted mb-1">
                          Longitude (°E)
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          value={currentMountPoints.lng ? Number(currentMountPoints.lng.toFixed(6)) : ''}
                          onChange={(e) => handleCoordinateChange(currentMountPoints.lat, e.target.value)}
                          placeholder="Longitude"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Live Mini-Map Preview if asset has coordinates */}
                    {Array.isArray(attachAsset.coordinates) && attachAsset.coordinates.length >= 2 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-text-muted">
                          <span>📍 <b>Interactive Map Placement:</b> Click along the line to pick</span>
                          <span className="font-mono text-indigo-400 font-bold">
                            {currentMountPoints.lat ? `${currentMountPoints.lat.toFixed(5)}, ${currentMountPoints.lng.toFixed(5)}` : ''}
                          </span>
                        </div>

                        <div className="h-48 w-full rounded-2xl overflow-hidden border border-border bg-surface-2 relative shadow-inner isolate cursor-crosshair">
                          <MapContainer
                            key={`quick-modal-map-${resolvedTheme}-${attachAsset.coordinates.length}`}
                            center={[Number(attachAsset.coordinates[0].lat || attachAsset.coordinates[0].latitude), Number(attachAsset.coordinates[0].lng || attachAsset.coordinates[0].longitude)]}
                            zoom={15}
                            style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
                            scrollWheelZoom={false}
                            attributionControl={false}
                          >
                            <TileLayer
                              url={isDark
                                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                            />
                            <MapResizer />
                            <FitMapBounds points={attachAsset.coordinates} />
                            <MapClickHandler onClick={handleMapPick} />

                            <Polyline
                              positions={attachAsset.coordinates.map(p => [Number(p.lat || p.latitude), Number(p.lng || p.longitude)])}
                              pathOptions={{ color: '#f59e0b', weight: 8, opacity: 0.95 }}
                              eventHandlers={{
                                click: (e) => handleMapPick(e.latlng.lat, e.latlng.lng)
                              }}
                            />

                            {/* Start and End Anchor points */}
                            <CircleMarker
                              center={[Number(attachAsset.coordinates[0].lat || attachAsset.coordinates[0].latitude), Number(attachAsset.coordinates[0].lng || attachAsset.coordinates[0].longitude)]}
                              radius={6}
                              pathOptions={{ color: '#ffffff', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}
                            >
                              <Tooltip direction="top">Start (0%)</Tooltip>
                            </CircleMarker>

                            <CircleMarker
                              center={[Number(attachAsset.coordinates.at(-1).lat || attachAsset.coordinates.at(-1).latitude), Number(attachAsset.coordinates.at(-1).lng || attachAsset.coordinates.at(-1).longitude)]}
                              radius={6}
                              pathOptions={{ color: '#ffffff', fillColor: '#f97316', fillOpacity: 1, weight: 2 }}
                            >
                              <Tooltip direction="top">End (100%)</Tooltip>
                            </CircleMarker>

                            {/* Current moving preview marker */}
                            {currentMountPoints.lat && (
                              <CircleMarker
                                center={[currentMountPoints.lat, currentMountPoints.lng]}
                                radius={10}
                                pathOptions={{ color: '#ffffff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 3 }}
                              >
                                <Tooltip permanent direction="top" offset={[0, -8]}>
                                  <span style={{ fontSize: 10, fontWeight: 700 }}>
                                    Sensor Node ({attachPositionPct}%)
                                  </span>
                                </Tooltip>
                              </CircleMarker>
                            )}
                          </MapContainer>
                        </div>
                      </div>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-border bg-surface-2/60 p-4 shrink-0">
              <button
                type="button"
                onClick={() => setAttachAsset(null)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-2 hover:text-text transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="quick-mount-form"
                disabled={attaching || !availableDevices.length}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition disabled:opacity-60"
              >
                {attaching && <LoaderCircle className="h-4 w-4 animate-spin" />} Mount Sensor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
