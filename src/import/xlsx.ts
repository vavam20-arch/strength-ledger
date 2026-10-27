// Minimal, dependency-free .xlsx reader (works in browsers and Node 18+).
// Reads the ZIP container with DecompressionStream('deflate-raw') and extracts cell text.
// Scope: plain worksheets (shared strings, inline strings, numbers). No formulas, styles or dates-as-serials.

const sig = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const u16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function listEntries(b: Uint8Array): ZipEntry[] {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (sig(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP/XLSX file (no end-of-directory record).');
  const count = u16(b, eocd + 10);
  let p = sig(b, eocd + 16);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (sig(b, p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.');
    const method = u16(b, p + 10);
    const compressedSize = sig(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const localOffset = sig(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(b: Uint8Array, e: ZipEntry): Promise<string> {
  const p = e.localOffset;
  if (sig(b, p) !== 0x04034b50) throw new Error(`Corrupt ZIP entry ${e.name}.`);
  const start = p + 30 + u16(b, p + 26) + u16(b, p + 28);
  const raw = b.subarray(start, start + e.compressedSize);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflateRaw(raw) : null;
  if (!bytes) throw new Error(`Unsupported ZIP compression method ${e.method} in ${e.name}.`);
  return new TextDecoder().decode(bytes);
}

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
}

const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1] ?? '')).join('');

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Returns every worksheet as rows of cell text ('' for empty cells). */
export async function readXlsx(bytes: Uint8Array): Promise<Map<string, string[][]>> {
  const entries = listEntries(bytes);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const get = async (name: string): Promise<string | null> => {
    const e = byName.get(name);
    return e ? readEntry(bytes, e) : null;
  };
  const shared: string[] = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1] ?? ''));

  const wb = (await get('xl/workbook.xml')) ?? '';
  const rels = (await get('xl/_rels/workbook.xml.rels')) ?? '';
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1] ?? '')?.[1];
    const t = /\bTarget="([^"]+)"/.exec(m[1] ?? '')?.[1];
    if (id && t) target.set(id, t.startsWith('/') ? t.slice(1) : `xl/${t}`);
  }
  const sheets = new Map<string, string[][]>();
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const name = decodeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const path = target.get(rid);
    const xml = path ? await get(path) : null;
    const rows: string[][] = [];
    if (xml) {
      for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const rIdx = Number(/\br="(\d+)"/.exec(r[1] ?? '')?.[1] ?? rows.length + 1) - 1;
        const row: string[] = [];
        for (const c of (r[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const ca = c[1] ?? '';
          const ref = /\br="([A-Z]+\d+)"/.exec(ca)?.[1];
          const t = /\bt="([^"]+)"/.exec(ca)?.[1] ?? 'n';
          const inner = c[2] ?? '';
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          let text = '';
          if (t === 's' && v != null) text = shared[Number(v)] ?? '';
          else if (t === 'inlineStr') text = textOf(inner);
          else if (v != null) text = decodeXml(v);
          const ci = ref ? colIndex(ref) : row.length;
          while (row.length < ci) row.push('');
          row[ci] = text;
        }
        while (rows.length < rIdx) rows.push([]);
        rows[rIdx] = row;
      }
    }
    sheets.set(name, rows);
  }
  return sheets;
}

/** SHA-256 fingerprint, hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
