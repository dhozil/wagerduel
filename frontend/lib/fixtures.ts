/**
 * Fixtures loading helpers for the WagerDuel Fixtures page.
 *
 * Data is sourced from ESPN's public, key-free scoreboard API and proxied
 * server-side via /api/fixtures to avoid CORS. A direct browser fetch is used
 * as a fallback.
 */

export interface Fixture {
  id: string;
  league: string;
  leagueLabel: string;
  kickoff: string; // ISO timestamp
  gameDate: string; // YYYY-MM-DD (for contract bets)
  team1: string;
  team2: string;
  homeTeam: string;
  awayTeam: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  venue?: string;
  score1?: string;
  score2?: string;
  logo1?: string;
  logo2?: string;
  espnUrl: string;
  resolutionUrl: string;
}

export const LEAGUES: { slug: string; label: string }[] = [
  { slug: "eng.1", label: "Premier League" },
  { slug: "esp.1", label: "La Liga" },
  { slug: "ita.1", label: "Serie A" },
  { slug: "ger.1", label: "Bundesliga" },
  { slug: "fra.1", label: "Ligue 1" },
  { slug: "ned.1", label: "Eredivisie" },
  { slug: "por.1", label: "Primeira Liga" },
  { slug: "uefa.champions", label: "UEFA Champions League" },
];

const LEAGUE_LABELS: Record<string, string> = Object.fromEntries(
  LEAGUES.map((l) => [l.slug, l.label])
);

export function leagueLabel(slug: string): string {
  return LEAGUE_LABELS[slug] ?? slug;
}

export function dateParam(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** YYYY-MM-DD key of the given date in the viewer's LOCAL timezone. */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's YYYY-MM-DD in the viewer's LOCAL timezone. */
export function todayLocal(): string {
  return toLocalDateKey(new Date());
}

/**
 * Viewer-LOCAL calendar date of a fixture's kickoff. ESPN's raw date is an
 * instant; rendering its UTC day would show the wrong date everywhere but
 * UTC+0. Fixtures without a kickoff (BBC fill-ins for a requested date) keep
 * their stored date.
 */
export function fixtureLocalDate(f: Fixture): string {
  if (!f.kickoff) return f.gameDate;
  const d = new Date(f.kickoff);
  if (isNaN(d.getTime())) return f.gameDate;
  return toLocalDateKey(d);
}

/**
 * Localized kickoff label ("02:00 AM GMT+7") for a fixture, or "" if unknown.
 */
export function fixtureKickoffLabel(f: Fixture | undefined): string {
  if (!f?.kickoff) return "";
  const d = new Date(f.kickoff);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function parseDateKey(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * ESPN "dates" buckets a match by the UTC day of its kickoff. A single local
 * calendar day can span up to two UTC days depending on the viewer's offset, so
 * query the previous, current, and next UTC day around the local date and let
 * the caller filter by local date. This keeps page labels in sync with what the
 * user sees on Google/their own calendar.
 */
export function espnDateKeys(date: string): string[] {
  const keys: string[] = [];
  for (let off = -1; off <= 1; off++) {
    const d = parseDateKey(date);
    d.setDate(d.getDate() + off);
    keys.push(dateParam(d));
  }
  return keys;
}

/**
 * Dash-form calendar dates (YYYY-MM-DD) covering the 3-day UTC window around a
 * requested local date, so that both ESPN buckets and BBC pages can be queried
 * for the day before/after the request. The browser filters the returned window
 * by each viewer's LOCAL date.
 */
export function utcWindowDates(date: string): string[] {
  return espnDateKeys(date).map(
    (k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`
  );
}

export function bbcFixtureUrl(date: string): string {
  return date
    ? `https://www.bbc.com/sport/football/scores-fixtures/${date}`
    : "";
}

interface EspnCompetitor {
  homeAway: string;
  score?: string;
  winner?: boolean;
  team?: {
    id?: string;
    displayName?: string;
    abbreviation?: string;
    logo?: string;
  };
}

interface EspnEvent {
  id?: string;
  date?: string;
  status?: { type?: { state?: string; detail?: string } };
  competitions?: {
    date?: string;
    status?: { type?: { state?: string; detail?: string } };
    venue?: { fullName?: string };
    competitors?: EspnCompetitor[];
  }[];
}

function normalizeLeague(
  leagues: { slug: string }[] | undefined,
  fallback: string
): string {
  return leagues?.[0]?.slug || fallback;
}

/**
 * Normalize an ESPN scoreboard response into WagerDuel fixtures.
 */
export function normalizeFixturesFromEspn(
  payload: any,
  requestedLeague: string
): Fixture[] {
  const events: EspnEvent[] = Array.isArray(payload?.events)
    ? payload.events
    : [];
  const league = normalizeLeague(payload?.leagues, requestedLeague);

  const list: Fixture[] = [];
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");
    const name1 = home?.team?.displayName?.trim();
    const name2 = away?.team?.displayName?.trim();
    if (!name1 || !name2) continue;

    const kickoff = ev.date || comp?.date || "";
    const start = new Date(kickoff);
    // gameDate is the UTC calendar day of the kickoff. The serverless route runs
    // in UTC, so it can never know the viewer's offset — the browser is the only
    // place that can compute a LOCal date. Callers use fixtureLocalDate().
    const gameDate = isNaN(start.getTime())
      ? todayLocal()
      : start.toISOString().slice(0, 10);
    const state = (ev.status?.type?.state ||
      comp?.status?.type?.state ||
      "pre") as Fixture["state"];
    const statusDetail =
      ev.status?.type?.detail || comp?.status?.type?.detail || "";

    const score1 =
      home?.score !== undefined && home.winner !== undefined
        ? home.score
        : undefined;
    const score2 =
      away?.score !== undefined && away.winner !== undefined
        ? away.score
        : undefined;

    const id = String(ev.id || `${gameDate}_${name1}_${name2}`).toLowerCase();
    const espnUrl = ev.id
      ? `https://www.espn.com/soccer/match/_/gameId/${ev.id}`
      : "";

    list.push({
      id,
      league,
      leagueLabel: leagueLabel(league),
      kickoff,
      gameDate,
      team1: name1,
      team2: name2,
      homeTeam: name1,
      awayTeam: name2,
      state,
      statusDetail,
      venue: comp?.venue?.fullName,
      score1,
      score2,
      logo1: home?.team?.id
        ? `https://a.espncdn.com/i/teamlogos/soccer/500/${home.team.id}.png`
        : undefined,
      logo2: away?.team?.id
        ? `https://a.espncdn.com/i/teamlogos/soccer/500/${away.team.id}.png`
        : undefined,
      espnUrl,
      resolutionUrl: espnUrl || bbcFixtureUrl(gameDate),
    });
  }
  return list;
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchEspnDirect(
  slug: string,
  date: string
): Promise<Fixture[]> {
  const settled = await Promise.allSettled(
    espnDateKeys(date).map((key) =>
      fetch(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(
          slug
        )}/scoreboard?dates=${key}`,
        { headers: BROWSER_HEADERS }
      ).then(
        (res) => {
          if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
          return res.json();
        },
        () => undefined
      ).then((payload) =>
        payload ? normalizeFixturesFromEspn(payload, slug) : []
      )
    )
  );

  const byId = new Map<string, Fixture>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const f of r.value) byId.set(f.id, f);
  }
  // Return the whole UTC window; the caller filters by the viewer's LOCAL date.
  return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/**
 * Load fixtures for a given date and optional league slug.
 * Tries the server proxy first, then falls back to a direct browser fetch.
 */
export async function loadFixtures(
  date: string,
  slug?: string
): Promise<Fixture[]> {
  const slugs = slug
    ? [slug]
    : LEAGUES.map((l) => l.slug);

  const params = new URLSearchParams({ date });
  if (slug) params.set("league", slug);

  try {
    const res = await fetch(`/api/fixtures?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.fixtures)) return data.fixtures as Fixture[];
    }
  } catch {
    // fall through to direct fetch
  }

  const settled = await Promise.allSettled(
    slugs.map((s) => fetchEspnDirect(s, date))
  );
  const list = settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
  return list.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}