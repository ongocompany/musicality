// Analysis server URL
// Production: https://api.ritmo.kr (jinserver via fixed IP + nginx + Let's Encrypt)
// Legacy: https://jinserver.tail3a2ff1.ts.net (Tailscale Funnel, retired)
// Dev Tailscale: 100.68.25.79 (jinserver direct)
export const API_BASE_URL = 'https://api.ritmo.kr';

// Request timeout in ms (analysis can take a while for long tracks)
export const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes (video files need longer)
