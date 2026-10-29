// Packing for room messages. Game states and battle records are large, so they
// are gzipped and, when still too big for one Realtime message, split into
// numbered parts that the receiver puts back together.

/** Realtime messages must stay well under the per-message limit. */
export const PART_SIZE = 120_000;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function pack(value: unknown): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream('gzip')));
}

export async function unpack<T>(packed: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await pipe(fromBase64(packed), new DecompressionStream('gzip')))) as T;
}

export function split(packed: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < packed.length; i += PART_SIZE) parts.push(packed.slice(i, i + PART_SIZE));
  return parts.length ? parts : [''];
}

/** Collects the parts of split messages until each one is complete. */
export class Reassembler {
  private pending = new Map<string, { parts: string[]; got: number; at: number }>();

  /** Returns the whole packed message once its last part arrives. */
  add(id: string, index: number, total: number, part: string): string | null {
    if (total === 1) return part;
    let p = this.pending.get(id);
    if (!p) { p = { parts: new Array<string>(total), got: 0, at: Date.now() }; this.pending.set(id, p); }
    if (p.parts[index] === undefined) { p.parts[index] = part; p.got++; }
    // Forget messages that never completed (a part was lost).
    for (const [k, v] of this.pending) if (Date.now() - v.at > 60_000) this.pending.delete(k);
    if (p.got < total) return null;
    this.pending.delete(id);
    return p.parts.join('');
  }
}
