import React, { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import {
  Mountain,
  Users,
  Move,
  Heart,
  Zap,
  Radio,
  AlertTriangle,
  Activity
} from 'lucide-react';

/**
 * 100% Free Tile Providers — Completely Free, NO Watermarks, NO API Key Required!
 * Hosted on public ArcGIS and OpenStreetMap infrastructure.
 */
export const FREE_TILE_LAYERS = {
  esriDark: {
    id: 'esriDark',
    name: 'Dark Canvas',
    category: 'dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16
  },
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    category: 'street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: 'abc'
  },
  osmHot: {
    id: 'osmHot',
    name: 'Humanitarian (HOT)',
    category: 'light',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by <a href="https://www.hotosm.org/">Humanitarian OpenStreetMap Team</a>',
    maxZoom: 19,
    subdomains: 'abc'
  },
  esriSatellite: {
    id: 'esriSatellite',
    name: 'Satellite View',
    category: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19
  },
  esriStreet: {
    id: 'esriStreet',
    name: 'World Street',
    category: 'street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS',
    maxZoom: 19
  },
  esriTopo: {
    id: 'esriTopo',
    name: 'Topographic / Terrain',
    category: 'topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom',
    maxZoom: 19
  }
};

/**
 * Returns default free tile provider matching the user's current color theme.
 * Clean, watermark-free dark and light maps.
 */
export const getDefaultFreeTile = (isDark = true) => {
  return isDark ? FREE_TILE_LAYERS.esriDark : FREE_TILE_LAYERS.osm;
};

export const STATUS_COLORS = {
  ONLINE: '#22c55e',
  ALERT: '#ef4444',
  MAINTENANCE: '#f59e0b',
  OFFLINE: '#94a3b8'
};

export const EVENT_REACT_ICONS = {
  ROCKFALL: Mountain,
  HUMAN_ACTIVITY: Users,
  HUMAN: Users,
  MOTION: Move,
  HEARTBEAT: Heart,
  ALERT: AlertTriangle,
  OTHER: Zap
};

/**
 * Creates custom SVG/HTML divIcon for sensors and devices using Lucide React icons.
 * Zero string emojis, pure React vector icons.
 */
export const createDeviceMarkerIcon = ({
  status = 'ONLINE',
  isDark = true,
  eventType = null,
  selected = false,
  size = 32
}) => {
  const color = STATUS_COLORS[status] || '#64748b';
  const isAlert = status === 'ALERT';
  const iconSize = selected ? size + 10 : size;
  const half = Math.round(iconSize / 2);

  const pulseRing = (isAlert || selected)
    ? `<div style="position:absolute;inset:-8px;border-radius:50%;background:${color};opacity:0.35;animation:subtlePulse 1.5s infinite;pointer-events:none;"></div>`
    : '';

  const IconComponent = isAlert
    ? AlertTriangle
    : (eventType && EVENT_REACT_ICONS[eventType] ? EVENT_REACT_ICONS[eventType] : Radio);

  const iconElement = React.createElement(IconComponent, {
    size: Math.round(iconSize * 0.48),
    color: '#ffffff',
    strokeWidth: 2.2
  });

  const reactIconHtml = renderToString(iconElement);

  return L.divIcon({
    className: 'custom-sensor-marker',
    iconSize: [iconSize, iconSize],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
    html: `
      <div style="position:relative;width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;">
        ${pulseRing}
        <div style="
          width:${iconSize}px;
          height:${iconSize}px;
          border-radius:50%;
          background:${color};
          border:3px solid ${isDark ? '#111827' : '#ffffff'};
          box-shadow:0 4px 14px ${color}66, 0 1px 3px rgba(0,0,0,0.3);
          display:flex;
          align-items:center;
          justify-content:center;
          transition:transform 0.2s ease;
          ${selected ? 'transform: scale(1.15);' : ''}
        ">
          ${reactIconHtml}
        </div>
      </div>
    `
  });
};

/**
 * Controller to smoothly fit map bounds to given coordinate points
 */
export function MapBoundsFitter({ points = [], maxZoom = 15, padding = [40, 40] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !points || points.length === 0) return;
    const valid = points.filter(p => p && p.lat != null && p.lng != null && !isNaN(Number(p.lat)) && !isNaN(Number(p.lng)));
    if (valid.length === 0) return;

    if (valid.length === 1) {
      map.setView([Number(valid[0].lat), Number(valid[0].lng)], Math.min(14, maxZoom), { animate: true });
      return;
    }

    const bounds = L.latLngBounds(valid.map(p => [Number(p.lat), Number(p.lng)]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding, maxZoom, animate: true });
    }
  }, [map, points, maxZoom]);

  return null;
}

/**
 * Controller to fly map to focused coordinate
 */
export function MapFlyTo({ lat, lng, zoom = 15 }) {
  const map = useMap();

  useEffect(() => {
    if (map && lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      map.flyTo([Number(lat), Number(lng)], zoom, {
        duration: 1.2,
        easeLinearity: 0.25
      });
    }
  }, [map, lat, lng, zoom]);

  return null;
}

/**
 * Controller to trigger invalidateSize when container mounts or expands
 */
export function MapResizer() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const t = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * Map click listener component
 */
export function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      if (onClick) onClick(e.latlng);
    }
  });
  return null;
}
