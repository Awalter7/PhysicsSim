import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.geometry-cache');

function safeKey(key) {
  return String(key).replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  const filepath = path.join(CACHE_DIR, safeKey(key) + '.geom');

  if (!fs.existsSync(filepath)) {
    // Use 404 so the client can detect "no cached file yet" cleanly.
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const buf = fs.readFileSync(filepath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[geometry/load] error:', err);
    return res.status(500).json({ error: err.message });
  }
}