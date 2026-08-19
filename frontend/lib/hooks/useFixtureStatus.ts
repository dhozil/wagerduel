"use client";

import { useQueries } from "@tanstack/react-query";
import type { Fixture } from "@/lib/fixtures";
import type { Bet } from "@/lib/contracts/types";

/**
 * Match gate used to lock the Resolve button until a match has finished.
 *
 * "finished"  -> fixture state is "post" (full time) or the match date is
 *                clearly in the past with no league data available
 * "live"      -> fixture state is "in" (currently being played)
 * "scheduled" -> fixture state is "pre" or the date is in the future
 * "unknown"   -> kickoff is today but the league feed has no row for it
 * "loading"   -> fixture status for this date is still being fetched
 */
export type MatchGate = "finished" | "live" | "scheduled" | "unknown" | "loading";

export function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function findFixtureForBet(
  fixtures: Fixture[] | undefined,
  bet: Pick<Bet, "game_date" | "team1" | "team2">
): Fixture | undefined {
  if (!fixtures?.length) return undefined;
  const t1 = normalizeTeamName(bet.team1);
  const t2 = normalizeTeamName(bet.team2);
  return fixtures.find((f) => {
    const a = normalizeTeamName(f.team1);
    const b = normalizeTeamName(f.team2);
    return (a === t1 && b === t2) || (a === t2 && b === t1);
  });
}

export function matchGateForBet(
  gameDate: string,
  now: Date,
  fixture: Fixture | undefined
): MatchGate {
  if (!fixture) {
    // No league data for this date/teams — fall back to the calendar.
    const dayKey = gameDate;
    const nowKey = now.toISOString().slice(0, 10);
    if (dayKey < nowKey) return "finished"; // past date -> almost certainly played
    if (dayKey === nowKey) return "unknown"; // today, no feed row -> cannot know
    return "scheduled"; // future date -> definitely not finished
  }
  if (fixture.state === "post") return "finished";
  if (fixture.state === "in") return "live";
  return "scheduled";
}

export function lockLabel(gate: MatchGate): string {
  switch (gate) {
    case "scheduled":
      return "Match hasn't started yet";
    case "live":
      return "Match in progress";
    case "unknown":
      return "Waiting for match to finish";
    case "loading":
      return "Checking match status...";
    default:
      return "Waiting for match to finish";
  }
}

/**
 * Fetch fixture status for every distinct game date referenced by the bets so
 * cards know whether their match has kicked off / finished. Results are cached
 * per date and shared between bets of the same date.
 */
export function useMatchGates(bets: Bet[] | undefined) {
  const dates = [...new Set((bets || []).map((b) => b.game_date))].sort();

  const queries = useQueries({
    queries: dates.map((date) => ({
      queryKey: ["fixture-status", date],
      queryFn: async () => {
        const res = await fetch(`/api/fixtures?date=${date}`);
        if (!res.ok) throw new Error(`fixtures ${res.status} for ${date}`);
        const data = await res.json();
        return (Array.isArray(data?.fixtures) ? data.fixtures : []) as Fixture[];
      },
      staleTime: 60_000,
      refetchInterval: 60_000,
      retry: 1,
    })),
  });

  const byDate = new Map<string, Fixture[]>();
  dates.forEach((date, i) => byDate.set(date, queries[i]?.data ?? []));

  const loading = queries.some((q) => q.isLoading);

  return { byDate, loading };
}