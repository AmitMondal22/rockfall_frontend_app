const API_URL = import.meta.env.VITE_API_URL || '/api';

const getToken = () => localStorage.getItem('accessToken');

const request = async (url, options = {}) => {
  const token = getToken();
  const config = {
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...options.headers },
    ...options
  };

  const res = await fetch(`${API_URL}${url}`, config);

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) {
      config.headers.Authorization = `Bearer ${getToken()}`;
      const retry = await fetch(`${API_URL}${url}`, config);
      if (!retry.ok) throw new Error((await retry.json()).error || 'Request failed');
      return retry.json();
    }
    localStorage.clear();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.errors?.join(', ') || 'Request failed');
  }
  return res.json();
};

const refreshToken = async () => {
  try {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt })
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('accessToken', data.accessToken);
    return true;
  } catch { return false; }
};

export const api = {
  auth: {
    login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    changePassword: (data) => request('/auth/change-password', { method: 'PUT', body: JSON.stringify(data) })
  },
  devices: {
    getAll: () => request('/devices'),
    getById: (id) => request(`/devices/${id}`),
    create: (data) => request('/devices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateLocation: (id, data) => request(`/devices/${id}/location`, { method: 'PUT', body: JSON.stringify(data) }),
    updateThreshold: (id, data) => request(`/devices/${id}/threshold`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/devices/${id}`, { method: 'DELETE' })
  },
  organizations: {
    getAll: () => request('/organizations'),
    getById: (id) => request(`/organizations/${id}`),
    create: (data) => request('/organizations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/organizations/${id}`, { method: 'DELETE' })
  },
  locations: {
    getAll: (orgId) => request(`/organizations/locations${orgId ? `?organizationId=${orgId}` : ''}`),
    getById: (id) => request(`/organizations/locations/${id}`),
    create: (data) => request('/organizations/locations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/organizations/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id) => request(`/organizations/locations/${id}`, { method: 'DELETE' })
  },
  users: {
    getAll: () => request('/users'),
    getById: (id) => request(`/users/${id}`),
    create: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    assignDevices: (id, devices) => request(`/users/${id}/devices`, { method: 'PUT', body: JSON.stringify({ assignedDevices: devices }) }),
    remove: (id) => request(`/users/${id}`, { method: 'DELETE' })
  },
  alerts: {
    getRules: () => request('/alerts/rules'),
    createRule: (data) => request('/alerts/rules', { method: 'POST', body: JSON.stringify(data) }),
    updateRule: (id, data) => request(`/alerts/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRule: (id) => request(`/alerts/rules/${id}`, { method: 'DELETE' }),
    getLogs: (params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/alerts/logs?${q}`); },
    acknowledge: (id) => request(`/alerts/logs/${id}/acknowledge`, { method: 'PUT' }),
    resolve: (id) => request(`/alerts/logs/${id}/resolve`, { method: 'PUT' })
  },
  historical: {
    getEvents: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/events/${deviceId}?${q}`); },
    getAlerts: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/alerts/${deviceId}?${q}`); },
    getStats: (deviceId, params = {}) => { const q = new URLSearchParams(params).toString(); return request(`/historical/stats/${deviceId}?${q}`); }
  }
};

export default api;
