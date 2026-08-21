import { LEAGUES, bbcFixtureUrl, leagueLabel, type Fixture } from "./fixtures";

/**
 * BBC scores-fixtures fallback source.
 *
 * ESPN's free scoreboard API has large coverage gaps (e.g. no UEFA Champions
 * League qualifying and several off-days for the top-5 leagues). On those days
 * we fill in with BBC Sport's scores & fixtures page, which is fully
 * server-rendered. The parser below walks the BBC HTML (the page renders every
 * match as a `.HeadToHeadWrapper` list item) and rebuilds our `Fixture` shape.
 */

const BBC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BBC_COMP_TO_LEAGUE: Record<string, string> = {
  "Premier League": "eng.1",
  "English Premier League": "eng.1",
  Championship: "eng.2",
  "English Championship": "eng.2",
  "League One": "eng.3",
  "League Two": "eng.4",
  "National League": "eng.5",
  "La Liga": "esp.1",
  "Spanish La Liga": "esp.1",
  "Serie A": "ita.1",
  "Italian Serie A": "ita.1",
  Bundesliga: "ger.1",
  "German Bundesliga": "ger.1",
  "Ligue 1": "fra.1",
  "French Ligue 1": "fra.1",
  Eredivisie: "ned.1",
  "Dutch Eredivisie": "ned.1",
  "Primeira Liga": "por.1",
  "Portuguese Primeira Liga": "por.1",
  "UEFA Champions League": "uefa.champions",
  "Scottish Premiership": "sco.1",
  "Scottish Championship": "sco.2",
  "Scottish League One": "sco.3",
  "Scottish League Two": "sco.4",
};

function isKnownLeagueSlug(slug: string): boolean {
  return LEAGUES.some((l) => l.slug === slug);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function fixtureDedupKey(f: {
  gameDate?: string;
  team1: string;
  team2: string;
}): string {
  const a = normalizeName(f.team1);
  const b = normalizeName(f.team2);
  return `${f.gameDate ?? ""}|${a < b ? a : b}|${a < b ? b : a}`;
}

function fuzzyTeam(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === y) return true;
  if (x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x);
}

function sameMatch(a: Fixture, b: Fixture): boolean {
  return (
    (fuzzyTeam(a.team1, b.team1) && fuzzyTeam(a.team2, b.team2)) ||
    (fuzzyTeam(a.team1, b.team2) && fuzzyTeam(a.team2, b.team1))
  );
}

/**
 * Merge ESPN fixtures with BBC fixtures (ESPN wins on duplicates).
 */
export function mergeFixtures(espn: Fixture[], bbc: Fixture[]): Fixture[] {
  const keys = new Set<string>();
  const unique: Fixture[] = [];

  const add = (f: Fixture) => {
    const key = fixtureDedupKey(f);
    if (keys.has(key)) return;
    if (unique.some((existing) => sameMatch(existing, f))) return;
    keys.add(key);
    unique.push(f);
  };

  for (const f of espn) add(f);
  for (const f of bbc) add(f);

  return unique.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/**
 * Determine if a given UTC date falls within British Summer Time (BST).
 *
 * BST runs from the last Sunday in March at 01:00 UTC
 * to the last Sunday in October at 02:00 UTC.
 *
 * @param year  Full year (e.g. 2026)
 * @param month 1-12
 * @param day   1-31
 */
function isBST(year: number, month: number, day: number): boolean {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;

  // Last Sunday in March
  const mar31 = new Date(Date.UTC(year, 2, 31));
  const marSun = mar31.getUTCDay();
  const bstStart = 31 - (marSun === 0 ? 6 : marSun - 1); // last Sun in Mar

  // Last Sunday in October
  const oct31 = new Date(Date.UTC(year, 9, 31));
  const octSun = oct31.getUTCDay();
  const bstEnd = 31 - (octSun === 0 ? 6 : octSun - 1); // last Sun in Oct

  if (month === 3) return day >= bstStart;
  if (month === 10) return day < bstEnd;
  return true;
}

function h2Title(inner: string): string {
  const text = inner
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 2 || text.length > 60) return "";
  return text;
}

/**
 * Parse the BBC scores-fixtures HTML for a given date into fixtures.
 */
export function parseBbcScoreboard(html: string, date: string): Fixture[] {
  const markers: { index: number; comp?: string; inner?: string }[] = [];
  let m: RegExpExecArray | null;

  const h2Re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/g;
  while ((m = h2Re.exec(html))) {
    const name = h2Title(m[1]);
    if (name) markers.push({ index: m.index, comp: name });
  }

  const liRe =
    /<li[^>]*class="[^"]*HeadToHeadWrapper[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  while ((m = liRe.exec(html))) markers.push({ index: m.index, inner: m[1] });

  markers.sort((a, b) => a.index - b.index);

  const out: Fixture[] = [];
  let comp = "";
  for (const marker of markers) {
    if (marker.comp !== undefined) {
      comp = marker.comp;
      continue;
    }
    if (marker.inner !== undefined) {
      const f = parseMatchLi(marker.inner, comp, date);
      if (f) out.push(f);
    }
  }
  return out;
}

function parseMatchLi(inner: string, comp: string, date: string): Fixture | null {
  if (/cancell/i.test(inner)) return null;

  const href = /href="(\/sport\/football\/[^"]+)"/.exec(inner);
  const eventId = /data-event-id="([^"]+)"/.exec(inner);

  const hiddenSpans = [
    ...inner.matchAll(/visually-hidden[^>]*>([^<]+)<\/span>/g),
  ]
    .map((x) => x[1].trim())
    .filter(Boolean);

  const allText = hiddenSpans.join(" ");
  const summary = hiddenSpans[0] ?? "";

  const logos = [
    ...inner.matchAll(/src="(https:\/\/static\.files\.bbci\.co\.uk\/[^"]+\.svg)"/g),
  ].map((x) => x[1]);

  let home = "";
  let away = "";
  let score1: string | undefined;
  let score2: string | undefined;
  let kickoffMinutes = "";

  const versus = /^(.+?)\s+versus\s+(.+?)\s+kick off\s*(\d{2}:\d{2})?/i.exec(
    summary
  );
  if (versus) {
    home = versus[1].trim();
    away = versus[2].trim();
    kickoffMinutes = versus[3] ?? "";
  } else {
    const scored =
      /^([\s\S]+?)\s+(\d{1,2})\s*,\s*([\s\S]+?)\s+(\d{1,2})/u.exec(summary);
    if (scored) {
      home = scored[1].trim();
      score1 = scored[2];
      away = scored[3].trim();
      score2 = scored[4];
    } else {
      const names = [
        ...inner.matchAll(/aria-hidden="true"[^>]*>\s*([^<]{1,80})<\/span>/g),
      ].map((x) => x[1]);
      const uniq = [...new Set(names)];
      if (uniq.length < 2) return null;
      home = uniq[0];
      away = uniq[1];
    }
  }

  if (!home || !away) return null;

  const fullTime = /\b(full time|ft)\b/i.test(allText);
  const inProgress = /\b(in progress|minute|stoppage time|half time)\b/i.test(
    allText
  );
  const state: Fixture["state"] = fullTime ? "post" : inProgress ? "in" : "pre";

  const detail =
    hiddenSpans.find((s) =>
      /\b(in progress|minute|stoppage|full time|half time)\b/i.test(s)
    ) ?? "";

  const kickoffDate = new Date(date + "T00:00:00Z");
  let kickoff = "";
  if (kickoffMinutes) {
    const [hh, min] = kickoffMinutes.split(":").map(Number);
    const [y, m, d] = date.split("-").map(Number);
    const offset = isBST(y, m, d) ? 1 : 0; // BST=UTC+1, GMT=UTC+0
    kickoffDate.setUTCHours(hh - offset, min, 0, 0);
    kickoff = kickoffDate.toISOString();
  }

  const id = (eventId?.[1] ?? `bbc-${date}-${normalizeName(home)}-${normalizeName(away)}`).toLowerCase();
  const mapped = BBC_COMP_TO_LEAGUE[comp];
  const slug = mapped ?? "bbc." + comp.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    id,
    league: slug,
    leagueLabel:
      mapped && isKnownLeagueSlug(mapped) ? leagueLabel(mapped) : comp || "BBC Football",
    kickoff,
    gameDate: date,
    team1: home,
    team2: away,
    homeTeam: home,
    awayTeam: away,
    state,
    statusDetail: detail,
    venue: "",
    score1,
    score2,
    logo1: logos[0],
    logo2: logos[1],
    espnUrl: "",
    resolutionUrl: href
      ? `https://www.bbc.com${href[1]}`
      : bbcFixtureUrl(date),
  };
}

/**
 * Fetch and parse the BBC scores-fixtures page for a date.
 */
export async function fetchBbcFixtures(date: string): Promise<Fixture[]> {
  const url = `https://www.bbc.com/sport/football/scores-fixtures/${date}`;
  const res = await fetch(url, {
    headers: { "User-Agent": BBC_UA, "Accept-Language": "en-GB,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`BBC responded ${res.status}`);
  const html = await res.text();
  return parseBbcScoreboard(html, date);
}