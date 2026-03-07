import { CueType } from '../types/cue';

/**
 * Build-time asset mapping for cue sounds.
 * require() must be static — no dynamic paths.
 *
 * For click/beep: count 1,5 → high, count 4,8 → tap, rest → low
 * For voice: each count has its own numbered file
 */

const clickSounds = {
  high: require('../assets/sounds/click_high.wav'),
  low: require('../assets/sounds/click_low.wav'),
  tap: require('../assets/sounds/click_tap.wav'),
};

const beepSounds = {
  high: require('../assets/sounds/beep_high.wav'),
  low: require('../assets/sounds/beep_low.wav'),
  tap: require('../assets/sounds/beep_tap.wav'),
};

const voiceKo: Record<number, any> = {
  1: require('../assets/sounds/count_ko_1.wav'),
  2: require('../assets/sounds/count_ko_2.wav'),
  3: require('../assets/sounds/count_ko_3.wav'),
  4: require('../assets/sounds/count_ko_4.wav'),
  5: require('../assets/sounds/count_ko_5.wav'),
  6: require('../assets/sounds/count_ko_6.wav'),
  7: require('../assets/sounds/count_ko_7.wav'),
  8: require('../assets/sounds/count_ko_8.wav'),
};

const voiceEn: Record<number, any> = {
  1: require('../assets/sounds/count_en_1.wav'),
  2: require('../assets/sounds/count_en_2.wav'),
  3: require('../assets/sounds/count_en_3.wav'),
  4: require('../assets/sounds/count_en_4.wav'),
  5: require('../assets/sounds/count_en_5.wav'),
  6: require('../assets/sounds/count_en_6.wav'),
  7: require('../assets/sounds/count_en_7.wav'),
  8: require('../assets/sounds/count_en_8.wav'),
};

/**
 * Get the sound asset for a given cue type and count (1-8).
 */
export function getCueSound(cueType: CueType, count: number): any | null {
  switch (cueType) {
    case 'click': {
      if (count === 1 || count === 5) return clickSounds.high;
      if (count === 4 || count === 8) return clickSounds.tap;
      return clickSounds.low;
    }
    case 'beep': {
      if (count === 1 || count === 5) return beepSounds.high;
      if (count === 4 || count === 8) return beepSounds.tap;
      return beepSounds.low;
    }
    case 'voice-ko':
      return voiceKo[count] ?? null;
    case 'voice-en':
      return voiceEn[count] ?? null;
    case 'off':
      return null;
  }
}

/**
 * Get all unique sound assets for a cue type (for preloading).
 */
export function getAllCueSounds(cueType: CueType): any[] {
  switch (cueType) {
    case 'click':
      return [clickSounds.high, clickSounds.low, clickSounds.tap];
    case 'beep':
      return [beepSounds.high, beepSounds.low, beepSounds.tap];
    case 'voice-ko':
      return Object.values(voiceKo);
    case 'voice-en':
      return Object.values(voiceEn);
    case 'off':
      return [];
  }
}
