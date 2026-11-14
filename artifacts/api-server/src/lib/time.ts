/**
 * Time utility helpers for epoch-millisecond timestamps UTC.
 * All DB timestamps are integers (epoch ms) per TRD section 9.
 */

export function nowEpochMs(): number {
  return Date.now();
}

export function toEpochMs(date: Date | string | number): number {
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
}

export function fromEpochMs(ms: number): Date {
  return new Date(ms);
}

export function addSeconds(epochMs: number, seconds: number): number {
  return epochMs + seconds * 1000;
}

export function addMinutes(epochMs: number, minutes: number): number {
  return epochMs + minutes * 60 * 1000;
}

export function addDays(epochMs: number, days: number): number {
  return epochMs + days * 24 * 60 * 60 * 1000;
}

export function isExpired(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}

export function diffSeconds(laterMs: number, earlierMs: number): number {
  return Math.floor((laterMs - earlierMs) / 1000);
}

