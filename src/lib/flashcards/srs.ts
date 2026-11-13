/**
 * Spaced repetition (SM-2 inspired), with three student-friendly ratings:
 *  - difficult: relearn — back in 10 minutes, ease drops
 *  - practice:  "need more practice" — tomorrow, small ease drop, streak kept
 *  - know:      grows the interval (1 → 3 → interval × ease) and nudges ease up
 * Difficult cards therefore come back far more often than known ones.
 */
export type Rating = "difficult" | "practice" | "know";
export type CardState = { ease: number; intervalDays: number; repetitions: number };
export type Scheduled = CardState & { dueAt: Date };

const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const clampEase = (e: number) => Math.round(Math.min(MAX_EASE, Math.max(MIN_EASE, e)) * 100) / 100;

export function schedule(card: CardState, rating: Rating, now = new Date()): Scheduled {
  if (rating === "difficult") {
    return { ease: clampEase(card.ease - 0.2), intervalDays: 0, repetitions: 0, dueAt: new Date(now.getTime() + 10 * 60_000) };
  }
  if (rating === "practice") {
    const ease = clampEase(card.ease - 0.05);
    return { ease, intervalDays: 1, repetitions: card.repetitions, dueAt: addDays(now, 1) };
  }
  const repetitions = card.repetitions + 1;
  const ease = clampEase(card.ease + 0.1);
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.min(3650, Math.round(Math.max(card.intervalDays, 1) * ease));
  return { ease, intervalDays, repetitions, dueAt: addDays(now, intervalDays) };
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}
