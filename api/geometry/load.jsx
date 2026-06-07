import fs from 'fs';
import path from 'path';

// Directory where geometry binary files live. Created on first write.
const CACHE_DIR = path.join(process.cwd(), '.geometry-cache');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Sanitize the cache key so it's safe to use as a filename.
 * Strips anything that isn't alphanumeric, dash, underscore, or dot.
 */
function safeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

export const config = {
  api: {
    bodyParser: {
      // Geometry payloads can be large; bump the default 1mb limit.
      sizeLimit: '50mb',
    },
  },
};

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    ensureCacheDir();

    const { key, positions, normals, indices } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Missing key' });
    if (!Array.isArray(positions) || !Array.isArray(normals) || !Array.isArray(indices)) {
      return res.status(400).json({ error: 'Missing geometry arrays' });
    }

    // Pack the three typed-array buffers + a small header into one file.
    // Layout:
    //   [4 bytes] positions byteLength
    //   [4 bytes] normals   byteLength
    //   [4 bytes] indices   byteLength
    //   [Float32Array] positions
    //   [Float32Array] normals
    //   [Uint32Array]  indices
    const positionsBuf = new Float32Array(positions);
    const normalsBuf   = new Float32Array(normals);
    const indicesBuf   = new Uint32Array(indices);

    const header = new Uint32Array([
      positionsBuf.byteLength,
      normalsBuf.byteLength,
      indicesBuf.byteLength,
    ]);

    const total =
      header.byteLength +
      positionsBuf.byteLength +
      normalsBuf.byteLength +
      indicesBuf.byteLength;

    const out = Buffer.alloc(total);
    let offset = 0;
    Buffer.from(header.buffer).copy(out, offset);            offset += header.byteLength;
    Buffer.from(positionsBuf.buffer).copy(out, offset);      offset += positionsBuf.byteLength;
    Buffer.from(normalsBuf.buffer).copy(out, offset);        offset += normalsBuf.byteLength;
    Buffer.from(indicesBuf.buffer).copy(out, offset);

    const filename = safeKey(key) + '.geom';
    const filepath = path.join(CACHE_DIR, filename);
    fs.writeFileSync(filepath, out);

    return res.status(200).json({ ok: true, file: filename, bytes: total });
  } catch (err) {
    console.error('[geometry/save] error:', err);
    return res.status(500).json({ error: err.message });
  }
}