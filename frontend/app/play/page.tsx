"use client";

import { Swords } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { BetsGrid } from "@/components/BetsGrid";
import { JoinBetByID } from "@/components/JoinBetByID";
import { MarketStats } from "@/components/MarketStats";

export default function PlayPage() {
  return (
    <div id="top" className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-32 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">
          {/* Header */}
          <div className="mb-6 animate-slide-up">
            <div className="flex items-center gap-3">
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
          </div>

          {/* Join by ID + market stats — at top for quick access */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            <div className="lg:col-span-4">
              <MarketStats />
            </div>
            <div className="lg:col-span-8">
              <JoinBetByID />
            </div>
          </div>

          {/* Bets grid — the main browsing experience */}
          <BetsGrid />
        </div>
      </main>
    </div>
  );
}