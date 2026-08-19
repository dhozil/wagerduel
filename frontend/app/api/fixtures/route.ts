import { NextRequest, NextResponse } from "next/server";
import {
  LEAGUES,
  Fixture,
  normalizeFixturesFromEspn,
  espnDateKeys,
} from "@/lib/fixtures";
import { fetchBbcFixtures, mergeFixtures } from "@/lib/fixtures-bbc";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function fetchLeague(slug: string, date: string): Promise<Fixture[]> {
  const keys = espnDateKeys(date);
  const lists = await Promise.all(
    keys.map(async (key) => {
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(
        slug
      )}/scoreboard?dates=${key}`;
      const res = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        throw new Error(`ESPN responded ${res.status} for ${slug}`);
      }
      const payload = await res.json();
      return normalizeFixturesFromEspn(payload, slug);
    })
  );

  const byId = new Map<string, Fixture>();
  for (const list of lists) {
    for (const f of list) byId.set(f.id, f);
  }
  // This function runs in UTC and cannot know the viewer's timezone, so don't
  // filter by date here. Return the whole 3-UTC-day window and let the browser
  // pick the fixtures that fall on its LOCAL date.
  return [...byId.values()];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date")?.trim();
  const league = searchParams.get("league")?.trim();

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or invalid date (expected YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const slugs = league
    ? LEAGUES.filter((l) => l.slug === league).map((l) => l.slug)
    : LEAGUES.map((l) => l.slug);

  if (slugs.length === 0) {
    return NextResponse.json(
      { error: `Unknown league "${league}"` },
      { status: 400 }
    );
  }

  const [espnResult, bbcResult] = await Promise.all([
    Promise.allSettled(slugs.map((slug) => fetchLeague(slug, date))),
    fetchBbcFixtures(date).then(
      (v) => ({ ok: true as const, value: v }),
      (e) => ({ ok: false as const, error: e as Error })
    ),
  ]);

  const espnFixtures = espnResult
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const merged = mergeFixtures(
    espnFixtures,
    bbcResult.ok ? bbcResult.value : []
  );

  const fixtures = league
    ? merged.filter((f) => f.league === league)
    : merged;

  const next = NextResponse.json({ fixtures, fetchedAt: new Date().toISOString() });
  next.headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return next;
}