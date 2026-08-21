"use client";

import { useState } from "react";
import { Wallet, Trophy, Hourglass, XCircle, Loader2, AlertCircle, Coins } from "lucide-react";
import { useBets, useTotalEscrow, useP2PGamblingContract, useOwner, useOwnerFees, useWithdrawFees } from "@/lib/hooks/useP2PGambling";
import { useWallet } from "@/lib/genlayer/wallet";
import { formatWei } from "@/lib/utils";
import { Button } from "./ui/button";

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
      <div className="brand-card p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          <span className="text-xs text-muted-foreground">Contract not configured</span>
        </div>
      </div>
    );
  }

  const openBets = (bets || []).filter((b) => b.status === "OPEN").length;
  const joinedBets = (bets || []).filter((b) => b.status === "JOINED").length;
  const resolvedBets = (bets || []).filter((b) => b.status === "RESOLVED").length;

  const stats = [
    {
      label: "Escrow",
      value: formatWei(escrow || 0),
      icon: Wallet,
      color: "text-accent",
    },
    {
      label: "Open",
      value: String(openBets),
      icon: Hourglass,
      color: "text-yellow-400",
    },
    {
      label: "Active",
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
    <div className="brand-card p-4">
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-sm font-bold">{stat.value}</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</span>
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Coins className="w-3 h-3 text-gold" />
              Fee balance
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
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Withdrawing...
              </>
            ) : (
              <>
                <Coins className="w-3 h-3 mr-1.5" />
                {confirmOpen ? "Confirm?" : "Withdraw fees"}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
