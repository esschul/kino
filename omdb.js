import { readCache, writeCache } from './cache.js';

const OMDB_ENDPOINT = 'https://www.omdbapi.com/';

function normalizeTitle(title) {
  if (typeof title !== 'string') {
    return '';
  }

  return title.trim().replace(/^"(.*)"$/, '$1');
}

function getApiKey() {
  const apiKey = process.env.OMDB_API_KEY;
  return typeof apiKey === 'string' ? apiKey.trim() : '';
}

function hasApiKey() {
  return Boolean(getApiKey());
}

function normalizeForCompare(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('nb')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function omdbRequest(params) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  const url = new URL(OMDB_ENDPOINT);
  url.searchParams.set('apikey', apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OMDb request failed with status ${response.status}`);
  }

  return response.json();
}

function ratingFromPayload(payload) {
  if (!payload) {
    return '';
  }

  if (
    payload?.Response === 'True' &&
    typeof payload?.imdbRating === 'string' &&
    payload.imdbRating !== 'N/A'
  ) {
    return payload.imdbRating;
  }
  return '';
}

function scoreTitleMatch(queryTitle, candidateTitle) {
  const q = normalizeForCompare(queryTitle);
  const c = normalizeForCompare(candidateTitle);
  if (!q || !c) {
    return 0;
  }
  if (q === c) {
    return 1000;
  }
  if (c.includes(q) || q.includes(c)) {
    return 700;
  }

  const qTokens = new Set(q.split(' ').filter(Boolean));
  const cTokens = new Set(c.split(' ').filter(Boolean));
  const intersection = [...qTokens].filter((token) => cTokens.has(token)).length;
  return intersection;
}

async function getRatingForTitle(title) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) {
    return '';
  }

  const cacheKey = `omdb:rating:${normalizedTitle.toLocaleLowerCase('nb')}`;
  const cached = await readCache(cacheKey);
  if (typeof cached === 'string') {
    return cached;
  }

  let rating = '';

  if (!rating) {
    const payload = await omdbRequest({ t: normalizedTitle, type: 'movie' });
    rating = ratingFromPayload(payload);
  }

  if (!rating) {
    const searchPayload = await omdbRequest({ s: normalizedTitle, type: 'movie' });
    const candidates = Array.isArray(searchPayload?.Search) ? searchPayload.Search : [];
    const scored = candidates
      .map((item) => ({
        imdbId: item.imdbID,
        title: item.Title,
        score: scoreTitleMatch(normalizedTitle, item.Title)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    for (const candidate of scored) {
      if (!candidate.imdbId) {
        continue;
      }
      const payload = await omdbRequest({ i: candidate.imdbId, type: 'movie' });
      rating = ratingFromPayload(payload);
      if (rating) {
        break;
      }
    }
  }

  await writeCache(cacheKey, rating);
  return rating;
}

export async function enrichWithRatings(showtimes, options = {}) {
  if (!hasApiKey()) {
    return showtimes.map((show) => {
      const cleanTitle = normalizeTitle(show.title);
      return {
        ...show,
        title: cleanTitle || show.title,
        rating: ''
      };
    });
  }

  const onProgress =
    typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const uniqueTitles = [
    ...new Set(showtimes.map((show) => normalizeTitle(show.omdbTitle || show.title)).filter(Boolean))
  ];
  const ratingsByLookupTitle = new Map();
  const total = uniqueTitles.length;

  for (let index = 0; index < uniqueTitles.length; index += 1) {
    const lookupTitle = uniqueTitles[index];
    onProgress({ title: lookupTitle, current: index + 1, total });
    const rating = await getRatingForTitle(lookupTitle);
    ratingsByLookupTitle.set(lookupTitle, rating);
  }

  return showtimes.map((show) => {
    const cleanTitle = normalizeTitle(show.title);
    const lookupTitle = normalizeTitle(show.omdbTitle || show.title);
    return {
      ...show,
      title: cleanTitle || show.title,
      rating: ratingsByLookupTitle.get(lookupTitle) || ''
    };
  });
}
