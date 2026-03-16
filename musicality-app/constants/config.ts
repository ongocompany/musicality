// Analysis server URL
// Production: https://jinserver.tail3a2ff1.ts.net (jinserver via Tailscale Funnel)
// Legacy: https://api.ritmo.kr (was Cloudflare Tunnel, now points to Vultr VPS)
// Dev Tailscale: 100.68.25.79 (jinserver direct)
export const API_BASE_URL = 'https://jinserver.tail3a2ff1.ts.net';

// Request timeout in ms (analysis can take a while for long tracks)
export const ANALYSIS_TIMEOUT_MS = 300_000; // 5 minutes (video files need longer)
