import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_FILE = path.resolve(process.cwd(), '.kino-cache.json');
const TEN_MINUTES = 10 * 60 * 1000;

export async function readCache(key) {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    const entry = cache[key];

    if (!entry || typeof entry.timestamp !== 'number') {
      return null;
    }

    if (Date.now() - entry.timestamp > TEN_MINUTES) {
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export async function writeCache(key, data) {
  let cache = {};

  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }

  cache[key] = {
    timestamp: Date.now(),
    data
  };

  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}
