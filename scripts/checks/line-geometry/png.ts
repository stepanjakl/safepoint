/*
  The one PNG shape a browser screenshot comes in -- 8-bit RGB or RGBA, not
  interlaced -- decoded with node:zlib, so the line checker needs no image
  library. Anything else is refused rather than guessed at.
*/

import { crc32, deflateSync, inflateSync } from 'node:zlib';

export type Pixels = {
  width: number;
  height: number;
  /* RGB, three bytes a pixel; alpha is dropped (screenshots are opaque). */
  data: Uint8Array;
};

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export function decodePng(buffer: Uint8Array): Pixels {
  if (!SIGNATURE.every((byte, i) => buffer[i] === byte)) {
    throw new Error('Not a PNG.');
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
  let width = 0;
  let height = 0;
  let channels = 0;
  const chunks: Uint8Array[] = [];
  for (let at = 8; at < buffer.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...buffer.subarray(at + 4, at + 8));
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || (colour !== 2 && colour !== 6) || interlace !== 0) {
        throw new Error(
          `Unsupported PNG (bit depth ${depth}, colour type ${colour}, interlace ${interlace}).`,
        );
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      chunks.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  const at = (bytes: Uint8Array, i: number) => bytes[i] ?? 0;
  for (let y = 0; y < height; y++) {
    const filter = at(raw, y * (stride + 1));
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = rows.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? at(out, i - channels) : 0;
      const b = prev ? at(prev, i) : 0;
      const c = prev && i >= channels ? at(prev, i - channels) : 0;
      let value = at(src, i);
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`Unknown PNG filter ${filter}.`);
      }
      out[i] = value & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 3);
  for (let p = 0, q = 0; p < width * height; p++, q += channels) {
    data[p * 3] = at(rows, q);
    data[p * 3 + 1] = at(rows, q + 1);
    data[p * 3 + 2] = at(rows, q + 2);
  }
  return { width, height, data };
}

/* RGB in, unfiltered PNG out: for the checker's marked-up screenshots. */
export function encodePng(img: Pixels): Buffer {
  const stride = img.width * 3;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw.set(
      img.data.subarray(y * stride, (y + 1) * stride),
      y * (stride + 1) + 1,
    );
  }
  const chunk = (type: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, 'latin1');
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(img.width, 0);
  header.writeUInt32BE(img.height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
