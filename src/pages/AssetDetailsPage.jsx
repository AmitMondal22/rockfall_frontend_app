import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Battery,
  Building2,
  CheckCircle2,
  Cpu,
  Edit3,
  Gauge,
  Link2,
  LoaderCircle,
  MapPin,
  Mountain,
  Package,
  Plus,
  Radio,
  RefreshCw,
  Route,
  Ruler,
  ShieldCheck,
  Signal,
  Unlink,
  Waves,
  X,
  Zap,
  Lock
} from 'lucide-react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { wsService } from '../services/websocket';
import { BARRIER_STYLES } from './AddBarrierAssetPage';
import FreeMapLayerControl from '../components/FreeMapLayerControl';
import {
  FREE_TILE_LAYERS,
  getDefaultFreeTile
} from '../utils/mapUtils';

const NUMBER_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const LOAD_FRESH_MS = 15 * 60 * 1000;

const finiteNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const pointFrom = (value) => {
  if (!value) return null;
  const lat = finiteNumber(value.lat ?? value.latitude);
  const lng = finiteNumber(value.lng ?? value.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

const segmentDistance = (a, b) => {
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const pointAlongPath = (points, positionPct) => {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const pct = Math.max(0, Math.min(100, finiteNumber(positionPct) ?? 0));
  const lengths = points.slice(1).map((point, index) => segmentDistance(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return points[0];
  const target = total * pct / 100;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const next = traversed + lengths[index];
    if (target <= next || index === lengths.length - 1) {
      const ratio = lengths[index] === 0 ? 0 : (target - traversed) / lengths[index];
      return {
        lat: points[index].lat + (points[index + 1].lat - points[index].lat) * ratio,
        lng: points[index].lng + (points[index + 1].lng - points[index].lng) * ratio,
      };
    }
    traversed = next;
  }
  return points.at(-1);
};

const projectPointOnSegment = (p1, p2, click) => {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: p1, t: 0 };
  const t = Math.max(0, Math.min(1, ((click.lng - p1.lng) * dx + (click.lat - p1.lat) * dy) / lenSq));
  return {
    point: {
      lat: Number((p1.lat + t * dy).toFixed(6)),
      lng: Number((p1.lng + t * dx).toFixed(6))
    },
    t
  };
};

const findPositionFromClick = (points, clickLat, clickLng) => {
  if (!points || !points.length) return { pct: 50, lat: clickLat, lng: clickLng };
  if (points.length === 1) return { pct: 0, lat: points[0].lat, lng: points[0].lng };

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

const isFreshTimestamp = (value, maxAgeMs) => {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return !Number.isNaN(timestamp) && Date.now() - timestamp <= maxAgeMs;
};

const formatNumber = (value, suffix = '') => {
  const number = finiteNumber(value);
  return number === null ? '—' : `${NUMBER_FORMAT.format(number)}${suffix}`;
};

const statusTone = (status) => {
  if (status === 'ONLINE' || status === 'ACTIVE' || status === 'OPERATIONAL') return 'border-emerald-500/30 bg-emerald-500/10 text-success';
  if (status === 'ALERT' || status === 'TAMPERED') return 'border-rose-500/30 bg-rose-500/10 text-danger';
  return 'border-amber-500/30 bg-amber-500/10 text-warning';
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
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.min(maxZoom, 15));
      return;
    }
    map.fitBounds(points.map((point) => [point.lat, point.lng]), {
      padding: [36, 36],
      maxZoom,
    });
  }, [map, maxZoom, points]);

  return null;
}

function MetricTile({ icon: Icon, label, value, detail, tone = 'text-info' }) {
  const TileIcon = Icon;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-text-muted">{label}</span>
        <TileIcon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-text">{value}</p>
      <p className="mt-1 min-h-4 text-[11px] text-text-muted">{detail}</p>
    </div>
  );
}

export default function AssetDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isOrgAdmin, isSuperAdmin, isProjectUser, canRemoveDevice, canAddDevice } = useAuth();
  const { resolvedTheme } = useTheme();

  const [asset, setAsset] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [liveSnapshots, setLiveSnapshots] = useState({});

  // Attach Device Modal State
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [availableDevices, setAvailableDevices] = useState([]);
  const [attachDeviceId, setAttachDeviceId] = useState('');
  const [attachPositionPct, setAttachPositionPct] = useState(50);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState('');

  const [activeLayerId, setActiveLayerId] = useState('auto');
  const isDark = resolvedTheme === 'dark';

  const activeTileLayer = useMemo(() => {
    if (activeLayerId === 'auto') return getDefaultFreeTile(isDark);
    return FREE_TILE_LAYERS[activeLayerId] || getDefaultFreeTile(isDark);
  }, [activeLayerId, isDark]);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!id) return;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [assetRes, analysisRes] = await Promise.allSettled([
        api.assets.getById(id),
        api.assets.getAnalysis(id, '24h')
      ]);

      if (assetRes.status === 'rejected') throw assetRes.reason;
      const assetData = assetRes.value?.asset || assetRes.value?.data || assetRes.value;
      if (!assetData) throw new Error('Barrier asset record not found');
      setAsset(assetData);

      if (analysisRes.status === 'fulfilled') {
        setAnalysis(analysisRes.value?.analysis || analysisRes.value);
      }
    } catch (err) {
      setError(err.message || 'Failed to load barrier asset details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData({ quiet: true }), 20000);
    return () => clearInterval(interval);
  }, [loadData]);

  // WebSocket Live Telemetry
  useEffect(() => {
    wsService.connect('/ws/dashboard');
    const unsub = wsService.on('device_update', (msg) => {
      setWsConnected(true);
      if (msg.deviceId) {
        setLiveSnapshots(prev => ({
          ...prev,
          [msg.deviceId]: {
            ...msg.data,
            timestamp: msg.timestamp || new Date().toISOString()
          }
        }));
      }
    });

    return () => {
      unsub();
      wsService.disconnect();
    };
  }, []);

  const points = useMemo(() => {
    const raw = asset?.coordinates || [];
    return raw.map(pointFrom).filter(Boolean);
  }, [asset]);

  const bType = asset?.asset_type || asset?.specifications?.barrierType || 'FENCE_BARRIER';
  const barrierStyle = BARRIER_STYLES[bType] || BARRIER_STYLES.FENCE_BARRIER;
  const specs = asset?.specifications || {};

  const devices = useMemo(() => {
    const devs = Array.isArray(asset?.devices) ? asset.devices : [];
    return devs.map((dev, idx) => {
      const devId = dev._id || dev.id;
      const posPct = dev.asset_position_pct ?? dev.assetPositionPct ?? dev.positionPct ?? ((idx + 1) / (devs.length + 1) * 100);
      const point = pointAlongPath(points, posPct);
      return {
        ...dev,
        _id: devId,
        id: devId,
        posPct,
        point
      };
    });
  }, [asset, points]);

  // Handle Attach Device Flow
  const openAttachModal = async () => {
    setAttachError('');
    setAttachDeviceId('');
    setAttachPositionPct(50);
    setAttachModalOpen(true);
    try {
      const devRes = await api.devices.getAll();
      const allDevs = Array.isArray(devRes.devices) ? devRes.devices : [];
      // Eligible devices not already mounted
      const currentDevIds = new Set(devices.map(d => String(d._id)));
      const filtered = allDevs.filter(d => !currentDevIds.has(String(d._id || d.id)));
      setAvailableDevices(filtered);
    } catch (err) {
      setAttachError('Unable to load eligible devices.');
    }
  };

  const currentMountPoint = useMemo(() => {
    return pointAlongPath(points, attachPositionPct) || { lat: 0, lng: 0 };
  }, [points, attachPositionPct]);

  const handleMapPick = (clickLat, clickLng) => {
    const { pct } = findPositionFromClick(points, clickLat, clickLng);
    setAttachPositionPct(pct);
  };

  const handleCoordinateChange = (latVal, lngVal) => {
    const l = parseFloat(latVal);
    const g = parseFloat(lngVal);
    if (!Number.isNaN(l) && !Number.isNaN(g)) {
      const { pct } = findPositionFromClick(points, l, g);
      setAttachPositionPct(pct);
    }
  };

  const handleAttachSubmit = async (e) => {
    e.preventDefault();
    if (!attachDeviceId) return;
    setAttaching(true);
    setAttachError('');
    try {
      await api.assets.attachDevice(id, attachDeviceId, attachPositionPct, {
        lat: currentMountPoint.lat,
        lng: currentMountPoint.lng
      });
      setAttachModalOpen(false);
      loadData();
    } catch (err) {
      setAttachError(err.message || 'Failed to attach device to barrier.');
    } finally {
      setAttaching(false);
    }
  };

  const handleDetachDevice = async (deviceId) => {
    if (!window.confirm(`Are you sure you want to unmount device ${deviceId} from this barrier?`)) return;
    try {
      await api.assets.detachDevice(id, deviceId);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to unmount device.');
    }
  };

  if (loading && !asset) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-3 rounded-3xl border border-border bg-surface text-sm text-text-muted">
        <LoaderCircle className="h-5 w-5 animate-spin text-info" /> Loading barrier asset and live analysis…
      </div>
    );
  }

  if (error && !asset) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-rose-500/30 bg-surface p-8 text-center shadow-lg">
        <AlertCircle className="mx-auto h-8 w-8 text-danger" />
        <h2 className="mt-3 text-lg font-semibold">Asset Not Found</h2>
        <p className="mt-2 text-sm text-text-muted">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/assets')}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Assets List
        </button>
      </div>
    );
  }

  const structuralLoad = analysis?.structuralLoad || {};
  const structuralAvailable = structuralLoad.available && finiteNumber(structuralLoad.totalLoadKn) !== null;

  return (
    <div className="space-y-6 text-text">
      {/* Page Header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <button
            type="button"
            onClick={() => navigate('/assets')}
            className="mb-3 inline-flex items-center gap-2 text-xs font-medium text-text-muted transition hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" /> Back to All Barrier Assets
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
              {asset?.id || id}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-400">
              <span>{barrierStyle.icon}</span>
              <span>{barrierStyle.name}</span>
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(asset?.status)}`}>
              {asset?.status || 'OPERATIONAL'}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase ${wsConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-success' : 'border-border text-text-muted'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-text-dim'}`} />
              {wsConnected ? 'Live Active' : 'Live Idle'}
            </span>
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight sm:text-3xl text-text">
            {asset?.name || 'Barrier Asset'}
          </h1>
          <p className="mt-1 text-xs text-text-muted">
            {asset?.description || 'Physical rockfall protection barrier with mounted structural telemetry nodes.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isOrgAdmin && (
            <>
              <button
                type="button"
                onClick={() => navigate(`/assets/${encodeURIComponent(id)}/edit`)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-amber-500 transition"
              >
                <Edit3 className="h-4 w-4" /> Edit Geometry & Barrier
              </button>
              <button
                type="button"
                onClick={openAttachModal}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition"
              >
                <Link2 className="h-4 w-4" /> Mount Sensor Node
              </button>
            </>
          )}
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-xs font-semibold text-text hover:bg-surface-2 transition"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>

      {/* 6 Telemetry Metric Tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          icon={Activity}
          label="Telemetry"
          value={formatNumber(analysis?.telemetry?.count || 0)}
          detail={`${devices.length} reporting sensors`}
        />
        <MetricTile
          icon={Zap}
          label="Impact Events"
          value={formatNumber(analysis?.impactCount || 0)}
          detail="24h event window"
          tone="text-warning"
        />
        <MetricTile
          icon={Mountain}
          label="Rockfall Alerts"
          value={formatNumber(analysis?.rockfallCount || 0)}
          detail="Classified rockfall"
          tone="text-danger"
        />
        <MetricTile
          icon={Gauge}
          label="Maximum Peak"
          value={formatNumber(analysis?.maxPeakG, ' g')}
          detail="Highest 24h impact"
          tone="text-accent"
        />
        <MetricTile
          icon={Waves}
          label="Signal Energy"
          value={formatNumber(analysis?.totalEnergyG2, ' g²')}
          detail="Vibration energy sum"
          tone="text-info"
        />
        <MetricTile
          icon={Signal}
          label="Structural Load"
          value={structuralAvailable ? formatNumber(structuralLoad.totalLoadKn, ' kN') : 'Operational'}
          detail={structuralAvailable
            ? `${formatNumber(structuralLoad.utilizationPct, '%')} of ${formatNumber(structuralLoad.ratedLoadKn, ' kN')} rated load`
            : `${devices.length} mounted nodes active`}
          tone={structuralAvailable ? 'text-success' : 'text-emerald-400'}
        />
      </div>

      {/* Main Grid: Interactive Map + Engineering Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Barrier Geometry Map */}
        <div className="lg:col-span-2 rounded-3xl border border-border bg-surface overflow-hidden shadow-sm flex flex-col relative isolate z-0">
          <div className="px-5 py-4 border-b border-border bg-surface-2/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-sm">Barrier Geometry & Mounted Sensor Placement Map</h2>
            </div>
            <span className="text-xs font-mono font-semibold text-text-muted">
              {points.length} Points · {formatNumber(specs.lengthM, ' m')} Span
            </span>
          </div>

          <div className="h-[460px] w-full relative bg-surface-2 map-container-isolated">
            <FreeMapLayerControl
              currentLayerId={activeLayerId}
              onSelectLayer={setActiveLayerId}
              isDark={isDark}
              position="top-right"
            />

            <MapContainer
              key={`${id}-${resolvedTheme}-${activeLayerId}-${points.length}`}
              center={points[0] ? [points[0].lat, points[0].lng] : [18.272, 83.078]}
              zoom={15}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom
            >
              <TileLayer
                url={activeTileLayer.url}
                attribution={activeTileLayer.attribution}
                maxZoom={activeTileLayer.maxZoom || 19}
                subdomains={activeTileLayer.subdomains || 'abc'}
              />
              <MapResizer />
              <FitMapBounds points={points} />

              {/* Contrast Glow Line */}
              {points.length >= 2 && (
                <Polyline
                  positions={points.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: isDark ? '#1e1b4b' : '#312e81', weight: (barrierStyle.weight || 6) + 4, opacity: 0.6 }}
                />
              )}

              {/* Styled Barrier Polyline */}
              {points.length >= 2 && (
                <Polyline
                  positions={points.map((p) => [p.lat, p.lng])}
                  pathOptions={{
                    color: barrierStyle.lineColor,
                    weight: barrierStyle.weight,
                    dashArray: barrierStyle.dashArray || undefined,
                    opacity: 0.95
                  }}
                />
              )}

              {/* Anchor Posts at Vertices */}
              {points.map((pt, idx) => {
                const isStart = idx === 0;
                const isEnd = idx === points.length - 1 && points.length > 1;
                const color = isStart ? '#10b981' : (isEnd ? '#f97316' : barrierStyle.lineColor);
                const label = isStart ? 'Start (P1)' : (isEnd ? `End (P${idx + 1})` : `P${idx + 1}`);

                return (
                  <CircleMarker
                    key={`v-${idx}`}
                    center={[pt.lat, pt.lng]}
                    radius={isStart || isEnd ? 10 : 7}
                    pathOptions={{ color: '#ffffff', fillColor: color, fillOpacity: 1, weight: 3 }}
                  >
                    <Tooltip permanent direction="top" offset={[0, -8]}>
                      <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
                    </Tooltip>
                    <Popup>
                      <div style={{ color: '#111', fontSize: 12 }}>
                        <strong>{label} - Structural Anchor Post</strong>
                        <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontSize: 11 }}>{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* Mounted Device Sensor Markers positioned directly on the barrier line */}
              {devices.map((dev) => {
                if (!dev.point) return null;
                const live = liveSnapshots[dev._id] || {};
                const liveLoad = live.load_kn ?? live.currentLoadKn;

                return (
                  <CircleMarker
                    key={dev._id}
                    center={[dev.point.lat, dev.point.lng]}
                    radius={9}
                    pathOptions={{ color: '#ffffff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 2.5 }}
                  >
                    <Tooltip permanent direction="bottom" offset={[0, 8]}>
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>
                        📡 {dev.name || dev._id} ({Math.round(dev.posPct)}%)
                      </span>
                    </Tooltip>
                    <Popup>
                      <div style={{ color: '#111', fontSize: 12, minWidth: 160 }}>
                        <strong>📡 {dev.name || dev._id}</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#666' }}>
                          Mounted at <b>{Math.round(dev.posPct)}%</b> along barrier line
                        </p>
                        {liveLoad != null && (
                          <p style={{ margin: '3px 0 0', fontSize: 11, color: '#4f46e5', fontWeight: 600 }}>
                            Live Load: {parseFloat(liveLoad).toFixed(2)} kN
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => navigate(`/devices/${encodeURIComponent(dev._id)}`)}
                          style={{ marginTop: 6, color: '#2563eb', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          Open Device Dashboard →
                        </button>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* Right 1 Col: Engineering Specifications */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Ruler className="w-4 h-4 text-emerald-400" />
              Structural Engineering Specifications
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Barrier Type</span>
                <span className="font-semibold text-text flex items-center gap-1.5">
                  {barrierStyle.icon} {barrierStyle.name}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Rated Energy Capacity</span>
                <span className="font-bold text-indigo-400 font-mono">{formatNumber(specs.capacityKj, ' kJ')}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Total Span Length</span>
                <span className="font-bold text-text font-mono">{formatNumber(specs.lengthM, ' m')}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Barrier Height</span>
                <span className="font-bold text-text font-mono">{formatNumber(specs.heightM, ' m')}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Managing Location (Site)</span>
                <span className="font-semibold text-text">{asset?.locationName || asset?.location_id || 'Assigned Site'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-text-muted">Plotted Vertices</span>
                <span className="font-semibold text-text font-mono">{points.length} Anchors</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mounted Sensor Nodes Table */}
      <div className="rounded-3xl border border-border bg-surface overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Mounted Sensor Monitoring Nodes ({devices.length})
            </h2>
            <p className="text-xs text-text-muted mt-0.5">Vibration sensors, tension load cells, and telemetry units installed along this barrier.</p>
          </div>
          {canAddDevice && (
            <button
              type="button"
              onClick={openAttachModal}
              className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-500 transition shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Mount Sensor
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 border-b border-border text-xs text-text-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Sensor Name</th>
                <th className="px-4 py-3 text-left font-medium">Hardware ID</th>
                <th className="px-4 py-3 text-left font-medium">Barrier Position</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Battery</th>
                <th className="px-4 py-3 text-left font-medium">Signal</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((dev) => {
                const live = liveSnapshots[dev._id] || {};
                const status = live.status || dev.status || 'ONLINE';

                return (
                  <tr key={dev._id} className="border-b border-border/30 hover:bg-surface-2 transition">
                    <td className="px-4 py-3 font-semibold text-text">{dev.name || dev._id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{dev._id}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        {Math.round(dev.posPct)}% Line Span
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusTone(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">{dev.battery != null ? `${dev.battery} V` : '100%'}</td>
                    <td className="px-4 py-3 text-xs">{dev.csq != null ? `${dev.csq}/31` : 'Good'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/devices/${encodeURIComponent(dev._id)}`)}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition"
                        >
                          View Dashboard
                        </button>
                        {canRemoveDevice ? (
                          <button
                            type="button"
                            onClick={() => handleDetachDevice(dev._id)}
                            className="p-1 text-text-dim hover:text-danger rounded-lg transition"
                            title="Unmount device from barrier"
                          >
                            <Unlink className="w-4 h-4" />
                          </button>
                        ) : (
                          <span
                            title="Device removal restricted to Project/Org/Super Admin"
                            className="p-1 text-text-dim/40 cursor-not-allowed inline-flex items-center"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {devices.length === 0 && (
            <p className="text-center text-text-dim py-8 text-xs">No sensor nodes are currently mounted on this physical barrier.</p>
          )}
        </div>
      </div>

      {/* Attach Device Modal */}
      {attachModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border bg-surface p-5 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-text">Mount Sensor Node to {asset?.name}</h3>
                <p className="mt-0.5 text-xs text-text-muted">Select an unattached device and its percentage position along the line span.</p>
              </div>
              <button
                type="button"
                onClick={() => setAttachModalOpen(false)}
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
                <form id="mount-sensor-form" onSubmit={handleAttachSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="modal-attach-device" className="mb-1.5 block text-xs font-medium text-text-muted">Select Hardware Device</label>
                    <select
                      id="modal-attach-device"
                      required
                      value={attachDeviceId}
                      onChange={(e) => setAttachDeviceId(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-text outline-none focus:border-indigo-500"
                    >
                      <option value="">Choose a registered sensor</option>
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
                      <label htmlFor="modal-attach-pos" className="font-semibold text-text">
                        Placement Along Barrier Span: <span className="font-mono text-indigo-400 font-bold">{attachPositionPct}%</span>
                      </label>
                      <span className="text-[11px] text-text-muted">Drag slider or click barrier on map</span>
                    </div>

                    <input
                      id="modal-attach-pos"
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
                          value={currentMountPoint.lat ? Number(currentMountPoint.lat.toFixed(6)) : ''}
                          onChange={(e) => handleCoordinateChange(e.target.value, currentMountPoint.lng)}
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
                          value={currentMountPoint.lng ? Number(currentMountPoint.lng.toFixed(6)) : ''}
                          onChange={(e) => handleCoordinateChange(currentMountPoint.lat, e.target.value)}
                          placeholder="Longitude"
                          className="w-full rounded-xl border border-border bg-surface px-3 py-1.5 font-mono text-xs text-text outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Live Modal Mini-Map Preview with Click-To-Pick */}
                    {points.length >= 2 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-text-muted">
                          <span>📍 <b>Interactive Map Placement:</b> Click along the line to pick</span>
                          <span className="font-mono text-indigo-400 font-bold">
                            {currentMountPoint.lat ? `${currentMountPoint.lat.toFixed(5)}, ${currentMountPoint.lng.toFixed(5)}` : ''}
                          </span>
                        </div>

                        <div className="h-48 w-full rounded-2xl overflow-hidden border border-border bg-surface-2 relative shadow-inner isolate cursor-crosshair">
                          <MapContainer
                            key={`modal-map-${resolvedTheme}-${points.length}`}
                            center={[points[0].lat, points[0].lng]}
                            zoom={15}
                            style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
                            scrollWheelZoom={false}
                            attributionControl={false}
                          >
                            <TileLayer
                              url={isDark
                                ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
                                : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
                            />
                            <MapResizer />
                            <FitMapBounds points={points} />
                            <MapClickHandler onClick={handleMapPick} />

                            <Polyline
                              positions={points.map(p => [p.lat, p.lng])}
                              pathOptions={{ color: barrierStyle.lineColor || '#f59e0b', weight: 8, opacity: 0.95 }}
                              eventHandlers={{
                                click: (e) => handleMapPick(e.latlng.lat, e.latlng.lng)
                              }}
                            />

                            {points[0] && (
                              <CircleMarker
                                center={[points[0].lat, points[0].lng]}
                                radius={6}
                                pathOptions={{ color: '#ffffff', fillColor: '#10b981', fillOpacity: 1, weight: 2 }}
                              >
                                <Tooltip direction="top">Start (0%)</Tooltip>
                              </CircleMarker>
                            )}

                            {points.length >= 2 && (
                              <CircleMarker
                                center={[points.at(-1).lat, points.at(-1).lng]}
                                radius={6}
                                pathOptions={{ color: '#ffffff', fillColor: '#f97316', fillOpacity: 1, weight: 2 }}
                              >
                                <Tooltip direction="top">End (100%)</Tooltip>
                              </CircleMarker>
                            )}

                            {/* Current moving preview marker */}
                            {currentMountPoint.lat && (
                              <CircleMarker
                                center={[currentMountPoint.lat, currentMountPoint.lng]}
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
                onClick={() => setAttachModalOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-2 hover:text-text transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="mount-sensor-form"
                disabled={attaching || !availableDevices.length}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 transition disabled:opacity-60"
              >
                {attaching && <LoaderCircle className="h-4 w-4 animate-spin" />} Mount Sensor Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
