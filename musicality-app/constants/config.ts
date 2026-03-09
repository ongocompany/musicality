// Analysis server URL — mac-mini (local)
// Tailscale: 100.76.69.49 / LAN: 192.168.0.12
export const API_BASE_URL = 'http://192.168.0.12:3900';

// Request timeout in ms (analysis can take a while for long tracks)
export const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes (video files need longer)
