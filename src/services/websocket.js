const getWebSocketBaseUrl = () => {
  const configured = import.meta.env.VITE_WS_URL;
  if (typeof window === 'undefined') return configured || 'ws://localhost:3310';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (!configured || configured === '/ws') return `${protocol}//${window.location.host}`;
  if (configured.startsWith('/')) {
    return `${protocol}//${window.location.host}${configured.replace(/\/ws\/?$/, '')}`;
  }
  return configured.replace(/\/$/, '').replace(/\/ws$/, '');
};

const WS_URL = getWebSocketBaseUrl();

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 30000;
    this.currentDelay = this.reconnectDelay;
    this.isManualClose = false;
    this.channel = '/ws/dashboard';
  }

  connect(channel = '/ws/dashboard') {
    this.channel = channel;
    this.isManualClose = false;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem('accessToken') || '';
    const url = `${WS_URL}${channel}${token ? `?token=${token}` : ''}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] Connected to', channel);
        this.currentDelay = this.reconnectDelay;
        this._emit('ws_status', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Backend sends { type, deviceId, data } format
          const eventName = msg.type || msg.event;
          if (eventName) {
            this._emit(eventName, msg);
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err.message);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this._emit('ws_status', { connected: false });
        if (!this.isManualClose) {
          this._scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        console.warn('[WS] Error occurred');
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log(`[WS] Reconnecting in ${this.currentDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.channel);
      this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectDelay);
    }, this.currentDelay);
  }

  disconnect() {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (err) { console.error(`[WS] Listener error for '${event}':`, err); }
    });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
export default wsService;
