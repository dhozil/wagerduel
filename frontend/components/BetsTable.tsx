"use client";

import { useState } from "react";
import { Loader2, Trophy, Clock, AlertCircle, Users, ExternalLink } from "lucide-react";
import {
  useBets,
  useJoinBet,
  useResolveBet,
  useCancelBet,
  useRefundExpired,
  useP2PGamblingContract,
  useOwner,
} from "@/lib/hooks/useP2PGambling";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { Bet, BetStatus } from "@/lib/contracts/types";

export function BetsTable() {
  const contract = useP2PGamblingContract();
  const { data: bets, isLoading, isError } = useBets();
  const { address, isConnected, isLoading: isWalletLoading } = useWallet();
  const { joinBet, isJoining, joiningBetId } = useJoinBet();
  const { resolveBet, isResolving, resolvingBetId } = useResolveBet();
  const { cancelBet, isCanceling, cancelingBetId } = useCancelBet();
  const { refundExpired, isRefunding, refundingBetId } = useRefundExpired();
  const { data: owner } = useOwner();
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  const handleJoin = (bet: Bet) => {
    if (!address) {
      error("Please connect your wallet to join bets");
      return;
    }
    if (bet.status !== "OPEN") return;

    const side = oppositeSide(bet.creator_side);
    const confirmed = confirm(
      `Join "${bet.team1} vs ${bet.team2}" for ${formatWei(bet.amount)} on side "${sideName(side, bet)}"?`
    );
    if (confirmed) {
      joinBet({ betId: bet.id, side });
    }
  };

  const handleResolve = (betId: string) => {
    if (!address) {
      error("Please connect your wallet to resolve bets");
      return;
    }
    const confirmed = confirm(
      "Resolve this bet? GenLayer's AI will verify the real match result and pay the winner."
    );
    if (confirmed) {
      resolveBet(betId);
    }
  };

  const handleCancel = (betId: string) => {
    if (!address) {
      error("Please connect your wallet to cancel bets");
      return;
    }
    const confirmed = confirm(
      "Cancel this bet? Your stake will be returned to your wallet."
    );
    if (confirmed) {
      cancelBet(betId);
    }
  };

  const handleRefundExpired = (bet: Bet) => {
    if (!address) {
      error("Please connect your wallet to refund bets");
      return;
    }
    const confirmed = confirm(
      `The settlement window for "${bet.team1} vs ${bet.team2}" has passed. Refund both players?`
    );
    if (confirmed) {
      refundExpired(bet.id);
    }
  };

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading bets...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-400 opacity-60" />
          <h3 className="text-xl font-bold">Setup Required</h3>
          <div className="space-y-2">
            <p className="text-muted-foreground">Contract address not configured.</p>
            <p className="text-sm text-muted-foreground">
              Please set{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                NEXT_PUBLIC_CONTRACT_ADDRESS
              </code>{" "}
              in your .env file.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="brand-card p-8">
        <div className="text-center">
          <p className="text-destructive">Failed to load bets. Please try again.</p>
        </div>
      </div>
    );
  }

  if (!bets || bets.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No Bets Yet</h3>
          <p className="text-muted-foreground">
            Be the first to create a head-to-head football bet!
          </p>
        </div>
      </div>
    );
  }

  const visibleBets =
    filter === "mine" && address
      ? bets.filter(
          (b) =>
            b.creator?.toLowerCase() === address.toLowerCase() ||
            (b.opponent &&
              b.opponent.toLowerCase() === address.toLowerCase())
        )
      : bets;

  if (visibleBets.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Users className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No bets involving you</h3>
          <p className="text-muted-foreground">
            You are not a participant in any bet yet. Create one or join an
            open challenge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-card p-6 overflow-hidden">
      {/* Filter tabs */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="inline-flex rounded-lg border border-gold/20 bg-gold/5 p-0.5">
          {(["all", "mine"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
                filter === f
                  ? "bg-gold text-[var(--primary-foreground)]"
                  : "text-muted-foreground hover:text-gold"
              }`}
            >
              {f === "all" ? "All Bets" : "My Bets"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {visibleBets.length} {visibleBets.length === 1 ? "bet" : "bets"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {[
                "Date",
                "Match",
                "Stake",
                "Sides",
                "Status",
                "Players",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {visibleBets.map((bet) => (
              <BetRow
                key={bet.id}
                bet={bet}
                currentAddress={address}
                isConnected={isConnected}
                isWalletLoading={isWalletLoading}
                onJoin={() => handleJoin(bet)}
                onResolve={() => handleResolve(bet.id)}
                onCancel={() => handleCancel(bet.id)}
                onRefundExpired={() => handleRefundExpired(bet)}
                expired={isExpired(bet.game_date)}
                isOwner={isOwner}
                busy={isJoining || isResolving || isCanceling || isRefunding}
                busyTarget={
                  joiningBetId || resolvingBetId || cancelingBetId || refundingBetId
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sideName(side: string, bet: Bet): string {
  if (side === "1") return bet.team1;
  if (side === "2") return bet.team2;
  if (side === "0") return "Draw";
  return side;
}

function oppositeSide(creatorSide: string): string {
  if (creatorSide === "0") return "1";
  return creatorSide === "1" ? "2" : "1";
}

function formatWei(value: number): string {
  if (!value) return "0";
  if (value >= 1e18) return `${(value / 1e18).toFixed(4)} GEN`;
  return `${value} wei`;
}

const FEE_BPS = 200;

function feeOf(amount: number): number {
  return Math.max((amount * 2 * FEE_BPS) / 10000, 1);
}

function payoutOf(amount: number): number {
  return amount * 2 - feeOf(amount);
}

function truncateUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").slice(0, 42) + (url.length > 42 ? "…" : "");
}

const SETTLEMENT_WINDOW_DAYS = 14;

function isExpired(gameDate: string): boolean {
  const d = new Date(`${gameDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return false;
  const deadline = new Date(d);
  deadline.setUTCDate(deadline.getUTCDate() + SETTLEMENT_WINDOW_DAYS);
  return new Date() >= deadline;
}

interface BetRowProps {
  bet: Bet;
  currentAddress: string | null;
  isConnected: boolean;
  isWalletLoading: boolean;
  onJoin: () => void;
  onResolve: () => void;
  onCancel: () => void;
  onRefundExpired: () => void;
  expired: boolean;
  isOwner: boolean;
  busy: boolean;
  busyTarget: string | null;
}

function statusBadge(status: BetStatus) {
  switch (status) {
    case "OPEN":
      return (
        <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Open
        </Badge>
      );
    case "JOINED":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <Users className="w-3 h-3 mr-1" />
          Active (2 Players)
        </Badge>
      );
    case "RESOLVED":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <Trophy className="w-3 h-3 mr-1" />
          Resolved
        </Badge>
      );
    case "CANCELED":
      return (
        <Badge variant="outline" className="text-muted-foreground border-white/20">
          Canceled
        </Badge>
      );
  }
}

function BetRow({
  bet,
  currentAddress,
  isConnected,
  isWalletLoading,
  onJoin,
  onResolve,
  onCancel,
  onRefundExpired,
  expired,
  isOwner,
  busy,
  busyTarget,
}: BetRowProps) {
  const me = (addr: string) =>
    addr && currentAddress?.toLowerCase() === addr.toLowerCase();

  const isCreator = me(bet.creator);
  const isOpponent = me(bet.opponent);
  const isBusy = busy && busyTarget === bet.id;

  let action: React.ReactNode = null;
  if (bet.status === "OPEN") {
    if (isCreator) {
      action = (
        <Button onClick={onCancel} disabled={isBusy || isWalletLoading} size="sm" variant="outline">
          {isBusy ? "Canceling..." : "Cancel"}
        </Button>
      );
    } else if (isConnected && currentAddress && !isWalletLoading && !isOwner) {
      action = (
        <Button onClick={onJoin} disabled={isBusy} size="sm" variant="gradient">
          {isBusy ? "Joining..." : "Join"}
        </Button>
      );
    }
  } else if (bet.status === "JOINED") {
    if (isConnected && currentAddress && !isWalletLoading) {
      if (expired) {
        // Settlement window passed — the deterministic refund is available.
        action = (
          <div className="flex flex-col gap-1.5">
            <Button onClick={onRefundExpired} disabled={isBusy} size="sm" variant="outline" className="border-gold/40 text-gold hover:bg-gold/10">
              {isBusy ? "Refunding..." : "Refund (expired)"}
            </Button>
            <Button onClick={onResolve} disabled={isBusy} size="sm" variant="ghost" className="text-xs text-muted-foreground">
              Resolve anyway
            </Button>
          </div>
        );
      } else {
        action = (
          <Button onClick={onResolve} disabled={isBusy} size="sm" variant="gradient">
            {isBusy ? "Resolving..." : "Resolve"}
          </Button>
        );
      }
    }
  }

  return (
    <tr
      className={`group transition-colors animate-fade-in ${
        bet.status === "JOINED" && expired
          ? "bg-amber-500/10 hover:bg-amber-500/15"
          : "hover:bg-white/5"
      }`}
    >
      <td className="px-4 py-4">
        <span className="text-sm">{bet.game_date}</span>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{bet.team1}</span>
          <span className="text-xs text-muted-foreground">vs</span>
          <span className="text-sm font-semibold">{bet.team2}</span>
        </div>
        {bet.resolution_url && (
          <a
            href={bet.resolution_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {truncateUrl(bet.resolution_url)}
          </a>
        )}
      </td>
      <td className="px-4 py-4">
        <span className="text-sm font-semibold text-accent">
          {formatWei(bet.amount)}
        </span>
        <span className="text-xs text-muted-foreground ml-1">each</span>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-1">
          <div className="text-xs">
            <span className="text-muted-foreground">Creator: </span>
            <span className="font-semibold">{sideName(bet.creator_side, bet)}</span>
          </div>
          {bet.opponent_side && (
            <div className="text-xs">
              <span className="text-muted-foreground">Opponent: </span>
              <span className="font-semibold">{sideName(bet.opponent_side, bet)}</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          {statusBadge(bet.status)}
          {bet.status === "RESOLVED" && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {bet.real_winner === "REFUND" ? (
                <div className="text-muted-foreground">Refunded (expired)</div>
              ) : bet.real_winner === "0" ? (
                <>
                  <div>
                    Score {bet.real_score} -{" "}
                    <span className="text-yellow-400 font-semibold">Draw</span>
                  </div>
                  <div className="text-[11px]">Both stakes refunded - no fee</div>
                </>
              ) : (
                <>
                  <div>
                    Winner:{" "}
                    <span className="font-semibold">
                      {sideName(bet.real_winner, bet)} {bet.real_score}
                    </span>
                  </div>
                  <div className="text-[11px]">
                    Payout {formatWei(payoutOf(bet.amount))} ·{" "}
                    <span className="text-gold">fee {formatWei(feeOf(bet.amount))}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Creator</span>
            <AddressDisplay address={bet.creator} maxLength={8} />
            {isCreator && (
              <Badge variant="secondary" className="text-[10px]">
                You
              </Badge>
            )}
          </div>
          {bet.opponent && bet.opponent !== "0x0000000000000000000000000000000000000000" ? (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Opponent</span>
              <AddressDisplay address={bet.opponent} maxLength={8} />
              {isOpponent && (
                <Badge variant="secondary" className="text-[10px]">
                  You
                </Badge>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Waiting for opponent...</span>
          )}
        </div>
      </td>
      <td className="px-4 py-4">{action}</td>
    </tr>
  );
}
