"use client";

import { useState, type FormEvent } from "react";
import {
  Search,
  Loader2,
  Users,
  Trophy,
  Copy,
  Clock,
  Target,
  ArrowRight,
} from "lucide-react";
import { useBetById, useJoinBet } from "@/lib/hooks/useP2PGambling";
import {
  useMatchGates,
  matchGateForBet,
  findFixtureForBet,
  type MatchGate,
} from "@/lib/hooks/useFixtureStatus";
import { useWallet } from "@/lib/genlayer/wallet";
import { error, success } from "@/lib/utils/toast";
import { copyText, formatWei } from "@/lib/utils";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { handicapLabel } from "@/lib/contracts/bets";
import type { Bet } from "@/lib/contracts/types";

function oppositeSide(creatorSide: string): string {
  if (creatorSide === "0") return "1";
  return creatorSide === "1" ? "2" : "1";
}

function sideName(side: string, bet: Bet): string {
  if (side === "1") return bet.team1;
  if (side === "2") return bet.team2;
  if (side === "0") return "Draw";
  return side;
}

export function JoinBetByID() {
  const { address, isConnected } = useWallet();
  const [input, setInput] = useState("");
  const [searchedId, setSearchedId] = useState<string | null>(null);
  const { data: bet, isLoading, isFetching } = useBetById(searchedId);
  const { joinBet, isJoining, joiningBetId } = useJoinBet();

  const { byDate } = useMatchGates(bet && bet.id ? [bet] : undefined);
  const gate: MatchGate = bet
    ? matchGateForBet(
        bet.game_date,
        new Date(),
        findFixtureForBet(byDate.get(bet.game_date) ?? [], bet)
      )
    : "loading";

  const handleFind = (e: FormEvent) => {
    e.preventDefault();
    const id = input.trim().toLowerCase();
    if (!id) {
      error("Enter a bet ID", { description: "Paste the bet ID you want to find." });
      return;
    }
    setSearchedId(id);
  };

  const handleJoin = (b: Bet) => {
    if (!address) {
      error("Please connect your wallet to join bets");
      return;
    }
    if (b.status !== "OPEN") return;
    if (gate === "finished") {
      error("This match has already finished — bet can no longer be joined");
      return;
    }
    if (gate === "live") {
      error("This match is in progress — bet can no longer be joined");
      return;
    }
    if (gate === "unknown") {
      error("This match is scheduled for today — bet can no longer be joined");
      return;
    }

    const side = oppositeSide(b.creator_side);
    // No browser confirm here: joining is a wallet transaction and the join
    // hook surfaces its own success/error toasts + the wallet's own popup.
    joinBet({ betId: b.id, side });
  };

  const handleCopy = async (id: string) => {
    await copyText(id);
    success("Bet ID copied", { description: id });
  };

  const searching =
    (isLoading || isFetching) && searchedId !== null;
  const notFound =
    !searching && searchedId !== null && (!bet || !bet.id || !bet.status);
  const isCreator =
    !!bet && !!address && bet.creator.toLowerCase() === address.toLowerCase();

  return (
    <div className="brand-card p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center shrink-0">
          <Target className="w-5 h-5 text-[var(--primary-foreground)]" />
        </div>
        <div>
          <h2 className="text-lg font-bold uppercase">Join a Bet by ID</h2>
          <p className="text-xs text-muted-foreground">
            Know the bet ID? Paste it to jump straight into the duel.
          </p>
        </div>
      </div>

      <form onSubmit={handleFind} className="mt-4 space-y-2">
        <Label htmlFor="bet-id" className="text-xs uppercase tracking-wider text-muted-foreground">
          Bet ID
        </Label>
        <div className="flex gap-2">
          <Input
            id="bet-id"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. 2026-08-30_spain_italy"
            className="font-mono text-sm"
          />
          <Button type="submit" variant="gradient" disabled={searching}>
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Find
          </Button>
        </div>
      </form>

      {/* Result area */}
      <div className="mt-4">
        {searching && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        )}

        {notFound && (
          <div className="text-center py-6 space-y-2">
            <Users className="w-10 h-10 mx-auto text-muted-foreground opacity-40" />
            <p className="text-sm font-semibold">Bet not found</p>
            <p className="text-xs text-muted-foreground">
              Double-check the ID — it looks like{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
                {searchedId}
              </code>
            </p>
          </div>
        )}

        {!searching && !notFound && bet && bet.id && bet.status && (
          <div className="felt-panel rounded-2xl p-5 space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                <span className="font-display font-semibold">
                  {bet.team1} <span className="text-muted-foreground">vs</span>{" "}
                  {bet.team2}
                </span>
              </div>
              <Badge
                variant="outline"
                className={
                  bet.status === "OPEN"
                    ? "text-yellow-400 border-yellow-500/30"
                    : bet.status === "JOINED"
                      ? "text-green-400 border-green-500/30"
                      : bet.status === "RESOLVED"
                        ? "text-green-400 border-green-500/30"
                        : "text-muted-foreground border-white/20"
                }
              >
                {bet.status}
              </Badge>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Stake (each)</div>
                <div className="font-bold text-accent">{formatWei(bet.amount)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Date</div>
                <div className="font-semibold">{bet.game_date}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Creator side</div>
                <div className="font-semibold">{sideName(bet.creator_side, bet)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Voor</div>
                {(() => {
                  const voor = handicapLabel(bet);
                  return voor ? (
                    <div className="font-semibold text-gold">{voor}</div>
                  ) : (
                    <div className="text-muted-foreground">None</div>
                  );
                })()}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Creator</div>
                <AddressDisplay address={bet.creator} maxLength={10} />
              </div>
            </div>

            {/* Bet ID + copy */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/10 border border-white/10 px-3 py-2">
              <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
                {bet.id}
              </code>
              <button
                onClick={() => handleCopy(bet.id)}
                className="text-muted-foreground hover:text-gold transition-colors cursor-pointer"
                title="Copy bet ID"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action */}
            <div className="pt-1">
              {isCreator ? (
                <p className="text-xs text-center text-muted-foreground">
                  You created this bet. Share its ID with a rival to start the
                  duel.
                </p>
              ) : bet.status === "OPEN" ? (
                gate === "finished" ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full text-muted-foreground"
                    title="Match already finished"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Match already finished
                  </Button>
                ) : gate === "live" ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full text-muted-foreground"
                    title="Match is in progress"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Match in progress
                  </Button>
                ) : gate === "unknown" ? (
                  <Button
                    disabled
                    variant="outline"
                    className="w-full text-muted-foreground"
                    title="Match is scheduled for today"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Match today — join blocked
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleJoin(bet)}
                    disabled={isJoining && joiningBetId === bet.id}
                    variant="gradient"
                    className="w-full"
                  >
                    {isJoining && joiningBetId === bet.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Join on {sideName(oppositeSide(bet.creator_side), bet)} for{" "}
                        {formatWei(bet.amount)}
                        {(() => {
                          const voor = handicapLabel(bet);
                          return voor ? (
                            <>
                              {" "}
                              <span className="text-gold">
                                · {sideName(bet.creator_side, bet)} gives {voor}
                              </span>
                            </>
                          ) : null;
                        })()}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                )
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  This bet is no longer open.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}