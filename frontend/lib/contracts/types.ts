/**
 * TypeScript types for the GenLayer P2P Gambling contract.
 */

export type BetStatus = "OPEN" | "JOINED" | "RESOLVED" | "CANCELED";

export type BetSide = "1" | "2" | "0";

export interface Bet {
  id: string;
  creator: string;
  opponent: string;
  game_date: string;
  resolution_url?: string;
  team1: string;
  team2: string;
  creator_side: BetSide;
  opponent_side: string;
  handicap_halves: number;
  amount: number;
  status: BetStatus;
  real_winner: string;
  real_score: string;
  winner: string;
}

export interface TransactionReceipt {
  status: string;
  hash: string;
  blockNumber?: number;
  [key: string]: any;
}

export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
