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

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
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
    const gameDate = isNaN(start.getTime())
      ? todayUTC()
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
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(
    slug
  )}/scoreboard?dates=${dateParam(new Date(date + "T00:00:00Z"))}`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
  const payload = await res.json();
  return normalizeFixturesFromEspn(payload, slug);
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