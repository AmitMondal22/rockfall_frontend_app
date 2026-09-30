import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  LocateFixed,
  LoaderCircle,
  MapPin,
  Mountain,
  RefreshCw,
  Route,
  Ruler,
  Save,
  ShieldCheck,
  Trash2,
  Plus,
  Cpu,
  Layers,
  Edit3,
  Shield,
  Grid,
  Zap,
  Boxes,
  Radio,
  RotateCcw,
  X
} from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { BARRIER_STYLES } from '../constants/barrierStyles';

const blankForm = (organizationId = '') => ({
  id: '',
  name: '',
  organizationId,
  locationId: '',
  barrierType: 'FENCE_BARRIER',
  capacityKj: '2000',
  lengthM: '',
  heightM: '4.5',
  description: '',
  coordinates: [],
});

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

const distanceMetres = (start, end) => {
  if (!start || !end) return 0;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(end.lng - start.lng);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
};

const totalPolylineLength = (points) => {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distanceMetres(points[i], points[i + 1]);
  }
  return total;
};

const pointAlongPath = (points, positionPct) => {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const pct = Math.max(0, Math.min(100, finiteNumber(positionPct) ?? 0));
  const lengths = points.slice(1).map((point, index) => distanceMetres(points[index], point));
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

function MapViewport({ points, locationPoint }) {
  const map = useMap();
  const hasInitializedRef = useState(false);

  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points.map((point) => [point.lat, point.lng]), {
        padding: [42, 42],
        maxZoom: 17,
      });
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
      return;
    }
    if (locationPoint) map.setView([locationPoint.lat, locationPoint.lng], 14);
  }, [locationPoint, map]);

  return null;
}

function MapClickHandler({ onAddPoint }) {
  useMapEvents({
    click(event) {
      onAddPoint({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

function BarrierGeometryMap({ coordinates, devices = [], barrierType = 'FENCE_BARRIER', locationPoint, locationName, onAddPoint, onRemovePoint, theme }) {
  const points = useMemo(() => coordinates.map(pointFrom).filter(Boolean), [coordinates]);
  const isDark = theme === 'dark';
  const tile = isDark
    ? {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
      }
    : {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap contributors',
      };

  const currentStyle = BARRIER_STYLES[barrierType] || BARRIER_STYLES.FENCE_BARRIER;

  return (
    <MapContainer
      key={theme}
      center={points[0] ? [points[0].lat, points[0].lng] : (locationPoint ? [locationPoint.lat, locationPoint.lng] : [18.272, 83.078])}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer attribution={tile.attribution} url={tile.url} />
      <MapResizer />
      <MapViewport points={points} locationPoint={locationPoint} />
      <MapClickHandler onAddPoint={onAddPoint} />

      {locationPoint && (
        <CircleMarker
          center={[locationPoint.lat, locationPoint.lng]}
          radius={7}
          pathOptions={{ color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.22, weight: 2 }}
        >
          <Popup>{locationName || 'Selected location'} site reference</Popup>
        </CircleMarker>
      )}

      {/* Outer base glow/casing line for contrast and depth */}
      {points.length >= 2 && (
        <Polyline
          positions={points.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: isDark ? '#1e1b4b' : '#312e81',
            weight: (currentStyle.weight || 6) + 4,
            opacity: 0.6
          }}
        />
      )}

      {/* Styled Barrier Line based on barrier type */}
      {points.length >= 2 && (
        <Polyline
          positions={points.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: currentStyle.lineColor,
            weight: currentStyle.weight,
            dashArray: currentStyle.dashArray || undefined,
            opacity: 0.95
          }}
        />
      )}

      {/* Markers for all vertices with anchor styling */}
      {points.map((point, index) => {
        const isStart = index === 0;
        const isEnd = index === points.length - 1 && points.length > 1;
        const color = isStart ? '#10b981' : (isEnd ? '#f97316' : currentStyle.lineColor);
        const label = isStart ? 'Start (P1)' : (isEnd ? `End (P${index + 1})` : `P${index + 1}`);

        return (
          <CircleMarker
            key={`vertex-${index}-${point.lat}-${point.lng}`}
            center={[point.lat, point.lng]}
            radius={isStart || isEnd ? 10 : 7}
            pathOptions={{ color: '#ffffff', fillColor: color, fillOpacity: 1, weight: 3 }}
          >
            <Tooltip permanent direction="top" offset={[0, -8]}>
              <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
            </Tooltip>
            <Popup>
              <div style={{ color: '#111', fontSize: 12 }}>
                <strong>{label} - Structural Anchor Post</strong>
                <p style={{ margin: '4px 0 0', fontFamily: 'monospace', fontSize: 11 }}>
                  {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                </p>
                <button
                  type="button"
                  onClick={() => onRemovePoint(index)}
                  style={{ marginTop: 6, color: '#ef4444', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  <Trash2 style={{ width: 12, height: 12 }} /> Remove this point
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Render Attached Device Markers directly on the barrier line */}
      {points.length >= 2 && devices.map((dev, idx) => {
        const posPct = dev.asset_position_pct ?? dev.assetPositionPct ?? dev.positionPct ?? ((idx + 1) / (devices.length + 1) * 100);
        const devPt = pointAlongPath(points, posPct);
        if (!devPt) return null;

        return (
          <CircleMarker
            key={`dev-${dev.id || dev._id || idx}`}
            center={[devPt.lat, devPt.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', fillColor: '#8b5cf6', fillOpacity: 1, weight: 2.5 }}
          >
            <Tooltip permanent direction="bottom" offset={[0, 8]}>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#8b5cf6', color: '#fff', padding: '1px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Radio style={{ width: 10, height: 10 }} /> {dev.name || dev.id} ({Math.round(posPct)}%)
              </span>
            </Tooltip>
            <Popup>
              <div style={{ color: '#111', fontSize: 12 }}>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Radio style={{ width: 12, height: 12, color: '#8b5cf6' }} />
                  {dev.name || dev.id}
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#666' }}>Mounted on barrier at {Math.round(posPct)}% position</p>
                <p style={{ margin: '2px 0 0', fontFamily: 'monospace', fontSize: 11 }}>{devPt.lat.toFixed(6)}, {devPt.lng.toFixed(6)}</p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control rounded-xl border border-border bg-surface/95 px-3.5 py-2 text-xs font-medium text-text shadow-lg flex items-center gap-2">
          {currentStyle.Icon ? <currentStyle.Icon className="w-4 h-4 text-amber-500" /> : <Shield className="w-4 h-4 text-amber-500" />}
          <span className="font-semibold text-xs">{currentStyle.name}</span>
          <span className="text-text-dim text-[11px]">({points.length} vertices plotted)</span>
        </div>
      </div>
    </MapContainer>
  );
}

function FieldLabel({ htmlFor, children, required = false }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-text-muted">
      {children}{required && <span className="ml-1 text-danger" aria-hidden="true">*</span>}
    </label>
  );
}

const inputClass = 'w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition placeholder:text-text-dim focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-65';
const DISTANCE_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export default function AddBarrierAssetPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin, isOrgAdmin, isProjectUser, isLocationUser } = useAuth();
  const canManageBarrier = isSuperAdmin || isAdmin || isOrgAdmin || isProjectUser || isLocationUser;
  const { resolvedTheme } = useTheme();

  const [form, setForm] = useState(() => blankForm(isAdmin ? '' : String(user?.organizationId || '')));
  const [organizations, setOrganizations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [attachedDevices, setAttachedDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (isAdmin || !user?.organizationId || isEdit) return;
    setForm((current) => ({ ...current, organizationId: String(user.organizationId) }));
  }, [isAdmin, user?.organizationId, isEdit]);

  useEffect(() => {
    if (!canManageBarrier && !loading) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    const loadData = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const organizationRequest = isAdmin
          ? api.organizations.getAll()
          : (user?.organizationId ? api.organizations.getById(user.organizationId) : api.organizations.getAll());
        const [organizationResponse, locationResponse] = await Promise.all([
          organizationRequest,
          api.locations.getAll(isAdmin ? undefined : user?.organizationId),
        ]);
        if (!active) return;

        const rawOrgs = Array.isArray(organizationResponse.organizations)
          ? organizationResponse.organizations
          : organizationResponse.organization ? [organizationResponse.organization] : [];
        const loadedOrganizations = rawOrgs.map(o => ({
          ...o,
          _id: o._id || o.id,
          id: o.id || o._id,
          name: o.name || o._id || o.id
        }));

        const rawLocs = Array.isArray(locationResponse.locations)
          ? locationResponse.locations
          : locationResponse.location ? [locationResponse.location] : [];
        const loadedLocations = rawLocs.map(l => ({
          ...l,
          _id: l._id || l.id,
          id: l.id || l._id,
          organizationId: l.organizationId || l.org_id,
          org_id: l.org_id || l.organizationId,
          name: l.name || l._id || l.id
        }));

        setOrganizations(loadedOrganizations);
        setLocations(loadedLocations);

        // If in Edit Mode, fetch existing asset data
        if (isEdit) {
          const assetRes = await api.assets.getById(id);
          const assetData = assetRes.asset || assetRes.data || assetRes;
          if (assetData) {
            let rawCoords = assetData.coordinates || [];
            if (typeof rawCoords === 'string') {
              try { rawCoords = JSON.parse(rawCoords); } catch (e) { rawCoords = []; }
            }
            if (!Array.isArray(rawCoords)) rawCoords = [];

            const specs = typeof assetData.specifications === 'string'
              ? (() => { try { return JSON.parse(assetData.specifications); } catch (e) { return {}; } })()
              : (assetData.specifications || {});

            setAttachedDevices(Array.isArray(assetData.devices) ? assetData.devices : []);
            setForm({
              id: String(assetData.id || assetData._id || id),
              name: assetData.name || '',
              organizationId: String(assetData.org_id || assetData.organizationId || ''),
              locationId: String(assetData.location_id || assetData.locationId || ''),
              barrierType: assetData.asset_type || specs.barrierType || 'FENCE_BARRIER',
              capacityKj: String(specs.capacityKj ?? '2000'),
              lengthM: String(specs.lengthM ?? ''),
              heightM: String(specs.heightM ?? '4.5'),
              description: assetData.description || specs.description || '',
              coordinates: rawCoords.map(c => {
                if (Array.isArray(c)) {
                  return { lat: String(c[0]), lng: String(c[1]) };
                }
                const lat = c?.lat ?? c?.latitude;
                const lng = c?.lng ?? c?.longitude;
                return { lat: String(lat ?? ''), lng: String(lng ?? '') };
              }).filter(c => c.lat !== '' && c.lng !== '')
            });
          }
        } else if (!form.organizationId && loadedOrganizations.length === 1) {
          const singleOrgId = loadedOrganizations[0]._id || loadedOrganizations[0].id;
          const orgLocs = loadedLocations.filter(l => String(l.organizationId || l.org_id) === singleOrgId);
          setForm(current => ({
            ...current,
            organizationId: singleOrgId,
            locationId: orgLocs.length === 1 ? (orgLocs[0]._id || orgLocs[0].id) : current.locationId
          }));
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Unable to load barrier data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [id, isEdit, isAdmin, canManageBarrier, loadAttempt, user?.organizationId]);

  const organizationOptions = useMemo(() => {
    const values = [...organizations];
    const userOrganizationId = String(user?.organizationId || user?.org_id || '');
    if (userOrganizationId && !values.some((organization) => String(organization._id || organization.id) === userOrganizationId)) {
      values.push({ _id: userOrganizationId, id: userOrganizationId, name: user?.organizationName || userOrganizationId });
    }
    return values;
  }, [organizations, user]);

  const filteredLocations = useMemo(() => {
    if (!form.organizationId) return locations;
    return locations.filter((location) => {
      const locOrg = String(location.organizationId || location.org_id || '');
      return !locOrg || locOrg === String(form.organizationId);
    });
  }, [form.organizationId, locations]);

  const selectedLocation = useMemo(() => {
    return locations.find((location) => (
      String(location._id || location.id) === String(form.locationId)
    )) || null;
  }, [locations, form.locationId]);

  const locationPoint = useMemo(() => pointFrom(selectedLocation), [selectedLocation]);
  const validCoordinates = useMemo(() => form.coordinates.map(pointFrom).filter(Boolean), [form.coordinates]);
  
  const computedTotalLength = useMemo(() => {
    return totalPolylineLength(validCoordinates);
  }, [validCoordinates]);

  // Auto update length field if user adds/edits points
  useEffect(() => {
    if (computedTotalLength > 0) {
      setForm(prev => ({ ...prev, lengthM: computedTotalLength.toFixed(1) }));
    }
  }, [computedTotalLength]);

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (submitError) setSubmitError('');
  };

  const handleAddMapPoint = useCallback((point) => {
    setForm((current) => ({
      ...current,
      coordinates: [...current.coordinates, { lat: String(point.lat), lng: String(point.lng) }],
    }));
    setSubmitError('');
  }, []);

  const handleRemovePoint = useCallback((index) => {
    setForm((current) => ({
      ...current,
      coordinates: current.coordinates.filter((_, i) => i !== index),
    }));
  }, []);

  const handleUndoPoint = () => {
    setForm((current) => ({
      ...current,
      coordinates: current.coordinates.slice(0, -1),
    }));
  };

  const handleClearPoints = () => {
    setForm((current) => ({
      ...current,
      coordinates: [],
    }));
  };

  const handleReversePoints = () => {
    setForm((current) => ({
      ...current,
      coordinates: [...current.coordinates].reverse(),
    }));
  };

  const submitAsset = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitError('');

    const assetId = form.id.trim() || `asset_${Date.now()}`;
    const name = form.name.trim();
    const barrierType = form.barrierType.trim();

    if (name.length < 2) {
      setSubmitError('Asset name must contain at least 2 characters.');
      return;
    }
    if (!form.organizationId || !form.locationId) {
      setSubmitError('Select the organization and location that own this barrier.');
      return;
    }

    const coordinates = form.coordinates.map(pointFrom).filter(Boolean);
    if (coordinates.length < 2) {
      setSubmitError('Please click on the map to set at least 2 coordinate points (Start & End) for the barrier line.');
      return;
    }

    const capacityKj = finiteNumber(form.capacityKj);
    const lengthM = finiteNumber(form.lengthM) || computedTotalLength;
    const heightM = finiteNumber(form.heightM);

    setSubmitting(true);
    try {
      const payload = {
        _id: assetId,
        id: assetId,
        name,
        locationId: form.locationId,
        location_id: form.locationId,
        organizationId: form.organizationId,
        org_id: form.organizationId,
        asset_type: barrierType,
        description: form.description.trim() || undefined,
        specifications: {
          barrierType,
          capacityKj,
          lengthM,
          heightM,
        },
        coordinates,
      };

      if (isEdit) {
        await api.assets.update(id, payload);
      } else {
        await api.assets.create(payload);
      }

      navigate('/assets', {
        replace: true,
        state: { createdAssetId: assetId },
      });
    } catch (error) {
      setSubmitError(error.message || `Unable to ${isEdit ? 'update' : 'create'} barrier asset.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!canManageBarrier) {
    return (
      <div className="mx-auto max-w-3xl text-text">
        <button type="button" onClick={() => navigate('/assets')} className="mb-5 inline-flex items-center gap-2 text-sm text-text-muted transition hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back to assets
        </button>
        <section className="rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-text-muted" />
          <h1 className="mt-4 text-xl font-semibold">Asset management requires administrator access</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-text-muted">Administrators and authorized project engineers can register and configure physical barriers.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-text">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <button type="button" onClick={() => navigate('/assets')} className="mb-4 inline-flex items-center gap-2 text-sm text-text-muted transition hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Back to barrier assets
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-info">
            <Mountain className="h-4 w-4" /> {isEdit ? 'Edit Asset Geometry' : 'Physical barrier registry'}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {isEdit ? `Edit Barrier: ${form.name || id}` : 'Add Barrier Asset'}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            Configure barrier properties, select organization & site location, then click along the map to draw the multi-point barrier line path.
          </p>
        </div>
      </header>

      {loading && (
        <div className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-border bg-surface text-sm text-text-muted">
          <LoaderCircle className="h-5 w-5 animate-spin text-info" /> Loading barrier asset and geometry data…
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-3xl border border-rose-500/30 bg-surface p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Data could not be loaded</h2>
              <p className="mt-1 text-sm text-text-muted">{loadError}</p>
            </div>
            <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-semibold transition hover:border-indigo-500">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !loadError && (
        <form onSubmit={submitAsset} className="space-y-6">
          {submitError && (
            <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Section 1: Identity & Ownership */}
          <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border bg-gradient-to-r from-indigo-500/10 via-transparent to-transparent px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-info"><Building2 className="h-4.5 w-4.5" /></span>
                <div><h2 className="font-semibold">Identity and Site Ownership</h2><p className="text-xs text-text-muted">Link this barrier to its managing organization and site location.</p></div>
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
              <div>
                <FieldLabel htmlFor="asset-id">Asset ID (Auto-generated)</FieldLabel>
                <input id="asset-id" autoComplete="off" value={form.id} onChange={(event) => setField('id', event.target.value)} disabled={isEdit} className={`${inputClass} font-mono ${isEdit ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="Leave blank to auto-generate" />
              </div>
              <div>
                <FieldLabel htmlFor="asset-name" required>Barrier Asset Name</FieldLabel>
                <input id="asset-name" required minLength="2" value={form.name} onChange={(event) => setField('name', event.target.value)} className={inputClass} placeholder="e.g. Catch Fence Sector 04" />
              </div>
              <div>
                <FieldLabel htmlFor="asset-organization" required>Organization</FieldLabel>
                <select
                  id="asset-organization"
                  required
                  disabled={!isAdmin}
                  value={form.organizationId}
                  onChange={(event) => {
                    const orgId = event.target.value;
                    const locsForOrg = locations.filter(l => !orgId || String(l.organizationId || l.org_id) === orgId);
                    const nextLocId = locsForOrg.length === 1 ? (locsForOrg[0]._id || locsForOrg[0].id) : '';
                    setForm((current) => ({ ...current, organizationId: orgId, locationId: nextLocId }));
                  }}
                  className={inputClass}
                >
                  <option value="">Select organization</option>
                  {organizationOptions.map((organization) => (
                    <option key={organization._id || organization.id} value={organization._id || organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="asset-location" required>Location (Site)</FieldLabel>
                <select
                  id="asset-location"
                  required
                  disabled={!form.organizationId && organizationOptions.length > 1}
                  value={form.locationId}
                  onChange={(event) => setField('locationId', event.target.value)}
                  className={inputClass}
                >
                  <option value="">Select location</option>
                  {filteredLocations.map((location) => (
                    <option key={location._id || location.id} value={location._id || location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                {form.organizationId && !filteredLocations.length && (
                  <p className="mt-1.5 text-[11px] text-warning">No active locations are registered for this organization.</p>
                )}
              </div>
              {selectedLocation && (
                <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-2 p-4 sm:col-span-2 lg:col-span-4">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                  <div><p className="text-sm font-semibold">{selectedLocation.name}</p><p className="mt-0.5 text-xs text-text-muted">{selectedLocation.address || 'No address has been recorded for this location.'}{locationPoint ? ` · ${locationPoint.lat.toFixed(6)}, ${locationPoint.lng.toFixed(6)}` : ' · No reference coordinates recorded.'}</p></div>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: Technical Specifications */}
          <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-success"><Ruler className="h-4.5 w-4.5" /></span>
                <div><h2 className="font-semibold">Barrier Engineering Specifications</h2><p className="text-xs text-text-muted">Record the rated kinetic energy dissipation and barrier dimensions.</p></div>
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
              <div>
                <FieldLabel htmlFor="barrier-type" required>Barrier Type</FieldLabel>
                <select id="barrier-type" required value={form.barrierType} onChange={(event) => setField('barrierType', event.target.value)} className={inputClass}>
                  <option value="FENCE_BARRIER">Flexible Catch Fence</option>
                  <option value="DRAPERY_NET">Drapery Mesh / Wire Net</option>
                  <option value="ROCK_SHED">Protective Rock Shed</option>
                  <option value="ATTENUATOR">Attenuator System</option>
                  <option value="EMBANKMENT">Reinforced Embankment</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="capacity-kj" required>Rated Capacity (kJ)</FieldLabel>
                <input id="capacity-kj" required type="number" min="1" step="any" value={form.capacityKj} onChange={(event) => setField('capacityKj', event.target.value)} className={inputClass} placeholder="e.g. 2000" />
              </div>
              <div>
                <FieldLabel htmlFor="length-m" required>Total Span Length (m)</FieldLabel>
                <input id="length-m" required type="number" min="1" step="any" value={form.lengthM} onChange={(event) => setField('lengthM', event.target.value)} className={inputClass} placeholder="Auto-calculated from map" />
              </div>
              <div>
                <FieldLabel htmlFor="height-m" required>Barrier Height (m)</FieldLabel>
                <input id="height-m" required type="number" min="0.5" step="any" value={form.heightM} onChange={(event) => setField('heightM', event.target.value)} className={inputClass} placeholder="e.g. 4.5" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <FieldLabel htmlFor="description">Engineering Notes & Description</FieldLabel>
                <input id="description" value={form.description} onChange={(event) => setField('description', event.target.value)} className={inputClass} placeholder="e.g. High-tensile steel mesh barrier installed on upper mountain slope." />
              </div>
            </div>
          </section>

          {/* Section 3: Interactive Multi-Point Geometry Map */}
          <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border bg-gradient-to-r from-amber-500/10 via-transparent to-transparent px-5 py-4 sm:px-6 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Route className="h-4.5 w-4.5" /></span>
                <div>
                  <h2 className="font-semibold">Start-to-End Multi-Point Barrier Line</h2>
                  <p className="text-xs text-text-muted">Click anywhere on the map to add sequential points (P1, P2... PN) along the mountain slope.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleUndoPoint}
                  disabled={form.coordinates.length === 0}
                  className="px-3 py-1.5 rounded-xl border border-border bg-surface-2 text-xs font-semibold hover:bg-surface-3 transition disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5 inline mr-1" /> Undo Last Point
                </button>
                <button
                  type="button"
                  onClick={handleReversePoints}
                  disabled={form.coordinates.length < 2}
                  className="px-3 py-1.5 rounded-xl border border-border bg-surface-2 text-xs font-semibold hover:bg-surface-3 transition disabled:opacity-40"
                >
                  ⇄ Reverse Direction
                </button>
                <button
                  type="button"
                  onClick={handleClearPoints}
                  disabled={form.coordinates.length === 0}
                  className="px-3 py-1.5 rounded-xl border border-rose-500/30 text-rose-400 bg-rose-500/10 text-xs font-semibold hover:bg-rose-500/20 transition disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Clear All Points
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
              {/* Interactive Map */}
              <div className="lg:col-span-2 relative min-h-[480px] h-[520px] bg-surface-2 border-b lg:border-b-0 lg:border-r border-border">
                <BarrierGeometryMap
                  coordinates={form.coordinates}
                  devices={attachedDevices}
                  barrierType={form.barrierType}
                  locationPoint={locationPoint}
                  locationName={selectedLocation?.name}
                  onAddPoint={handleAddMapPoint}
                  onRemovePoint={handleRemovePoint}
                  theme={resolvedTheme}
                />
              </div>

              {/* Coordinates & Multi-point Inspector */}
              <div className="p-5 flex flex-col justify-between bg-surface-2/40 max-h-[520px] overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Line Coordinates ({validCoordinates.length} Vertices)</span>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {DISTANCE_FORMAT.format(computedTotalLength)} m Span
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {form.coordinates.map((coord, idx) => {
                      const isStart = idx === 0;
                      const isEnd = idx === form.coordinates.length - 1 && form.coordinates.length > 1;
                      const badgeBg = isStart ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : (isEnd ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30');

                      return (
                        <div key={idx} className="p-2.5 rounded-xl border border-border bg-surface flex items-center gap-2 text-xs">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${badgeBg}`}>
                            {isStart ? 'P1 (Start)' : (isEnd ? `P${idx + 1} (End)` : `P${idx + 1}`)}
                          </span>
                          <div className="flex-1 font-mono text-[11px] truncate">
                            {coord.lat}, {coord.lng}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePoint(idx)}
                            className="p-1 hover:bg-rose-500/10 text-text-dim hover:text-danger rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}

                    {form.coordinates.length === 0 && (
                      <div className="py-12 text-center text-xs text-text-dim">
                        <Route className="w-8 h-8 mx-auto mb-2 text-indigo-400 opacity-60 animate-pulse" />
                        Click anywhere on the map to set the starting anchor point (P1), then click along the slope to draw the barrier line.
                      </div>
                    )}
                  </div>
                </div>

                {attachedDevices.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                      {attachedDevices.length} Attached Sensors Mounted
                    </span>
                    <div className="mt-2 space-y-1.5">
                      {attachedDevices.map((d, i) => (
                        <div key={d.id || d._id || i} className="p-2 rounded-lg bg-surface border border-border/50 text-[11px] flex items-center justify-between">
                          <span className="font-semibold">{d.name || d.id}</span>
                          <span className="font-mono text-indigo-400 font-bold">{Math.round(d.asset_position_pct ?? 50)}% Position</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Submit Button Bar */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate('/assets')}
              className="px-5 py-2.5 rounded-xl border border-border bg-surface text-sm font-semibold text-text hover:bg-surface-2 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-md disabled:opacity-50"
            >
              {submitting ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isEdit ? 'Save Barrier Updates' : 'Deploy Barrier Asset'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
