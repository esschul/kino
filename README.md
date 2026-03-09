# kino

`kino` is a Node.js CLI that shows what is playing in Oslo cinemas using Filmweb GraphQL.

## Features

- Show all movies and showtimes for today or tomorrow
- Filter by movie name or cinema
- Filter by time window (`--from` / `--to`)
- Open booking URLs directly (`--open`) without printing URLs
- List movies only (`kino list` or `--list`)
- Stats command (`kino stats`) with top movies/cinemas by number of showings
- Relative release age in stats (for example `20 days old`, `today`, `in 4 days`)
- `New This Week` block in stats (shown only when there are matches)
- Dedicated `kino new` command for new releases this week
- Optional IMDb ratings (OMDb) for list mode
- Local cache (`.kino-cache.json`) for faster responses

## Requirements

- Node.js 18+
- Internet access to Filmweb API

## Install

```bash
npm install
```

Global CLI command (run from anywhere):

```bash
npm link
```

After that, use `kino ...` in any folder.

## Build

No build step is required. This is a plain Node.js CLI.

## Run

From project folder:

```bash
node index.js today
```

Or (after `npm link`):

```bash
kino today
```

## OMDb / IMDb ratings (optional)

IMDb ratings are only used in list mode (`kino list` or `--list`).
Get an OMDb API key here: [https://www.omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx)

If you want ratings, add an OMDb key to `.env`:

```bash
cp .env.example .env
```

`.env`:

```env
OMDB_API_KEY=your_key_here
```

If no key is set, the CLI still works normally; list mode just shows no ratings.

## Commands

### Today / tomorrow showtimes

```bash
kino today
kino tomorrow
```

Filter by movie name:

```bash
kino today housemaid
kino tomorrow dune
```

Filter by time:

```bash
kino today --from 17 --to 20
kino tomorrow housemaid --from 17:30 --to 22
```

Open booking URLs:

```bash
kino today housemaid --open
```

Note: booking links are never printed in the terminal output.

### Movie list only

```bash
kino list
kino --list
kino today --list
kino tomorrow --list
```

### Stats

```bash
kino stats
kino stats today
kino stats tomorrow
```

### New this week

```bash
kino new
kino new today
kino new tomorrow
```

### Legacy filters

```bash
kino movie "Dune"
kino cinema "Colosseum"
```

## Example output

Showtimes:

```text
Oslo cinemas - 2026-03-09

The Secret Agent

14:00 - Ringen - 2D
19:00 - Vika - 2D
19:45 - Gimle - 2D
19:45 - ODEON Oslo - 2D
20:00 - Ringen - 2D
```

List mode:

```text
Movies in Oslo cinemas - 2026-03-09

The Secret Agent (IMDb 7.3)
Hamnet (IMDb 7.1)
Affeksjonsverdi
```

Stats:

```text
Stats for today (2026-03-09)

Showings: 138
Movies: 34
Cinemas: 8
Time span: 12:00-21:30

Top Movies (by showings)
 12  The Secret Agent (20 days old)
 10  Hamnet (17 days old)
  8  Affeksjonsverdi (10 days old)

New This Week
  8  Affeksjonsverdi (10 days old)
  4  Bare et uhell (3 days old)

Top Cinemas (by showings)
 42  ODEON Oslo
 28  Ringen
 21  Saga
```

New this week:

```text
New This Week (2026-03-09)

  6  Affeksjonsverdi (3 days old)
  4  Bare et uhell (2 days old)
```

## Cache

The CLI caches API responses in `.kino-cache.json` for 10 minutes.

Clear cache manually:

```bash
rm -f .kino-cache.json
```
