"use client";

import { useState, useEffect } from "react";
import { Activity, Trophy } from "lucide-react";
import { AccountPanel } from "./AccountPanel";
import { CreateBetModal } from "./CreateBetModal";
import { useBets } from "@/lib/hooks/useP2PGambling";
import { GENLAYER_NETWORK } from "@/lib/genlayer/client";
import { Logo, LogoMark } from "./Logo";

const NAV_LINKS = [
  { href: "#play", label: "Play" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "/profile", label: "Profile" },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { data: bets } = useBets();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const totalBets = bets?.length || 0;
  const resolvedBets =
    bets?.filter((bet) => bet.status === "RESOLVED").length || 0;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-3 md:px-6 pt-3">
      <nav
        className={`brand-navbar border transition-all duration-300 rounded-2xl w-full px-4 md:px-6 ${
          isScrolled
            ? "border-gold/25 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)]"
            : "border-gold/10"
        }`}
      >
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand */}
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            <LogoMark size="md" className="md:hidden" />
            <Logo size="md" className="hidden md:flex" />
          </a>

          {/* Center: Nav links */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-gold transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Network badge (display only) */}
            <span
              className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold cursor-default select-none"
              title="Connected to GenLayer Studio"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-win animate-pulse" />
              {GENLAYER_NETWORK.chainName}
            </span>

          {/* Right: Live stats + actions */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-gold" />
                <span className="text-muted-foreground">Total:</span>
                <span className="font-bold text-foreground">{totalBets}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-win" />
                <span className="text-muted-foreground">Resolved:</span>
                <span className="font-bold text-foreground">{resolvedBets}</span>
              </div>
            </div>
            <div className="h-8 w-px bg-gold/15 hidden md:block" />
            <CreateBetModal />
            <AccountPanel />
          </div>
        </div>
      </nav>
    </header>
  );
}
