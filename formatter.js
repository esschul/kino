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

function groupByCinema(shows) {
  const grouped = new Map();

  for (const show of shows) {
    if (!grouped.has(show.cinema)) {
      grouped.set(show.cinema, []);
    }
    grouped.get(show.cinema).push(show);
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

  for (const [movie, movieShows] of byMovie) {
    const rating = movieShows[0]?.rating;
    const ratingLabel = rating ? chalk.yellow(`  IMDb ${rating}`) : '';
    lines.push(chalk.bold.cyan(`${movie}${ratingLabel ? ` ${ratingLabel}` : ''}`));
    lines.push('');

    const byCinema = groupByCinema(movieShows);

    for (const [cinema, cinemaShows] of byCinema) {
      lines.push(chalk.bold(cinema));

      for (const show of cinemaShows) {
        const formatPart = show.format ? ` ${chalk.magenta(show.format)}` : '';
        const bookingPart = show.bookingUrl ? ` ${chalk.dim(show.bookingUrl)}` : '';
        lines.push(`${chalk.green(show.time)}${formatPart}${bookingPart}`);
      }

      lines.push('');
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
  for (const show of showtimes) {
    if (!unique.has(show.title)) {
      unique.set(show.title, show.rating || '');
    }
  }

  const lines = [];
  lines.push(chalk.dim(`Movies in Oslo cinemas - ${dateLabel}`));
  lines.push('');

  const movies = [...unique.entries()]
    .map(([title, rating]) => ({
      title,
      rating,
      score: Number.parseFloat(rating)
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
    const suffix = rating ? chalk.yellow(` (IMDb ${rating})`) : '';
    lines.push(`${chalk.cyan(movie.title)}${suffix}`);
  }

  return lines.join('\n');
}
