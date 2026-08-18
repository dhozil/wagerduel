"use client";

import { useState } from "react";
import { Wallet, Trophy, Hourglass, XCircle, Loader2, AlertCircle, Coins } from "lucide-react";
import { useBets, useTotalEscrow, useP2PGamblingContract, useOwner, useOwnerFees, useWithdrawFees } from "@/lib/hooks/useP2PGambling";
import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "./ui/button";

function formatWei(value: number): string {
  if (!value) return "0";
  if (value >= 1e18) return `${(value / 1e18).toFixed(4)} GEN`;
  return `${value} wei`;
}

export function MarketStats() {
  const contract = useP2PGamblingContract();
  const { data: bets, isLoading } = useBets();
  const { data: escrow } = useTotalEscrow();
  const { data: owner } = useOwner();
  const { data: ownerFees = 0 } = useOwnerFees();
  const { address } = useWallet();
  const { withdrawFees, isWithdrawing } = useWithdrawFees();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isOwner = !!owner && !!address && owner.toLowerCase() === address.toLowerCase();

  if (isLoading) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-accent" />
          Arena Overview
        </h2>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-accent" />
          Arena Overview
        </h2>
        <div className="text-center py-8 space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-yellow-400 opacity-60" />
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Setup Required</p>
            <p className="text-xs text-muted-foreground">Contract address not configured</p>
          </div>
        </div>
      </div>
    );
  }

  const openBets = (bets || []).filter((b) => b.status === "OPEN").length;
  const joinedBets = (bets || []).filter((b) => b.status === "JOINED").length;
  const resolvedBets = (bets || []).filter((b) => b.status === "RESOLVED").length;

  const stats = [
    {
      label: "Total Escrow",
      value: formatWei(escrow || 0),
      icon: Wallet,
      color: "text-accent",
    },
    {
      label: "Open Bets",
      value: String(openBets),
      icon: Hourglass,
      color: "text-yellow-400",
    },
    {
      label: "Active (2 Players)",
      value: String(joinedBets),
      icon: Trophy,
      color: "text-green-400",
    },
    {
      label: "Resolved",
      value: String(resolvedBets),
      icon: XCircle,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="brand-card p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-accent" />
        Arena Overview
      </h2>

      <div className="space-y-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-sm text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-sm font-bold">{stat.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground border-t border-white/10 pt-3">
        Stakes are held by the contract and paid to the winner automatically after the match is resolved by AI-verified real-world data. A flat 2% platform fee is taken from each settled pot and held for the owner.
      </p>

      {isOwner && (
        <div className="mt-4 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-gold" />
              Owner fee balance
            </span>
            <span className="font-bold text-gold">{formatWei(ownerFees)}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-gold/40 text-gold hover:bg-gold/10"
            onClick={() => {
              if (confirmOpen) {
                withdrawFees();
                setConfirmOpen(false);
              } else {
                setConfirmOpen(true);
                setTimeout(() => setConfirmOpen(false), 4000);
              }
            }}
            disabled={isWithdrawing || ownerFees <= 0}
          >
            {isWithdrawing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Withdrawing...
              </>
            ) : (
              <>
                <Coins className="w-3.5 h-3.5 mr-1.5" />
                {confirmOpen ? "Confirm withdrawal?" : "Withdraw fees"}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
