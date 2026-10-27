// Wire format for /api/sync, shared by the app and tests.
import { maxStamp, type SyncedRecord, type Table } from './merge.ts';

export interface PushChange {
  t: Table;
  id: string;
  d: string;
  h: string;
  x: 0 | 1;
}

export interface PullRecord {
  t: Table;
  s: number;
  r: SyncedRecord;
}

export interface SyncResponse {
  accepted: number;
  cursor: number;
  more: boolean;
  serverTime: number;
  records: PullRecord[];
}

export const toChange = (t: Table, r: SyncedRecord): PushChange => ({ t, id: r.id, d: JSON.stringify(r), h: maxStamp(r), x: r.deleted ? 1 : 0 });

/** Sync keys: 30 random characters from an unambiguous alphabet, shown in groups of five. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newSyncKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return chars.match(/.{5}/g)!.join('-');
}
