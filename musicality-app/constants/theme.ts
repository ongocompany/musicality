export const Colors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceLight: '#2A2A2A',
  primary: '#BB86FC',
  primaryDark: '#9C64E8',
  accent: '#03DAC6',
  error: '#CF6679',
  warning: '#FFC107',
  success: '#4CAF50',
  text: '#FFFFFF',
  textSecondary: '#B0B0B0',
  textMuted: '#666666',
  border: '#333333',
  loopHighlight: 'rgba(187, 134, 252, 0.2)',
  beatPulse: '#BB86FC',
  tapAccent: '#FF9800',
};

export const SectionColors: Record<string, string> = {
  intro:   '#4FC3F7',  // light blue
  derecho: '#66BB6A',  // green
  majao:   '#FFA726',  // orange
  mambo:   '#EF5350',  // red
  bridge:  '#AB47BC',  // purple
  outro:   '#78909C',  // blue-grey
};

// ─── Phrase rainbow colors (빨주노초파남보) ────────────
export const PhraseColors: string[] = [
  '#FF4444',  // 빨 (red)
  '#FF8C00',  // 주 (orange)
  '#FFD700',  // 노 (yellow)
  '#44BB44',  // 초 (green)
  '#4488FF',  // 파 (blue)
  '#6A5ACD',  // 남 (slate blue – readable on dark bg)
  '#9B59B6',  // 보 (violet)
];

/** Get rainbow color for a phrase index (cycles if > 7 phrases). */
export function getPhraseColor(phraseIndex: number): string {
  return PhraseColors[((phraseIndex % PhraseColors.length) + PhraseColors.length) % PhraseColors.length];
}

/** Linearly blend two hex colors. ratio 0 = color1, 1 = color2. */
export function blendColors(color1: string, color2: string, ratio: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(color1);
  const [r2, g2, b2] = parse(color2);
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 28,
  count: 72,
};
