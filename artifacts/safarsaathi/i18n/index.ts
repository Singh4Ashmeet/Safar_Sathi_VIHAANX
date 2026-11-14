import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en } from './en';
import { hi } from './hi';

export type SupportedLang = 'en' | 'hi';

const DICTS: Record<SupportedLang, typeof en | typeof hi> = { en, hi };

let _currentLang: SupportedLang = 'en';
const _listeners = new Set<(lang: SupportedLang) => void>();
const LANGUAGE_STORAGE_KEY = '@safarsaathi/language';

export function getLanguage(): SupportedLang {
  return _currentLang;
}

export function setLanguage(lang: SupportedLang): void {
  if (_currentLang === lang) return;
  _currentLang = lang;
  _listeners.forEach((fn) => fn(_currentLang));
  void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang).catch(() => undefined);
}

export async function loadLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'hi') setLanguage(stored);
  } catch {
    // Keep English when storage is unavailable (for example in a web preview).
  }
}

export function t(path: string): string {
  const parts = path.split('.');
  let cur: unknown = DICTS[_currentLang];
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      cur = undefined;
      break;
    }
  }
  if (typeof cur === 'string') return cur;

  // Fallback to English
  let fallback: unknown = en;
  for (const part of parts) {
    if (fallback && typeof fallback === 'object' && part in (fallback as Record<string, unknown>)) {
      fallback = (fallback as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof fallback === 'string' ? fallback : path;
}

export function useLanguage(): [SupportedLang, (lang: SupportedLang) => void] {
  const [lang, setLang] = useState<SupportedLang>(_currentLang);
  useEffect(() => {
    setLang(_currentLang);
    _listeners.add(setLang);
    return () => {
      _listeners.delete(setLang);
    };
  }, []);
  return [lang, setLanguage];
}

