import { prefersReducedMotion } from './settings';

export async function burstConfetti(durationMs = 3000): Promise<void> {
  if (prefersReducedMotion() || typeof window === 'undefined') return;

  try {
    const confetti = (await import('canvas-confetti')).default;
    const end = Date.now() + durationMs;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#C4622D', '#E8956D', '#F5D4C1', '#2D7A4F'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#C4622D', '#E8956D', '#F5D4C1', '#2D7A4F'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };

    frame();
  } catch {
    // confetti optional
  }
}
