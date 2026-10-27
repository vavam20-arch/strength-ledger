// Local calendar dates (YYYY-MM-DD) in the device's time zone. Weeks run Monday to Sunday.

export const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const today = (): string => toIso(new Date());

export const parseIso = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
};

export const addDays = (s: string, n: number): string => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return toIso(d);
};

/** Monday of the week containing `s`. */
export const weekKey = (s: string): string => {
  const d = parseIso(s);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(s, -dow);
};

export const daysBetween = (a: string, b: string): number => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);

const fmt = (opts: Intl.DateTimeFormatOptions) => (s: string): string => parseIso(s).toLocaleDateString('en-US', opts);
export const shortDate = fmt({ month: 'short', day: 'numeric' });
export const longDate = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
export const weekdayShort = fmt({ weekday: 'short' });
export const monthTitle = fmt({ month: 'long', year: 'numeric' });

export function relativeDay(s: string): string {
  const d = daysBetween(today(), s);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  if (d === 1) return 'Tomorrow';
  return fmt({ weekday: 'short', month: 'short', day: 'numeric' })(s);
}
