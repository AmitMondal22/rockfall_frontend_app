const getApiUrl = () => {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) {
    return `${envBaseUrl.replace(/\/$/, '')}/api`;
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== '/api' && !envUrl.includes('iotblitz.in')) return envUrl;
  if (typeof window !== 'undefined') {
    if (window.location.port === '5173' || window.location.port === '5174') {
      return `${window.location.protocol}//${window.location.hostname}:3000/api`;
    }
    return '/api';
  }
  return 'http://localhost:3000/api';
};

const API_URL = getApiUrl();

const getToken = () => localStorage.getItem('accessToken');

const request = async (url, options = {}) => {
  const token = getToken();
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    }
  };

  const response = await fetch(`${API_URL}${url}`, config);
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
  }
  return response.json();
};

export const api = {
  auth: {
    login: (credentials) => request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (data) => request('/auth/change-password', { method: 'PUT', body: JSON.stringify(data) })
  },
  devices: {
    getAll: () => request('/devices'),
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, device: null });
      return request(`/devices/${encodeURIComponent(id)}`);
    },
    getAsset: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, asset: null });
      return request(`/devices/${encodeURIComponent(id)}/asset`);
    },
    create: (data) => request('/devices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/devices/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateLocation: (id, data) => request(`/devices/${encodeURIComponent(id)}/location`, { method: 'PUT', body: JSON.stringify(data) }),
    updateThreshold: (id, data) => request(`/devices/${encodeURIComponent(id)}/threshold`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  organizations: {
    getAll: () => request('/organizations'),
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, organization: null });
      return request(`/organizations/${encodeURIComponent(id)}`);
    },
    create: (data) => request('/organizations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/organizations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    uploadLogo: (id, logoData) => request(id ? `/organizations/${encodeURIComponent(id)}/logo` : '/organizations/upload-logo', {
      method: 'POST',
      body: JSON.stringify(typeof logoData === 'string' ? { logo: logoData } : logoData)
    }),
    remove: (id) => request(`/organizations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  projects: {
    getAll: (params = {}) => {
      const q = new URLSearchParams();
      if (typeof params === 'string') {
        q.append('org_id', params);
      } else {
        Object.entries(params).forEach(([k, v]) => { if (v) q.append(k, v); });
      }
      const qs = q.toString();
      return request(`/projects${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, project: null });
      return request(`/projects/${encodeURIComponent(id)}`);
    },
    create: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  locations: {
    getAll: (orgId, projectId) => {
      const q = new URLSearchParams();
      if (orgId && orgId !== 'undefined') q.append('organizationId', orgId);
      if (projectId && projectId !== 'undefined') q.append('projectId', projectId);
      const qs = q.toString();
      return request(`/organizations/locations${qs ? `?${qs}` : ''}`);
    },
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, location: null });
      return request(`/organizations/locations/${encodeURIComponent(id)}`);
    },
    create: (data) => request('/organizations/locations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/organizations/locations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/organizations/locations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  users: {
    getAll: () => request('/users'),
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, user: null });
      return request(`/users/${encodeURIComponent(id)}`);
    },
    create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/users/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    assignDevices: (id, devices) => request(`/users/${encodeURIComponent(id)}/devices`, { method: 'PUT', body: JSON.stringify({ assignedDevices: devices }) }),
    remove: (id) => request(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  alerts: {
    getRules: () => request('/alerts/rules'),
    createRule: (data) => request('/alerts/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id, data) => request(`/alerts/rules/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id) => request(`/alerts/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getLogs: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/alerts/logs?${q}`); },
    acknowledge: (id) => request(`/alerts/logs/${encodeURIComponent(id)}/acknowledge`, { method: 'PUT' }),
    resolve: (id) => request(`/alerts/logs/${encodeURIComponent(id)}/resolve`, { method: 'PUT' })
  },
  historical: {
    getEvents: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/events/${deviceId || 'all'}?${q}`); },
    getAlerts: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/alerts/${deviceId || 'all'}?${q}`); },
    getStats: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/stats/${deviceId || 'all'}?${q}`); }
  },
  analytics: {
    getSummary: (timeWindow = '24h', options = {}) => request(`/historical/analytics/summary?window=${timeWindow}`, options)
  },
  assets: {
    getInventory: (params = {}) => {
      const q = typeof params === 'object' ? new URLSearchParams(params).toString() : '';
      return request(`/assets/list${q ? `?${q}` : ''}`);
    },
    getAll: (orgId, locationId) => {
      const q = new URLSearchParams();
      if (orgId && orgId !== 'undefined') q.append('org_id', orgId);
      if (locationId && locationId !== 'undefined') q.append('location_id', locationId);
      const qs = q.toString();
      return request(`/assets/list${qs ? `?${qs}` : ''}`);
    },
    create: (data) => request('/assets', { method: 'POST', body: JSON.stringify(data) }),
    getById: (id) => {
      if (!id || id === 'undefined' || id === 'null') return Promise.resolve({ success: true, asset: null });
      return request(`/assets/${encodeURIComponent(id)}`);
    },
    update: (id, data) => request(`/assets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    delete: (id) => request(`/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getAvailableDevices: (id) => request(`/assets/${encodeURIComponent(id)}/available-devices`),
    attachDevice: (assetId, deviceId, positionPct, extra = {}) => {
      const payload = typeof positionPct === 'object' ? positionPct : { positionPct, assetPositionPct: positionPct, ...extra };
      return request(`/assets/${encodeURIComponent(assetId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(payload) });
    },
    attachExistingDevice: (assetId, deviceId, data) => request(`/assets/${encodeURIComponent(assetId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'PUT', body: JSON.stringify(data) }),
    detachDevice: (assetId, deviceId) => request(`/assets/${encodeURIComponent(assetId)}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
    getAnalysis: (id, range = '24h') => request(`/assets/${encodeURIComponent(id)}/analysis?${new URLSearchParams({ range })}`)
  },
  reports: {
    generate: (params = {}, maybeDate) => {
      if (typeof params === 'string') {
        const query = new URLSearchParams({ type: params });
        if (maybeDate) query.append('date', maybeDate);
        return request(`/historical/reports/generate?${query.toString()}`);
      }
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') query.append(k, v);
      });
      return request(`/historical/reports/generate?${query.toString()}`);
    }
  }
};

export default api;
