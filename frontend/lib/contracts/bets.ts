import type { Bet } from "./types";

export const SETTLEMENT_WINDOW_DAYS = 14;
export const FEE_BPS = 200;

export function sideName(side: string, bet: Bet): string {
  if (side === "1") return bet.team1;
  if (side === "2") return bet.team2;
  if (side === "0") return "Draw";
  return side;
}

function fmtGoals(goals: number): string {
  return Number.isInteger(goals) ? String(goals) : goals.toFixed(1);
}

/**
 * Human-readable handicap line for a bet, or null when there is no voor.
 * Positive halves = Team 2 gets the head start, negative = Team 1.
 */
export function handicapLabel(bet: Bet): string | null {
  const h = Number(bet.handicap_halves) || 0;
  if (h === 0) return null;
  return h > 0
    ? `${bet.team2} +${fmtGoals(h / 2)}`
    : `${bet.team1} +${fmtGoals(-h / 2)}`;
}

export function oppositeSide(creatorSide: string): string {
  if (creatorSide === "0") return "1";
  return creatorSide === "1" ? "2" : "1";
}

export function feeOf(amount: number): number {
  return Math.max((amount * 2 * FEE_BPS) / 10000, 1);
}

export function payoutOf(amount: number): number {
  return amount * 2 - feeOf(amount);
}

export function truncateUrl(url: string): string {
  return (
    url.replace(/^https?:\/\//, "").slice(0, 42) +
    (url.length > 42 ? "…" : "")
  );
}

export function truncateBetId(id: string): string {
  if (id.length <= 28) return id;
  return `${id.slice(0, 26)}…`;
}

export function isExpired(gameDate: string): boolean {
  const d = new Date(`${gameDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const deadline = new Date(d);
  deadline.setUTCDate(deadline.getUTCDate() + SETTLEMENT_WINDOW_DAYS);
  return new Date() >= deadline;
}
