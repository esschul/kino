import { readCache, writeCache } from './cache.js';
import { enrichWithRatings } from './omdb.js';

const ENDPOINT = 'https://movieinfoqs.filmweb.no/graphql';
const OSLO_LOCATIONS = ['Oslo'];
const OSLO_TIMEZONE = 'Europe/Oslo';

const SHOW_DATES_QUERY = `
  query ($locations:[String]) {
    showQuery {
      getShowDates(locations:$locations) {
        date
      }
    }
  }
`;

const SHOWS_QUERY = `
  query ($locations:[String], $date:String) {
    showQuery {
      getShows(locations:$locations, date:$date) {
        movieMainVersionId
        movieVersionId
        movieTitle
        location
        theaterName
        showStart
        showType
        ticketSaleUrl
        versionTags {
          tag
          type
        }
      }
    }
  }
`;

const MOVIES_QUERY = `
  query ($locations:[String], $date:String) {
    movieQuery {
      getCurrentMovies(locations:$locations, date:$date) {
        mainVersionId
        versionId
        title
        titleOriginal
      }
    }
  }
`;

async function graphQLRequest(query, variables = {}) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = payload?.errors?.map((error) => error?.message).filter(Boolean).join('; ');
    if (details) {
      throw new Error(`Filmweb API request failed with status ${response.status}: ${details}`);
    }
    throw new Error(`Filmweb API request failed with status ${response.status}`);
  }

  if (payload?.errors?.length) {
    throw new Error(`Filmweb API error: ${payload.errors[0].message || 'Unknown error'}`);
  }

  return payload?.data;
}

function getTodayOsloIsoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getOsloIsoDateForOffset(offsetDays) {
  const now = new Date();
  const target = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OSLO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(target);
}

function normalizeDateString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function pickBestDate(dateRows) {
  const todayIso = getTodayOsloIsoDate();
  const entries = dateRows
    .map((row) => ({ raw: row?.date, iso: normalizeDateString(row?.date) }))
    .filter((entry) => entry.raw && entry.iso);

  if (!entries.length) {
    return { rawDate: todayIso, labelDate: todayIso };
  }

  const sameDay = entries.find((entry) => entry.iso === todayIso);
  if (sameDay) {
    return { rawDate: sameDay.raw, labelDate: sameDay.iso };
  }

  const sorted = [...entries].sort((a, b) => a.iso.localeCompare(b.iso));
  const pastOrToday = sorted.filter((entry) => entry.iso <= todayIso);

  if (pastOrToday.length) {
    const best = pastOrToday[pastOrToday.length - 1];
    return { rawDate: best.raw, labelDate: best.iso };
  }

  return { rawDate: sorted[0].raw, labelDate: sorted[0].iso };
}

function pickDateForTarget(dateRows, targetIso) {
  const entries = dateRows
    .map((row) => ({ raw: row?.date, iso: normalizeDateString(row?.date) }))
    .filter((entry) => entry.raw && entry.iso);

  if (!entries.length) {
    return { rawDate: targetIso, labelDate: targetIso };
  }

  const exact = entries.find((entry) => entry.iso === targetIso);
  if (exact) {
    return { rawDate: exact.raw, labelDate: exact.iso };
  }

  const sorted = [...entries].sort((a, b) => a.iso.localeCompare(b.iso));
  const futureOrEqual = sorted.find((entry) => entry.iso >= targetIso);
  if (futureOrEqual) {
    return { rawDate: futureOrEqual.raw, labelDate: futureOrEqual.iso };
  }

  const latest = sorted[sorted.length - 1];
  return { rawDate: latest.raw, labelDate: latest.iso };
}

function extractTime(showStart) {
  if (typeof showStart !== 'string') {
    return '';
  }

  const quickMatch = showStart.match(/T(\d{2}:\d{2})/);
  if (quickMatch) {
    return quickMatch[1];
  }

  const parsed = new Date(showStart);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('nb-NO', {
    timeZone: OSLO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(parsed);
}

function extractFormat(show) {
  const tags = Array.isArray(show?.versionTags)
    ? show.versionTags
        .filter((tag) => tag && typeof tag.tag === 'string')
        .filter((tag) => tag.type === 'format' || tag.tag === '2D' || tag.tag === '3D')
        .map((tag) => tag.tag)
    : [];

  const parts = [show?.showType, ...tags].filter((value) => typeof value === 'string' && value.trim());
  return [...new Set(parts)].join(' ');
}

function toMinutes(timeText) {
  if (typeof timeText !== 'string') {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = timeText.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function buildOriginalTitleMap(movies) {
  const map = new Map();

  for (const movie of movies) {
    const preferred = movie?.titleOriginal || movie?.title || '';
    if (!preferred) {
      continue;
    }

    if (typeof movie?.mainVersionId === 'string' && movie.mainVersionId) {
      map.set(movie.mainVersionId, preferred);
    }
    if (typeof movie?.versionId === 'string' && movie.versionId) {
      map.set(movie.versionId, preferred);
    }
  }

  return map;
}

function normalizeShows(rawShows, originalTitleMap) {
  return rawShows
    .map((show) => ({
      title: show?.movieTitle || 'Unknown movie',
      cinema: show?.theaterName || show?.location || 'Unknown cinema',
      time: extractTime(show?.showStart),
      format: extractFormat(show),
      bookingUrl: typeof show?.ticketSaleUrl === 'string' ? show.ticketSaleUrl : '',
      omdbTitle:
        originalTitleMap.get(show?.movieMainVersionId) ||
        originalTitleMap.get(show?.movieVersionId) ||
        ''
    }))
    .filter((show) => show.title && show.cinema && show.time)
    .sort((a, b) => {
      if (a.title !== b.title) {
        return a.title.localeCompare(b.title, 'nb');
      }
      if (a.cinema !== b.cinema) {
        return a.cinema.localeCompare(b.cinema, 'nb');
      }
      return toMinutes(a.time) - toMinutes(b.time);
    });
}

async function getShowDates() {
  const cacheKey = 'showDates:Oslo';
  const cached = await readCache(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await graphQLRequest(SHOW_DATES_QUERY, { locations: OSLO_LOCATIONS });
  const dates = data?.showQuery?.getShowDates || [];
  await writeCache(cacheKey, dates);
  return dates;
}

async function getRawShows(dateValue) {
  const cacheKey = `shows:Oslo:${dateValue}`;
  const cached = await readCache(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await graphQLRequest(SHOWS_QUERY, {
    locations: OSLO_LOCATIONS,
    date: dateValue
  });

  const rows = data?.showQuery?.getShows || [];
  await writeCache(cacheKey, rows);
  return rows;
}

async function getRawMovies(dateValue) {
  const cacheKey = `movies:Oslo:${dateValue}`;
  const cached = await readCache(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await graphQLRequest(MOVIES_QUERY, {
    locations: OSLO_LOCATIONS,
    date: dateValue
  });

  const rows = data?.movieQuery?.getCurrentMovies || [];
  await writeCache(cacheKey, rows);
  return rows;
}

export async function getOsloShowtimesForDate(date, options = {}) {
  const [shows, movies] = await Promise.all([getRawShows(date), getRawMovies(date)]);
  const originalTitleMap = buildOriginalTitleMap(movies);
  const normalized = normalizeShows(shows, originalTitleMap);
  if (options.includeRatings) {
    return enrichWithRatings(normalized, options);
  }
  return normalized;
}

export async function getOsloShowtimesToday(options = {}) {
  const showDates = await getShowDates();
  const selectedDate = pickBestDate(showDates);
  const showtimes = await getOsloShowtimesForDate(selectedDate.rawDate, options);
  return { date: selectedDate.labelDate, showtimes };
}

export async function getOsloShowtimesTomorrow(options = {}) {
  const showDates = await getShowDates();
  const tomorrowIso = getOsloIsoDateForOffset(1);
  const selectedDate = pickDateForTarget(showDates, tomorrowIso);
  const showtimes = await getOsloShowtimesForDate(selectedDate.rawDate, options);
  return { date: selectedDate.labelDate, showtimes };
}
