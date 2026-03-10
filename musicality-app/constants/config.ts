// Analysis server URL
// LAN: 192.168.0.75 (notebook) / mac-mini: 192.168.0.12
// Tailscale: 100.68.25.79 (jinserver — works anywhere)
export const API_BASE_URL = 'http://100.68.25.79:3900';

// Request timeout in ms (analysis can take a while for long tracks)
export const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes (video files need longer)
