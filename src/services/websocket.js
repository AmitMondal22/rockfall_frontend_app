const getWebSocketBaseUrl = () => {
  let configured = import.meta.env.VITE_WS_URL;
  if (typeof window === 'undefined') return configured || 'ws://localhost:3310';

  const isHttps = window.location.protocol === 'https:';
  const defaultProtocol = isHttps ? 'wss:' : 'ws:';

  if (!configured || configured === '/ws') {
    return `${defaultProtocol}//${window.location.host}`;
  }

  if (configured.startsWith('/')) {
    return `${defaultProtocol}//${window.location.host}${configured.replace(/\/ws\/?$/, '')}`;
  }

  let url = configured.replace(/\/$/, '').replace(/\/ws$/, '');

  // Upgrade or normalize protocol
  if (url.startsWith('https://')) {
    url = url.replace('https://', 'wss://');
  } else if (url.startsWith('http://')) {
    url = url.replace('http://', isHttps ? 'wss://' : 'ws://');
  } else if (isHttps && url.startsWith('ws://')) {
    url = url.replace('ws://', 'wss://');
  }

  return url;
};

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
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.channel === channel) {
        return;
      }
      // If switching channels, disconnect old one first
      this.disconnect();
    }

    this.channel = channel;
    this.isManualClose = false;

    const baseUrl = getWebSocketBaseUrl();
    const token = localStorage.getItem('accessToken') || '';
    const url = `${baseUrl}${channel}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        if (this.isManualClose) {
          try { this.ws?.close(); } catch (_) {}
          return;
        }
        console.log('[WS] Connected to', channel);
        this.currentDelay = this.reconnectDelay;
        this._emit('ws_status', { connected: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const eventName = msg.type || msg.event;
          if (eventName) {
            this._emit(eventName, msg);
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err.message);
        }
      };

      this.ws.onclose = (event) => {
        if (this.isManualClose) return;
        console.log('[WS] Disconnected');
        this._emit('ws_status', { connected: false });
        this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        if (this.isManualClose) return;
        console.warn('[WS] Connection issue, will retry...');
      };
    } catch (err) {
      if (!this.isManualClose) {
        console.error('[WS] Connection failed:', err.message);
        this._scheduleReconnect();
      }
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.isManualClose) return;
    console.log(`[WS] Reconnecting in ${this.currentDelay / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isManualClose) {
        this.connect(this.channel);
        this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxReconnectDelay);
      }
    }, this.currentDelay);
  }

  disconnect() {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;

      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, 'Normal closure');
        } else if (socket.readyState === WebSocket.CONNECTING) {
          // Avoid browser error "WebSocket is closed before the connection is established"
          socket.onopen = () => {
            try { socket.close(1000, 'Closed on unmount'); } catch (_) {}
          };
        }
      } catch (_) {}
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
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
