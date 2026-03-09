import chalk from 'chalk';

function groupByMovie(showtimes) {
  const grouped = new Map();

  for (const show of showtimes) {
    if (!grouped.has(show.title)) {
      grouped.set(show.title, []);
    }
    grouped.get(show.title).push(show);
  }

  return grouped;
}

export function formatShowtimes(showtimes, dateLabel) {
  if (!showtimes.length) {
    return chalk.yellow(`No showtimes found for ${dateLabel}.`);
  }

  const lines = [];
  lines.push(chalk.dim(`Oslo cinemas - ${dateLabel}`));
  lines.push('');

  const byMovie = groupByMovie(showtimes);
  const movies = [...byMovie.entries()].sort((a, b) => {
    if (a[1].length !== b[1].length) {
      return b[1].length - a[1].length;
    }
    return a[0].localeCompare(b[0], 'nb');
  });

  for (const [movie, movieShows] of movies) {
    const rating = movieShows[0]?.rating;
    const ratingLabel = rating ? chalk.yellow(`  IMDb ${rating}`) : '';
    lines.push(chalk.bold.cyan(`${movie}${ratingLabel ? ` ${ratingLabel}` : ''}`));
    lines.push('');
    const sorted = [...movieShows].sort((a, b) => {
      const [ah, am] = (a.time || '').split(':').map(Number);
      const [bh, bm] = (b.time || '').split(':').map(Number);
      const aMinutes = Number.isFinite(ah) && Number.isFinite(am) ? ah * 60 + am : Number.MAX_SAFE_INTEGER;
      const bMinutes = Number.isFinite(bh) && Number.isFinite(bm) ? bh * 60 + bm : Number.MAX_SAFE_INTEGER;

      if (aMinutes !== bMinutes) {
        return aMinutes - bMinutes;
      }
      return a.cinema.localeCompare(b.cinema, 'nb');
    });

    for (const show of sorted) {
      const formatPart = show.format ? show.format : '-';
      lines.push(`${chalk.green(show.time)} - ${chalk.bold(show.cinema)} - ${chalk.magenta(formatPart)}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function formatMovieList(showtimes, dateLabel) {
  if (!showtimes.length) {
    return chalk.yellow(`No movies found for ${dateLabel}.`);
  }

  const unique = new Map();
  const statsDate = new Date(`${dateLabel}T00:00:00Z`);

  function ageLabel(isoDate) {
    if (!isoDate) {
      return '';
    }
    const target = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(target.getTime()) || Number.isNaN(statsDate.getTime())) {
      return '';
    }
    const days = Math.round((statsDate.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
    if (days < 0) {
      const n = Math.abs(days);
      return `(in ${n} day${n === 1 ? '' : 's'})`;
    }
    if (days === 0) {
      return '(today)';
    }
    if (days === 1) {
      return '(1 day old)';
    }
    return `(${days} days old)`;
  }

  for (const show of showtimes) {
    if (!unique.has(show.title)) {
      unique.set(show.title, {
        rating: show.rating || '',
        releaseDate: typeof show.releaseDate === 'string' ? show.releaseDate.slice(0, 10) : ''
      });
    }
  }

  const lines = [];
  lines.push(chalk.dim(`Movies in Oslo cinemas - ${dateLabel}`));
  lines.push('');

  const movies = [...unique.entries()]
    .map(([title, info]) => ({
      title,
      rating: info.rating,
      releaseDate: info.releaseDate,
      score: Number.parseFloat(info.rating)
    }))
    .sort((a, b) => {
      const aValid = Number.isFinite(a.score);
      const bValid = Number.isFinite(b.score);

      if (aValid && bValid && a.score !== b.score) {
        return b.score - a.score;
      }
      if (aValid !== bValid) {
        return aValid ? -1 : 1;
      }
      return a.title.localeCompare(b.title, 'nb');
    });

  for (const movie of movies) {
    const rating = movie.rating;
    const ratingPart = rating ? chalk.yellow(` (IMDb ${rating})`) : '';
    const agePart = movie.releaseDate ? chalk.dim(` ${ageLabel(movie.releaseDate)}`) : '';
    lines.push(`${chalk.cyan(movie.title)}${ratingPart}${agePart}`);
  }

  return lines.join('\n');
}
