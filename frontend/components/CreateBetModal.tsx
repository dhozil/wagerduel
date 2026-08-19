"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, Calendar, Users, Coins, Link2 } from "lucide-react";
import { useCreateBet, useBalance, useOwner } from "@/lib/hooks/useP2PGambling";
import type { FeePresetLevel } from "@/lib/genlayer/fees";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";

const WEI_PER_TOKEN = BigInt(1_000_000_000_000_000_000);

function formatWeiBalance(value: number): string {
  if (!value) return "0 GEN";
  return `${(value / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 })} GEN`;
}

function formatHandicapGoals(g: number): string {
  return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

function defaultUrlFor(date: string): string {
  return date ? `https://www.bbc.com/sport/football/scores-fixtures/${date}` : "";
}

interface CreateBetModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialValues?: {
    gameDate?: string;
    team1?: string;
    team2?: string;
    resolutionUrl?: string;
  } | null;
}

export function CreateBetModal({
  open,
  onOpenChange,
  initialValues,
}: CreateBetModalProps) {
  const { isConnected, address, isLoading } = useWallet();
  const { createBet, isCreating, isSuccess } = useCreateBet();
  const { data: balance = 0 } = useBalance(address);
  const { data: owner } = useOwner();
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  const [isOpen, setIsOpen] = useState(false);
  const isControlled = open !== undefined;
  const effectiveOpen = isControlled ? !!open : isOpen;
  const [gameDate, setGameDate] = useState("");
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [side, setSide] = useState<"1" | "2" | "0" | "">("");
  const [handicapGoals, setHandicapGoals] = useState(0);
  const [amount, setAmount] = useState("1");
  const [resolutionUrl, setResolutionUrl] = useState("");
  const [feePresetLevel, setFeePresetLevel] = useState<FeePresetLevel>("standard");

  const [errors, setErrors] = useState({
    gameDate: "",
    team1: "",
    team2: "",
    side: "",
    amount: "",
    resolutionUrl: "",
  });

  // Auto-close modal when wallet disconnects
  useEffect(() => {
    if (!isConnected && effectiveOpen && !isCreating) {
      handleOpenChange(false);
    }
  }, [isConnected, effectiveOpen, isCreating]);

  const parseAmountWei = (): bigint | null => {
    const trimmed = amount.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!isFinite(num) || num <= 0) return null;
    return BigInt(Math.round(num * Number(WEI_PER_TOKEN)));
  };

  // Handicap is stored as half-goals applied to Team 2 in the contract.
  // Positive = Team 2 gets the head start, negative = Team 1. The "voor" is
  // always given to the OPPONENT (the side the creator is not betting on).
  const handicapHalves =
    side === "2"
      ? -Math.round(handicapGoals * 2)
      : Math.round(handicapGoals * 2);

  const handicapLabel =
    side === "1"
      ? team2.trim() || "Team 2"
      : side === "2"
        ? team1.trim() || "Team 1"
        : "";

  const handleSelectSide = (next: "1" | "2" | "0") => {
    setSide(next);
    if (next === "0") setHandicapGoals(0);
    setErrors({ ...errors, side: "" });
  };

  const validateForm = (): boolean => {
    const newErrors = {
      gameDate: "",
      team1: "",
      team2: "",
      side: "",
      amount: "",
      resolutionUrl: "",
    };

    if (!gameDate.trim()) {
      newErrors.gameDate = "Game date is required";
    }

    if (!team1.trim()) {
      newErrors.team1 = "Team 1 name is required";
    }

    if (!team2.trim()) {
      newErrors.team2 = "Team 2 name is required";
    }

    if (!side) {
      newErrors.side = "Please select your side";
    }

    if (parseAmountWei() === null) {
      newErrors.amount = "Enter a valid stake greater than 0";
    }

    if (
      !resolutionUrl.trim() ||
      (!resolutionUrl.startsWith("http://") &&
        !resolutionUrl.startsWith("https://")) ||
      !/^https?:\/\/([a-z0-9-]+\.)*(bbc\.com|bbc\.co\.uk|espn\.com|skysports\.com|fotmob\.com|goal\.com|theguardian\.com|uefa\.com|premierleague\.com)(\/|$)/i.test(
        resolutionUrl.trim()
      )
    ) {
      newErrors.resolutionUrl =
        "URL must use a trusted source (BBC, ESPN, Sky Sports, FotMob, Goal, Guardian, UEFA, Premier League)";
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((e) => e !== "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      error("Please connect your wallet first");
      return;
    }

    if (!validateForm()) {
      return;
    }

    const amountWei = parseAmountWei()!;
    if (balance < Number(amountWei)) {
      error("Insufficient balance", {
        description:
          "Your on-chain balance is lower than the stake. Deposit first on your Profile page.",
      });
      return;
    }

    createBet({
      gameDate,
      team1,
      team2,
      side: side as "1" | "2" | "0",
      resolutionUrl: resolutionUrl.trim(),
      amountWei,
      handicapHalves,
      feePresetLevel,
    });
  };

  const resetForm = () => {
    setGameDate("");
    setTeam1("");
    setTeam2("");
    setSide("");
    setHandicapGoals(0);
    setAmount("1");
    setResolutionUrl("");
    setErrors({ gameDate: "", team1: "", team2: "", side: "", amount: "", resolutionUrl: "" });
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !isCreating) {
      resetForm();
    }
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setIsOpen(next);
    }
  };

  // Prefill the form when the modal opens with a preselected fixture.
  useEffect(() => {
    if (effectiveOpen && initialValues) {
      const date = initialValues.gameDate ?? "";
      setGameDate(date);
      setTeam1(initialValues.team1 ?? "");
      setTeam2(initialValues.team2 ?? "");
      setSide("");
      setHandicapGoals(0);
      setResolutionUrl(
        initialValues.resolutionUrl ?? (date ? defaultUrlFor(date) : "")
      );
      setErrors({
        gameDate: "",
        team1: "",
        team2: "",
        side: "",
        amount: "",
        resolutionUrl: "",
      });
    }
  }, [effectiveOpen, initialValues]);

  useEffect(() => {
    if (isSuccess) {
      resetForm();
      handleOpenChange(false);
    }
    // handleOpenChange changes identity each render; reflect only on success.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  return (
    <Dialog open={effectiveOpen} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button
            variant="gradient"
            disabled={!isConnected || !address || isLoading || isOwner}
            title={isOwner ? "The contract owner cannot place bets" : undefined}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Bet
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="brand-card border-2 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create Head-to-Head Bet</DialogTitle>
          <DialogDescription>
            Lock your stake and challenge another player to match it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Balance */}
          <div className="flex items-center justify-between rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
            <span className="text-sm text-muted-foreground">Your on-chain balance</span>
            <span className="font-display font-bold text-gold">
              {formatWeiBalance(balance)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Bets are funded from your on-chain balance. Use the wallet panel to
            deposit before creating a bet.
          </p>
          {/* Game Date */}
          <div className="space-y-2">
            <Label htmlFor="gameDate" className="flex items-center gap-2">
              <Calendar className="w-4 h-4 !text-white" />
              Game Date
            </Label>
            <Input
              id="gameDate"
              type="date"
              value={gameDate}
              onChange={(e) => {
                setGameDate(e.target.value);
                setResolutionUrl((prev) => prev || defaultUrlFor(e.target.value));
                setErrors({ ...errors, gameDate: "" });
              }}
              className={errors.gameDate ? "border-destructive" : ""}
            />
            {errors.gameDate && (
              <p className="text-xs text-destructive">{errors.gameDate}</p>
            )}
          </div>

          {/* Teams */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Teams
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Input
                  id="team1"
                  type="text"
                  placeholder="Team 1"
                  value={team1}
                  onChange={(e) => {
                    setTeam1(e.target.value);
                    setErrors({ ...errors, team1: "" });
                  }}
                  className={errors.team1 ? "border-destructive" : ""}
                />
                {errors.team1 && (
                  <p className="text-xs text-destructive">{errors.team1}</p>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  id="team2"
                  type="text"
                  placeholder="Team 2"
                  value={team2}
                  onChange={(e) => {
                    setTeam2(e.target.value);
                    setErrors({ ...errors, team2: "" });
                  }}
                  className={errors.team2 ? "border-destructive" : ""}
                />
                {errors.team2 && (
                  <p className="text-xs text-destructive">{errors.team2}</p>
                )}
              </div>
            </div>
          </div>

          {/* Resolution Source */}
          <div className="space-y-2">
            <Label htmlFor="resolutionUrl" className="flex items-center gap-2">
              <Link2 className="w-4 h-4 !text-white" />
              Resolution Source URL
            </Label>
            <Input
              id="resolutionUrl"
              type="url"
              placeholder="https://www.bbc.com/sport/football/scores-fixtures/2024-06-20"
              value={resolutionUrl}
              onChange={(e) => {
                setResolutionUrl(e.target.value);
                setErrors({ ...errors, resolutionUrl: "" });
              }}
              className={errors.resolutionUrl ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              The trusted source WagerDuel&apos;s AI will fetch to determine the
              result. Only authoritative football sources are allowed (BBC,
              ESPN, Sky Sports, FotMob, Goal, The Guardian, UEFA, Premier
              League) — the URL is stored on-chain and shown to your opponent
              before they join.
            </p>
            {errors.resolutionUrl && (
              <p className="text-xs text-destructive">{errors.resolutionUrl}</p>
            )}
          </div>

          {/* Your Side */}
          <div className="space-y-3">
            <Label>Your Side</Label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleSelectSide("1")}
                disabled={!team1.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  side === "1"
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/10 hover:border-white/20"
                } ${!team1.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">{team1 || "Team 1"}</div>
                <div className="text-xs text-muted-foreground mt-1">Wins</div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSide("0")}
                disabled={!team1.trim() || !team2.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  side === "0"
                    ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                    : "border-white/10 hover:border-white/20"
                } ${!team1.trim() || !team2.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">Draw</div>
                <div className="text-xs text-muted-foreground mt-1">Tie</div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectSide("2")}
                disabled={!team2.trim()}
                className={`p-4 rounded-lg border-2 transition-all ${
                  side === "2"
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/10 hover:border-white/20"
                } ${!team2.trim() ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="font-semibold text-sm">{team2 || "Team 2"}</div>
                <div className="text-xs text-muted-foreground mt-1">Wins</div>
              </button>
            </div>
            {errors.side && (
              <p className="text-xs text-destructive">{errors.side}</p>
            )}
          </div>

          {/* Handicap */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Handicap (voor)</Label>
              {handicapGoals > 0 && side && side !== "0" && (
                <Badge variant="secondary" className="text-[11px]">
                  {handicapLabel} +{formatHandicapGoals(handicapGoals)}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[0, 0.5, 1, 1.5, 2].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setHandicapGoals(g)}
                  disabled={!side || side === "0"}
                  className={`rounded-md border px-2 py-2 text-center transition-all cursor-pointer ${
                    handicapGoals === g
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-white/10 hover:border-white/20"
                  } ${
                    !side || side === "0"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {g === 0 ? "0" : `+${formatHandicapGoals(g)}`}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {g === 0 ? "No voor" : "voor"}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Give your opponent a head start to level the field.{" "}
              {side === "0"
                ? "Not available for Draw bets."
                : side
                  ? `If you pick ${side === "1" ? team1.trim() || "Team 1" : team2.trim() || "Team 2"}, ${handicapLabel} starts +${formatHandicapGoals(handicapGoals)} ahead. A level adjusted score refunds both.`
                  : "Pick your side first to set a handicap."}
            </p>
          </div>

          {/* Stake */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="flex items-center gap-2">
              <Coins className="w-4 h-4 !text-white" />
              Stake (GEN)
            </Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.001"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErrors({ ...errors, amount: "" });
              }}
              className={errors.amount ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Both players lock the same stake. The winner takes the entire pot.
            </p>
            {errors.amount && (
              <p className="text-xs text-destructive">{errors.amount}</p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Fee Preset</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "low", label: "Low", detail: "No appeals" },
                { value: "standard", label: "Standard", detail: "1 appeal" },
                { value: "high", label: "High", detail: "2 appeals" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFeePresetLevel(option.value)}
                  className={`rounded-md border px-3 py-2 text-left transition-all cursor-pointer ${
                    feePresetLevel === option.value
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="text-sm font-semibold">{option.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{option.detail}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gradient"
              className="flex-1"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Bet"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
