import type { CardioEntry, Measurement, PushupEntry, Session, SetEntry } from '../model.ts';

export interface ImportIssue {
  kind:
    | 'blank-row'
    | 'possible-split-session'
    | 'late-entry'
    | 'possible-duplicate'
    | 'activity-renamed'
    | 'assumed-unit'
    | 'swap'
    | 'unfinished-session';
  message: string;
  ids: string[];
}

export interface ImportResult {
  source: 'fitbod' | 'earlier-app';
  fileName: string;
  fingerprint: string;
  sessions: Session[];
  sets: SetEntry[];
  cardio: CardioEntry[];
  pushups: PushupEntry[];
  measurements: Measurement[];
  issues: ImportIssue[];
  totals: Record<string, number>;
}

export const TIME_ZONE = 'America/New_York';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Local calendar date (YYYY-MM-DD) of a UTC instant in the user's time zone. */
export const localDate = (isoUtc: string): string => fmt.format(new Date(isoUtc));
