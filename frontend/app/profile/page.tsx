"use client";

import { useState } from "react";
import {
  Wallet,
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trophy,
  Swords,
  User,
  Crown,
  Activity,
  Loader2,
  Plus,
  Minus,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useWallet } from "@/lib/genlayer/wallet";
import {
  useBets,
  useBalance,
  useOwner,
  useOwnerFees,
  useDeposit,
  useWithdraw,
  useWithdrawFees,
} from "@/lib/hooks/useP2PGambling";
import { AddressDisplay } from "@/components/AddressDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { error } from "@/lib/utils/toast";
import { formatWei } from "@/lib/utils";
import type { Bet } from "@/lib/contracts/types";

const WEI_PER_TOKEN = BigInt(1_000_000_000_000_000_000);

function parseTokens(str: string): bigint | null {
  const num = Number(str);
  if (!isFinite(num) || num <= 0) return null;
  return BigInt(Math.round(num * Number(WEI_PER_TOKEN)));
}

const AMOUNT_STEP = 0.5;

function adjustAmount(current: string, delta: number): string {
  const parsed = current === "" || current === "0" ? 0 : Number(current);
  if (!isFinite(parsed)) return current;
  const next = Math.max(0, parsed + delta);
  return String(Math.round(next * 1000) / 1000);
}

function sideName(side: string, bet: Bet): string {
  if (side === "1") return bet.team1;
  if (side === "2") return bet.team2;
  if (side === "0") return "Draw";
  return side;
}

export default function ProfilePage() {
  const { address, isConnected } = useWallet();
  const { data: bets } = useBets();
  const { data: balance = 0 } = useBalance(address);
  const { data: owner } = useOwner();
  const { data: ownerFees = 0 } = useOwnerFees();

  const { deposit, isDepositing } = useDeposit();
  const { withdraw, isWithdrawing } = useWithdraw();
  const { withdrawFees, isWithdrawing: isWithdrawingFees } = useWithdrawFees();

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  const myBets = (bets || []).filter(
    (b) =>
      b.creator?.toLowerCase() === address?.toLowerCase() ||
      (b.opponent && b.opponent.toLowerCase() === address?.toLowerCase())
  );

  const created = myBets.filter(
    (b) => b.creator?.toLowerCase() === address?.toLowerCase()
  ).length;
  const joined = myBets.filter(
    (b) =>
      b.opponent &&
      b.opponent !== "0x0000000000000000000000000000000000000000" &&
      b.opponent.toLowerCase() === address?.toLowerCase()
  ).length;
  const wins = myBets.filter(
    (b) => b.winner?.toLowerCase() === address?.toLowerCase()
  ).length;

  const stats = [
    { icon: Swords, label: "Bets Created", value: created },
    { icon: Wallet, label: "Bets Joined", value: joined },
    { icon: Trophy, label: "Duels Won", value: wins },
    { icon: Activity, label: "Total Bets", value: myBets.length },
  ];

  const handleDeposit = () => {
    const amount = parseTokens(depositAmt);
    if (!amount) {
      error("Invalid amount", { description: "Enter an amount greater than 0." });
      return;
    }
    deposit(amount);
    setDepositAmt("");
  };

  const handleWithdraw = () => {
    const amount = parseTokens(withdrawAmt);
    if (!amount) {
      error("Invalid amount", { description: "Enter an amount greater than 0." });
      return;
    }
    withdraw(amount);
    setWithdrawAmt("");
  };
  return (
    <div id="top" className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-32 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-screen-xl mx-auto">
          {/* Header */}
          <div className="brand-card p-6 flex flex-col sm:flex-row sm:items-center gap-5 animate-slide-up">
            <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center shrink-0">
              <User className="w-8 h-8 text-[var(--primary-foreground)]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-bold uppercase">Wallet &amp; Profile</h1>
                {isOwner && (
                  <Badge className="bg-gold text-[var(--primary-foreground)] uppercase tracking-wider">
                    <Crown className="w-3 h-3 mr-1" />
                    Owner
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {isConnected ? <AddressDisplay address={address!} maxLength={24} /> : "Wallet not connected"}
              </p>
            </div>
            {isOwner && (
              <div className="brand-card p-4 text-center">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">
                  Owner Fee Balance
                </div>
                <div className="font-display font-bold text-2xl text-gold">
                  {formatWei(ownerFees)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-gold/40 text-gold hover:bg-gold/10 w-full"
                  onClick={() => withdrawFees()}
                  disabled={isWithdrawingFees || ownerFees <= 0}
                >
                  {isWithdrawingFees ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Coins className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Withdraw fees
                </Button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
            {stats.map((s) => (
              <div key={s.label} className="brand-card brand-card-hover p-5 text-center">
                <s.icon className="w-6 h-6 text-gold mx-auto mb-2" />
                <div className="font-display font-bold text-3xl">{s.value}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Wallet */}
            <div className="brand-card p-6 animate-slide-up" style={{ animationDelay: "150ms" }}>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-gold" />
                Your Balance
              </h2>
              <div className="brand-card p-5 text-center mb-5">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Available</div>
                <div className="font-display font-bold text-4xl text-gold mt-1">
                  {formatWei(balance)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Claim your winnings anytime - no need to wait on the bet page.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="deposit" className="flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 !text-white" /> Deposit (GEN)
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Decrease deposit amount"
                      onClick={() => setDepositAmt((v) => adjustAmount(v, -AMOUNT_STEP))}
                      disabled={isDepositing}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      id="deposit"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      className="text-center"
                      value={depositAmt}
                      onChange={(e) => setDepositAmt(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Increase deposit amount"
                      onClick={() => setDepositAmt((v) => adjustAmount(v, AMOUNT_STEP))}
                      disabled={isDepositing}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleDeposit}
                      disabled={isDepositing || !depositAmt}
                      variant="gradient"
                      className="shrink-0"
                    >
                      {isDepositing ? "..." : "Deposit"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="withdraw" className="flex items-center gap-2">
                    <ArrowUpFromLine className="w-4 h-4 !text-white" /> Withdraw (GEN)
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Decrease withdraw amount"
                      onClick={() => setWithdrawAmt((v) => adjustAmount(v, -AMOUNT_STEP))}
                      disabled={isWithdrawing}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      id="withdraw"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="0"
                      className="text-center"
                      value={withdrawAmt}
                      onChange={(e) => setWithdrawAmt(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      aria-label="Increase withdraw amount"
                      onClick={() => setWithdrawAmt((v) => adjustAmount(v, AMOUNT_STEP))}
                      disabled={isWithdrawing}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleWithdraw}
                      disabled={isWithdrawing || !withdrawAmt}
                      variant="outline"
                      className="shrink-0 border-gold/40 text-gold hover:bg-gold/10"
                    >
                      {isWithdrawing ? "..." : "Withdraw"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Activity */}
            <div className="brand-card p-6 animate-slide-up" style={{ animationDelay: "200ms" }}>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-gold" />
                Activity
              </h2>
              {myBets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  You have no bets yet. Create one or join an open match.
                </p>
              ) : (
                <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
                  {myBets.map((b) => (
                    <div key={b.id} className="brand-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">
                          {b.team1} vs {b.team2}
                        </span>
                        <BetStatus b={b} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        You: {b.creator.toLowerCase() === address?.toLowerCase() ? sideName(b.creator_side, b) : sideName(b.opponent_side, b)}
                        {" · "}Stake {formatWei(b.amount)}
                      </div>
                      {b.status === "RESOLVED" && (
                        <div className="text-xs mt-1">
                          {b.winner?.toLowerCase() === address?.toLowerCase() ? (
                            <span className="text-win font-semibold">Won the duel</span>
                          ) : b.real_winner === "REFUND" ? (
                            <span className="text-muted-foreground">Refunded (expired)</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {b.real_winner === "0" ? "Draw - refunded" : "Lost"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function BetStatus({ b }: { b: Bet }) {
  const cls: Record<string, string> = {
    OPEN: "text-yellow-400 border-yellow-500/30",
    JOINED: "text-green-400 border-green-500/30",
    RESOLVED: "text-green-400 border-green-500/30",
    CANCELED: "text-muted-foreground border-white/20",
  };
  return (
    <Badge variant="outline" className={cls[b.status] ?? ""}>
      {b.status}
    </Badge>
  );
}
