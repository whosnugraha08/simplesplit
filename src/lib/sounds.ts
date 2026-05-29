import { getSoundEnabled } from './settings';

let hasUserInteracted = false;

export function markUserInteracted(): void {
  hasUserInteracted = true;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume = 0.3,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(volume * 0.6, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

export function playScanCompleteSound(): void {
  if (!getSoundEnabled() || !hasUserInteracted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 880, t, 0.08, 0.25);
  playTone(ctx, 1175, t + 0.1, 0.15, 0.2);
}

export function playPaidSound(): void {
  if (!getSoundEnabled() || !hasUserInteracted) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(ctx, 523, t, 0.15, 0.25);
  playTone(ctx, 659, t + 0.12, 0.15, 0.22);
  playTone(ctx, 784, t + 0.24, 0.2, 0.2);
}
