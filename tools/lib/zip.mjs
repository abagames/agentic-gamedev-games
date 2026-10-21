// Reads the zip a review session downloads (tools/review/review.js writes it stored, without
// compression). Deflated entries are read too, in case a person re-packs the file.
import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";

const { crc32, makeZip } = createRequire(import.meta.url)("../review/review.js");
export { makeZip };

export function readZip(buf) {
  const b = Buffer.from(buf);
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("not a zip file (no end-of-directory record)");
  const count = b.readUInt16LE(end + 10);
  let at = b.readUInt32LE(end + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(at) !== 0x02014b50) throw new Error("zip central directory is damaged");
    const method = b.readUInt16LE(at + 10);
    const crc = b.readUInt32LE(at + 16);
    const size = b.readUInt32LE(at + 20);
    const nameLen = b.readUInt16LE(at + 28);
    const extraLen = b.readUInt16LE(at + 30);
    const commentLen = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.toString("utf8", at + 46, at + 46 + nameLen);
    at += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const raw = b.subarray(start, start + size);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`zip entry ${name} uses unsupported method ${method}`);
    if (crc32(data) !== crc) throw new Error(`zip entry ${name} fails its checksum`);
    files.set(name, data);
  }
  return files;
}
