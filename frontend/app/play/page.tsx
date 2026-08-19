"use client";

import { Hourglass, Swords, Trophy, Users } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { BetsGrid } from "@/components/BetsGrid";
import { JoinBetByID } from "@/components/JoinBetByID";
import { MarketStats } from "@/components/MarketStats";
import { useBets } from "@/lib/hooks/useP2PGambling";

const chipColors: Record<string, string> = {
  Open: "text-yellow-400",
  Active: "text-green-400",
  Resolved: "text-muted-foreground",
};

export default function PlayPage() {
  const { data: bets } = useBets();
  const open = (bets || []).filter((b) => b.status === "OPEN").length;
  const active = (bets || []).filter((b) => b.status === "JOINED").length;
  const resolved = (bets || []).filter((b) => b.status === "RESOLVED").length;

  const chips = [
    { icon: Hourglass, label: "Open", value: open },
    { icon: Users, label: "Active", value: active },
    { icon: Trophy, label: "Resolved", value: resolved },
  ];

  return (
    <div id="top" className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-32 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-slide-up">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl gradient-gold flex items-center justify-center">
                <Swords className="w-6 h-6 text-[var(--primary-foreground)]" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold uppercase">
                  The Arena
                </h1>
                <p className="text-sm text-muted-foreground">
                  Browse open duels, join one, or jump straight into a
                  friend&apos;s bet by entering its ID below.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              {chips.map((c) => (
                <div
                  key={c.label}
                  className="brand-card px-4 py-2 flex items-center gap-2 text-sm"
                >
                  <c.icon className={`w-4 h-4 ${chipColors[c.label]}`} />
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="font-bold">{c.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bets grid — the main browsing experience */}
          <BetsGrid />

          {/* Join by ID + market stats */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-8">
            <div className="lg:col-span-8">
              <JoinBetByID />
            </div>
            <div className="lg:col-span-4">
              <MarketStats />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}