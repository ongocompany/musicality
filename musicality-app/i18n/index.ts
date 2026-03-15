import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import ko from '../locales/ko.json';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import zhCN from '../locales/zh-CN.json';
import zhTW from '../locales/zh-TW.json';
import es from '../locales/es.json';
import pt from '../locales/pt.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import ru from '../locales/ru.json';

export const LANGUAGES = [
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'zh-CN', label: '中文(简体)', flag: '🇨🇳' },
  { code: 'zh-TW', label: '中文(繁體)', flag: '🇹🇼' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

const resources = {
  ko: { translation: ko },
  en: { translation: en },
  ja: { translation: ja },
  'zh-CN': { translation: zhCN },
  'zh-TW': { translation: zhTW },
  es: { translation: es },
  pt: { translation: pt },
  fr: { translation: fr },
  de: { translation: de },
  ru: { translation: ru },
};

/** Detect best matching language from device locale */
export function detectDeviceLanguage(): LanguageCode {
  const locale = Localization.getLocales()[0]?.languageTag ?? 'en';
  const lang = locale.split('-')[0];

  // Chinese: check region for simplified vs traditional
  if (lang === 'zh') {
    const region = locale.split('-')[1]?.toUpperCase();
    if (['TW', 'HK', 'MO', 'HANT'].includes(region)) return 'zh-TW';
    return 'zh-CN';
  }

  const supported = LANGUAGES.map(l => l.code);
  if (supported.includes(lang as LanguageCode)) return lang as LanguageCode;
  return 'en'; // fallback
}

i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // will be overridden by settingsStore
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

export default i18next;
