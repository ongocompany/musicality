// Analysis server URL
// Production: https://api.ritmo.kr (jinserver via Cloudflare Tunnel)
// Dev LAN: 192.168.0.75 (notebook) / mac-mini: 192.168.0.12
// Dev Tailscale: 100.68.25.79 (jinserver)
export const API_BASE_URL = 'https://api.ritmo.kr';

// Request timeout in ms (analysis can take a while for long tracks)
export const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes (video files need longer)
