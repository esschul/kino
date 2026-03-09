#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { loadEnvFile } from './env.js';
import { getOsloShowtimesToday, getOsloShowtimesTomorrow } from './filmweb.js';
import { formatMovieList, formatShowtimes } from './formatter.js';

loadEnvFile(import.meta.url);

const program = new Command();
let hasActiveProgressLine = false;

program
  .name('kino')
  .description('List movies currently playing in Oslo cinemas (Filmweb)')
  .version('1.0.0');

function matchIgnoreCase(haystack, needle) {
  return haystack.toLocaleLowerCase('nb').includes(needle.toLocaleLowerCase('nb'));
}

async function loadTodayShowtimes(options = {}) {
  return getOsloShowtimesToday(options);
}

async function loadTomorrowShowtimes(options = {}) {
  return getOsloShowtimesTomorrow(options);
}

function filterByMovieName(showtimes, name) {
  if (!name || !name.trim()) {
    return showtimes;
  }
  return showtimes.filter((show) => matchIgnoreCase(show.title, name.trim()));
}

function timeToMinutes(timeText) {
  if (typeof timeText !== 'string') {
    return Number.NaN;
  }

  const match = timeText.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    return Number.NaN;
  }

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return Number.NaN;
  }

  return hours * 60 + minutes;
}

function filterByTimeRange(showtimes, from, to) {
  if (!from && !to) {
    return showtimes;
  }

  const fromMinutes = from ? timeToMinutes(from) : 0;
  const toMinutes = to ? timeToMinutes(to) : 23 * 60 + 59;

  if (Number.isNaN(fromMinutes)) {
    throw new Error("Invalid --from value. Use '17' or '17:30'.");
  }
  if (Number.isNaN(toMinutes)) {
    throw new Error("Invalid --to value. Use '20' or '20:15'.");
  }
  if (fromMinutes > toMinutes) {
    throw new Error('--from must be earlier than or equal to --to.');
  }

  return showtimes.filter((show) => {
    const showMinutes = timeToMinutes(show.time);
    if (Number.isNaN(showMinutes)) {
      return false;
    }
    return showMinutes >= fromMinutes && showMinutes <= toMinutes;
  });
}

function openUrl(url) {
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function maybeOpenBookingUrls(showtimes, shouldOpen) {
  if (!shouldOpen) {
    return;
  }

  const urls = [...new Set(showtimes.map((show) => show.bookingUrl).filter(Boolean))];
  if (!urls.length) {
    console.log('No booking URLs found to open.');
    return;
  }

  for (const url of urls) {
    openUrl(url);
  }

  console.log(`Opened ${urls.length} booking URL${urls.length === 1 ? '' : 's'}.`);
}

function ratingProgress({ title, current, total }) {
  if (!process.stderr.isTTY) {
    return;
  }

  const message = `Getting IMDb rating (${current}/${total}): ${title}`;
  process.stderr.write(`\x1b[2K\r${message}`);
  hasActiveProgressLine = true;
}

function clearProgressLine() {
  if (!hasActiveProgressLine || !process.stderr.isTTY) {
    return;
  }
  process.stderr.write('\x1b[2K\r');
  hasActiveProgressLine = false;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => {
    if (a[1] !== b[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0], 'nb');
  });
}

function formatStats(showtimes, date, heading = 'today') {
  if (!showtimes.length) {
    return `No showtimes found for ${date}.`;
  }

  const movieCounts = countBy(showtimes, (show) => show.title);
  const cinemaCounts = countBy(showtimes, (show) => show.cinema);
  const times = showtimes
    .map((show) => show.time)
    .filter(Boolean)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

  const lines = [];
  lines.push(`Stats for ${heading} (${date})`);
  lines.push('');
  lines.push(`Showings: ${showtimes.length}`);
  lines.push(`Movies: ${movieCounts.length}`);
  lines.push(`Cinemas: ${cinemaCounts.length}`);
  if (times.length) {
    lines.push(`Time span: ${times[0]}-${times[times.length - 1]}`);
  }
  lines.push('');
  lines.push('Top Movies (by showings)');
  for (const [title, count] of movieCounts.slice(0, 10)) {
    lines.push(`${count.toString().padStart(3, ' ')}  ${title}`);
  }
  lines.push('');
  lines.push('Top Cinemas (by showings)');
  for (const [cinema, count] of cinemaCounts.slice(0, 10)) {
    lines.push(`${count.toString().padStart(3, ' ')}  ${cinema}`);
  }

  return lines.join('\n');
}

program
  .command('today [name]')
  .description('Show all movies playing today in Oslo, optionally filtered by movie name')
  .option('--from <time>', "Filter start time from (e.g. '17' or '17:30')")
  .option('--to <time>', "Filter start time to (e.g. '20' or '20:15')")
  .option('--open', 'Open booking URLs for the filtered showtimes')
  .option('--list', 'Only list movie titles')
  .action(async (name, options) => {
    try {
      const { date, showtimes } = await loadTodayShowtimes({
        includeRatings: Boolean(options.list),
        onProgress: ratingProgress
      });
      const byName = filterByMovieName(showtimes, name);
      const filtered = filterByTimeRange(byName, options.from, options.to);
      clearProgressLine();
      console.log(options.list ? formatMovieList(filtered, date) : formatShowtimes(filtered, date));
      maybeOpenBookingUrls(filtered, options.open);
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load showtimes');
      process.exitCode = 1;
    }
  });

program
  .command('tomorrow [name]')
  .description('Show all movies playing tomorrow in Oslo, optionally filtered by movie name')
  .option('--from <time>', "Filter start time from (e.g. '17' or '17:30')")
  .option('--to <time>', "Filter start time to (e.g. '20' or '20:15')")
  .option('--open', 'Open booking URLs for the filtered showtimes')
  .option('--list', 'Only list movie titles')
  .action(async (name, options) => {
    try {
      const { date, showtimes } = await loadTomorrowShowtimes({
        includeRatings: Boolean(options.list),
        onProgress: ratingProgress
      });
      const byName = filterByMovieName(showtimes, name);
      const filtered = filterByTimeRange(byName, options.from, options.to);
      clearProgressLine();
      console.log(options.list ? formatMovieList(filtered, date) : formatShowtimes(filtered, date));
      maybeOpenBookingUrls(filtered, options.open);
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load showtimes');
      process.exitCode = 1;
    }
  });

program
  .command('movie <title>')
  .description('Filter showtimes for a specific movie')
  .action(async (title) => {
    try {
      const { date, showtimes } = await loadTodayShowtimes();
      const filtered = showtimes.filter((show) => matchIgnoreCase(show.title, title));
      clearProgressLine();
      console.log(formatShowtimes(filtered, date));
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load showtimes');
      process.exitCode = 1;
    }
  });

program
  .command('cinema <name>')
  .description('Show all movies playing in a cinema')
  .action(async (name) => {
    try {
      const { date, showtimes } = await loadTodayShowtimes();
      const filtered = showtimes.filter((show) => matchIgnoreCase(show.cinema, name));
      clearProgressLine();
      console.log(formatShowtimes(filtered, date));
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load showtimes');
      process.exitCode = 1;
    }
  });

program
  .command('list [name]')
  .description('List movie titles playing today in Oslo')
  .action(async (name) => {
    try {
      const { date, showtimes } = await loadTodayShowtimes({
        includeRatings: true,
        onProgress: ratingProgress
      });
      const filtered = filterByMovieName(showtimes, name);
      clearProgressLine();
      console.log(formatMovieList(filtered, date));
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load showtimes');
      process.exitCode = 1;
    }
  });

program
  .command('stats [day]')
  .description("Show statistics for 'today' (default) or 'tomorrow'")
  .action(async (day) => {
    try {
      const target = (day || 'today').toLocaleLowerCase('nb').trim();
      if (target !== 'today' && target !== 'tomorrow') {
        throw new Error("Invalid day. Use 'today' or 'tomorrow'.");
      }

      const loader = target === 'tomorrow' ? loadTomorrowShowtimes : loadTodayShowtimes;
      const { date, showtimes } = await loader();
      clearProgressLine();
      console.log(formatStats(showtimes, date, target));
    } catch (error) {
      clearProgressLine();
      console.error(error.message || 'Failed to load stats');
      process.exitCode = 1;
    }
  });

const argv = [...process.argv];
if (argv[2] === '--list') {
  argv.splice(2, 1, 'list');
}

program.parseAsync(argv);
