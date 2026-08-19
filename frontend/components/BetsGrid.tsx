"use client";

import { useState } from "react";
import {
  Loader2,
  Trophy,
  Clock,
  AlertCircle,
  Users,
  ExternalLink,
  Copy,
  Swords,
  Target,
  Lock,
} from "lucide-react";
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
import { copyText, formatWei } from "@/lib/utils";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  sideName,
  oppositeSide,
  feeOf,
  payoutOf,
  truncateBetId,
  truncateUrl,
  isExpired,
  handicapLabel,
} from "@/lib/contracts/bets";
import type { Bet, BetStatus } from "@/lib/contracts/types";
import {
  useMatchGates,
  findFixtureForBet,
  matchGateForBet,
  lockLabel,
} from "@/lib/hooks/useFixtureStatus";
import type { MatchGate } from "@/lib/hooks/useFixtureStatus";

export function BetsGrid() {
  const contract = useP2PGamblingContract();
  const { data: bets, isLoading, isError } = useBets();
  const { address, isConnected, isLoading: isWalletLoading } = useWallet();
  const { joinBet, isJoining, joiningBetId } = useJoinBet();
  const { resolveBet, isResolving, resolvingBetId } = useResolveBet();
  const { cancelBet, isCanceling, cancelingBetId } = useCancelBet();
  const { refundExpired, isRefunding, refundingBetId } = useRefundExpired();
  const { data: owner } = useOwner();
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const { byDate, loading: gatesLoading } = useMatchGates(bets);
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  const matchGate = (bet: Bet): MatchGate => {
    const dateFixtures = byDate.get(bet.game_date);
    // While a date's fixture feed is still fetching and we have nothing cached
    // for it, report "loading" so the Resolve button shows a checking label
    // instead of locking on a premature verdict.
    if (gatesLoading && !dateFixtures?.length) return "loading";
    return matchGateForBet(
      bet.game_date,
      new Date(),
      findFixtureForBet(dateFixtures ?? [], bet)
    );
  };

  const handleJoin = (bet: Bet) => {
    if (!address) {
      error("Please connect your wallet to join bets");
      return;
    }
    if (bet.status !== "OPEN") return;

    const side = oppositeSide(bet.creator_side);
    const confirmed = confirm(
      `Join "${bet.team1} vs ${bet.team2}" for ${formatWei(
        bet.amount
      )} on side "${sideName(side, bet)}"?`
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
      <div className="brand-card p-12 flex items-center justify-center">
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
            <p className="text-muted-foreground">
              Contract address not configured.
            </p>
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
      <div className="brand-card p-12">
        <div className="text-center">
          <p className="text-destructive">
            Failed to load bets. Please try again.
          </p>
        </div>
      </div>
    );
  }

  const visibleBets = (bets || []).filter((b) => {
    if (filter !== "mine") return true;
    if (!address) return false;
    return (
      b.creator?.toLowerCase() === address.toLowerCase() ||
      (b.opponent && b.opponent.toLowerCase() === address.toLowerCase())
    );
  });

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center justify-between px-1">
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

      {visibleBets.length === 0 ? (
        <div className="brand-card p-12 text-center space-y-3">
          {!address ? (
            <>
              <Users className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
              <h3 className="text-xl font-bold">Connect to View Your Bets</h3>
              <p className="text-muted-foreground">
                Connect your wallet to see the bets you created or joined.
              </p>
            </>
          ) : (
            <>
              <Trophy className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
              <h3 className="text-xl font-bold">No Bets Yet</h3>
              <p className="text-muted-foreground">
                {filter === "mine"
                  ? "You are not a participant in any bet yet. Create one or join an open challenge."
                  : "Be the first to create a head-to-head football bet!"}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleBets.map((bet) => (
            <BetCard
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
              gate={matchGate(bet)}
              isOwner={isOwner}
              busy={isJoining || isResolving || isCanceling || isRefunding}
              busyTarget={
                joiningBetId || resolvingBetId || cancelingBetId || refundingBetId
              }
            />
          ))}
        </div>
      )}
    </div>
  );
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

interface BetCardProps {
  bet: Bet;
  currentAddress: string | null;
  isConnected: boolean;
  isWalletLoading: boolean;
  onJoin: () => void;
  onResolve: () => void;
  onCancel: () => void;
  onRefundExpired: () => void;
  expired: boolean;
  gate: MatchGate;
  isOwner: boolean;
  busy: boolean;
  busyTarget: string | null;
}

function BetCard({
  bet,
  currentAddress,
  isConnected,
  isWalletLoading,
  onJoin,
  onResolve,
  onCancel,
  onRefundExpired,
  expired,
  gate,
  isOwner,
  busy,
  busyTarget,
}: BetCardProps) {
  const me = (addr: string) =>
    addr && currentAddress?.toLowerCase() === addr.toLowerCase();

  const isCreator = me(bet.creator);
  const isOpponent = me(bet.opponent);
  const isBusy = busy && busyTarget === bet.id;
  const expiredJoined = bet.status === "JOINED" && expired;

  let action: React.ReactNode = null;
  if (bet.status === "OPEN") {
    if (isCreator) {
      action = (
        <Button
          onClick={onCancel}
          disabled={isBusy || isWalletLoading}
          variant="outline"
          className="w-full"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Canceling...
            </>
          ) : (
            "Cancel Bet"
          )}
        </Button>
      );
    } else if (isConnected && currentAddress && !isWalletLoading && !isOwner) {
      action = (
        <Button onClick={onJoin} disabled={isBusy} variant="gradient" className="w-full">
          {isBusy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Joining...
            </>
          ) : (
            <>
              <Target className="w-4 h-4 mr-2" />
              Join on {sideName(oppositeSide(bet.creator_side), bet)} ·{" "}
              {formatWei(bet.amount)}
            </>
          )}
        </Button>
      );
    } else if (!isConnected && !isOwner) {
      action = (
        <Button variant="gradient" className="w-full" disabled>
          Connect to Join
        </Button>
      );
    }
  } else if (bet.status === "JOINED") {
    if (isConnected && currentAddress && !isWalletLoading) {
      const finished = gate === "finished";
      if (expired) {
        action = (
          <div className="flex flex-col gap-1.5">
            <Button
              onClick={onRefundExpired}
              disabled={isBusy}
              variant="outline"
              className="w-full border-gold/40 text-gold hover:bg-gold/10"
            >
              {isBusy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Refunding...
                </>
              ) : (
                "Refund (expired)"
              )}
            </Button>
            <Button
              onClick={onResolve}
              disabled={isBusy || !finished}
              variant="ghost"
              className="w-full text-xs text-muted-foreground"
              title={finished ? "Resolve despite the expired window" : lockLabel(gate)}
            >
              {finished
                ? "Resolve anyway"
                : gate === "loading"
                  ? lockLabel(gate)
                  : `Locked · ${lockLabel(gate)}`}
            </Button>
          </div>
        );
      } else if (!finished) {
        action = (
          <Button
            disabled
            variant="outline"
            className="w-full text-muted-foreground"
            title={lockLabel(gate)}
          >
            <Lock className="w-4 h-4 mr-2" />
            {gate === "loading" ? lockLabel(gate) : `Locked · ${lockLabel(gate)}`}
          </Button>
        );
      } else {
        action = (
          <Button onClick={onResolve} disabled={isBusy} variant="gradient" className="w-full">
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resolving...
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        );
      }
    }
  }

  const hasResolutionUrl =
    bet.status === "OPEN" || bet.status === "JOINED" || bet.status === "RESOLVED";

  return (
    <div
      className={`brand-card brand-card-hover p-5 flex flex-col animate-fade-in ${
        expiredJoined ? "border-amber-500/40" : ""
      }`}
    >
      {/* Top row: status + copy ID */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {statusBadge(bet.status)}
        <button
          onClick={() => copyText(bet.id)}
          title="Copy bet ID — share it with your rival"
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-gold transition-colors cursor-pointer"
        >
          <Copy className="w-3 h-3" />
          <code className="font-mono">{truncateBetId(bet.id)}</code>
        </button>
      </div>

      {/* Teams */}
      <div className="text-center space-y-1">
        <div className="font-display font-bold text-lg truncate">{bet.team1}</div>
        <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Swords className="w-3.5 h-3.5 text-gold" />
          vs
        </div>
        <div className="font-display font-bold text-lg truncate">{bet.team2}</div>
      </div>

      {/* Handicap line */}
      {(() => {
        const voor = handicapLabel(bet);
        return voor ? (
          <div className="mt-3 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
              <Target className="w-3 h-3" />
              Voor: {voor}
            </span>
          </div>
        ) : null;
      })()}

      {/* Meta grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Stake (each)
          </div>
          <div className="font-bold text-accent">{formatWei(bet.amount)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Match date
          </div>
          <div className="font-semibold">{bet.game_date}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Creator side
          </div>
          <div className="font-semibold">{sideName(bet.creator_side, bet)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Opponent side
          </div>
          {bet.opponent_side ? (
            <div className="font-semibold">{sideName(bet.opponent_side, bet)}</div>
          ) : (
            <div className="text-muted-foreground italic">Waiting...</div>
          )}
        </div>
      </div>

      {/* Players */}
      <div className="mt-4 space-y-1.5 text-xs">
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
          <div className="text-muted-foreground italic">
            Waiting for an opponent...
          </div>
        )}
      </div>

      {/* Resolution URL */}
      {hasResolutionUrl && bet.resolution_url && (
        <a
          href={bet.resolution_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-gold transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {truncateUrl(bet.resolution_url)}
        </a>
      )}

      {/* Resolved outcome */}
      {bet.status === "RESOLVED" && (
        <div className="mt-3 rounded-lg felt-panel px-3 py-2 text-xs space-y-0.5">
          {bet.real_winner === "REFUND" ? (
            <div className="text-muted-foreground">
              Refunded (settlement window passed)
            </div>
          ) : bet.real_winner === "0" ? (
            <>
              <div>
                Score {bet.real_score} —{" "}
                <span className="text-yellow-400 font-semibold">Draw</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Both stakes refunded, no fee
              </div>
            </>
          ) : (
            <>
              <div>
                Winner:{" "}
                <span className="font-semibold">
                  {sideName(bet.real_winner, bet)} {bet.real_score}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Payout {formatWei(payoutOf(bet.amount))} ·{" "}
                <span className="text-gold">
                  fee {formatWei(feeOf(bet.amount))}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {expiredJoined && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400">
          <Clock className="w-3 h-3" />
          Settlement window passed — refund available
        </div>
      )}

      {/* Action */}
      {action && (
        <div className="mt-4 pt-4 border-t border-white/10">{action}</div>
      )}
    </div>
  );
}
