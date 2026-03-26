export const Colors = {
  background: '#0D0D0F',
  surface: '#1A1A1C',
  surfaceLight: '#252528',
  primary: '#D4A854',
  primaryDark: '#B8923E',
  primaryLight: '#E8C878',
  accent: '#C9A96E',
  error: '#E85D75',
  warning: '#E8A830',
  success: '#4CAF50',
  text: '#F5F0E8',
  textSecondary: '#A8A298',
  textMuted: '#5A5750',
  border: '#2A2A2D',
  loopHighlight: 'rgba(212, 168, 84, 0.2)',
  beatPulse: '#D4A854',
  tapAccent: '#E8913A',
};

export const SectionColors: Record<string, string> = {
  intro:   '#4FC3F7',  // light blue
  derecho: '#66BB6A',  // green
  majao:   '#FFA726',  // orange
  mambo:   '#EF5350',  // red
  bridge:  '#AB47BC',  // purple
  outro:   '#78909C',  // blue-grey
};

// ─── Note type identity colors ──────────────────────
export const NoteTypeColors = {
  phraseNote: '#D4A854',   // gold (matches primary)
  choreoNote: '#E8C878',   // light gold
};

// ─── Phrase colors (10-color scheme from coolors.co) ────────────
export const PhraseColors: string[] = [
  '#F9393C',  // red
  '#F9A339',  // orange
  '#F97939',  // deep orange
  '#FAD275',  // yellow
  '#90BE6D',  // green
  '#40A083',  // teal
  '#6687A3',  // steel blue
  '#206683',  // deep blue
];

/** Get phrase color for a phrase index (cycles if > 8 phrases). */
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
  count: 200,
};

export const Fonts = {
  display: 'BebasNeue',  // for count numbers, big headings
};
