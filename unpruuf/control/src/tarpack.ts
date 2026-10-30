import * as zlib from "zlib";

/** A small ustar writer, so Control needs no `tar` program (Windows has none by default). */
export interface TarEntry {
  name: string; // "/" separated, relative
  data: Buffer;
  mode?: number;
}

function octal(n: number, len: number): string {
  return n.toString(8).padStart(len - 1, "0") + "\0";
}

function header(name: string, size: number, mode: number): Buffer {
  const h = Buffer.alloc(512, 0);
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error("path too long for tar: " + name);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base, 0, 100, "utf8");
  h.write(octal(mode, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(0, 12), 136); // fixed mtime: the same input gives the same bytes (and the same sha256)
  h.write("        ", 148); // checksum placeholder
  h.write("0", 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += h[i];
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  return h;
}

export function packTarGz(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const e of [...entries].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    parts.push(header(e.name, e.data.length, e.mode ?? 0o644), e.data);
    const pad = (512 - (e.data.length % 512)) % 512;
    if (pad) parts.push(Buffer.alloc(pad, 0));
  }
  parts.push(Buffer.alloc(1024, 0));
  // gzip header carries a time stamp field: level fixed, mtime zero by zlib's default for Buffer input
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 });
}
