const SOUND_KEY = 'simplesplit_sound_enabled';
const HINT_PREFIX = 'simplesplit_hint_dismissed_';

export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(SOUND_KEY);
  return stored === null ? true : stored === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_KEY, String(enabled));
}

export function isHintDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HINT_PREFIX + key) === 'true';
}

export function dismissHint(key: string): void {
  localStorage.setItem(HINT_PREFIX + key, 'true');
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
