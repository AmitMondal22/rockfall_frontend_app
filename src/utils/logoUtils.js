import blackLogo from '../assets/black_logo.png';
import whiteLogo from '../assets/white_logo.png';

export const getDefaultLogo = (isDark = false) => {
  return isDark ? whiteLogo : blackLogo;
};

export const resolveLogoUrl = (rawUrl, isDark = false) => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return getDefaultLogo(isDark);
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) return getDefaultLogo(isDark);

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envBaseUrl) {
    const base = envBaseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }

  if (typeof window !== 'undefined' && (window.location.port === '5173' || window.location.port === '5174')) {
    return `${window.location.protocol}//${window.location.hostname}:3000${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
  }

  return trimmed;
};

export default {
  getDefaultLogo,
  resolveLogoUrl
};
