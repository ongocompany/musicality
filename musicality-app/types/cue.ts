export type CueType = 'click' | 'beep' | 'voice-ko' | 'voice-en' | 'off';

export const CUE_TYPE_LABELS: Record<CueType, string> = {
  off: 'Off',
  click: 'Click',
  beep: 'Beep',
  'voice-ko': '음성 (한국어)',
  'voice-en': 'Voice (EN)',
};
