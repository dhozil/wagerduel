"use client";

import { useEffect, useState } from "react";
import {
  Swords,
  ShieldCheck,
  Lock,
  Sparkles,
  Coins,
  Users,
  Trophy,
  ArrowRight,
  Scale,
  Gem,
  Zap,
  CircleDollarSign,
} from "lucide-react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { MarketStats } from "@/components/MarketStats";
import { TeamCrest } from "@/components/TeamCrest";
import { useBets, useTotalEscrow } from "@/lib/hooks/useP2PGambling";
import {
  useMatchGates,
  findFixtureForBet,
} from "@/lib/hooks/useFixtureStatus";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WagerDuelMark } from "@/components/Logo";
import { formatWei } from "@/lib/utils";

/* ============================ HERO ============================ */

function Hero() {
  return (
    <section className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center mb-16">
      {/* Left — copy */}
      <div className="lg:col-span-7 animate-slide-up">
        <Badge
          variant="outline"
          className="mb-5 gap-2 border-gold/40 text-gold bg-gold/5 uppercase tracking-widest text-xs font-semibold"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered &middot; No Oracles &middot; On GenLayer
        </Badge>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold uppercase leading-[0.95] tracking-tight">
          <span className="text-foreground">Double or</span>
          <br />
          <span className="gold-text">Nothing.</span>
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
          WagerDuel is a peer-to-peer betting arena. Challenge another player on
          a real football match, lock your stake in escrow, and let GenLayer's
          AI fetch and verify the actual result. The winner takes the entire pot.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button
            asChild
            size="lg"
            variant="gradient"
            className="h-12 px-8 text-base font-bold uppercase tracking-wider"
          >
            <Link href="/play">
              Start Betting
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-12 px-8 text-base font-semibold uppercase tracking-wider border-gold/40 text-gold hover:bg-gold/10"
          >
            <a href="#how-it-works">How It Works</a>
          </Button>
        </div>

        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gold" />
            Escrow secured by contract
          </span>
          <span className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-gold" />
            Fair draws refund both
          </span>
          <span className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold" />
            Payouts are automatic
          </span>
        </div>
      </div>

      {/* Right — real live duel from the contract */}
      <div className="lg:col-span-5 animate-slide-up" style={{ animationDelay: "150ms" }}>
        <div className="relative">
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-gold/20 via-transparent to-felt/30 blur-2xl" />

          <div className="relative felt-panel rounded-3xl p-6 sm:p-8 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <WagerDuelMark size="sm" />
                <span className="font-display uppercase tracking-widest text-sm text-foreground">
                  Live Duel
                </span>
              </div>
              <LiveDuelBadge />
            </div>

            <LiveDuelBody />

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground border-t border-gold/15 pt-4">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gold" />
                Escrow locked on-chain
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                AI-verified result
              </span>
            </div>
          </div>

          {/* Floating badge */}
          <div className="absolute -bottom-4 -left-3 sm:-left-6 glass-card rounded-xl px-4 py-3 animate-float">
            <div className="flex items-center gap-2.5">
              <Coins className="w-5 h-5 text-gold" />
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Winner gets
                </div>
                <div className="font-display font-bold text-gold">2x pot − 2% fee</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveDuelBadge() {
  const { data: bets } = useBets();
  const live = (bets || []).find(
    (b) => b.status === "OPEN" || b.status === "JOINED"
  );
  if (!live) {
    return (
      <Badge variant="outline" className="border-white/20 text-muted-foreground uppercase tracking-wider">
        Awaiting duels
      </Badge>
    );
  }
  return (
    <Badge className="bg-win/20 text-win border-win/40 uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-win animate-pulse mr-1.5" />
      {live.status === "JOINED" ? "Active" : "Open"}
    </Badge>
  );
}

function LiveDuelBody() {
  const { data: bets } = useBets();
  const { byDate } = useMatchGates(bets);

  // Rotate through every open/active duel instead of always showing the newest.
  const active = (bets || []).filter(
    (b) => b.status === "OPEN" || b.status === "JOINED"
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (active.length <= 1) {
      setIdx(0);
      return;
    }
    setIdx((i) => Math.min(i, active.length - 1));
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % active.length);
    }, 4500);
    return () => clearInterval(t);
  }, [active.length]);

  const live = active[idx] ?? active[0];

  if (!live) {
    return (
      <div className="brand-card rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <div className="font-display font-semibold text-lg">
          No active duels yet
        </div>
        <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
          Be the first to create a real head-to-head bet — real users, real
          stakes, AI-verified results.
        </p>
      </div>
    );
  }

  const statusLabel = live.status === "JOINED" ? "Joined" : "Open";
  const fx = findFixtureForBet(byDate.get(live.game_date), live);

  // The creator/opponent chose a SIDE — put their label and stake on the card
  // of the team they actually picked, not always the left card.
  const creatorSide = live.creator_side;
  const opponentSide = live.opponent_side;
  const creatorOnTeam1 = creatorSide === "1";
  const creatorOnTeam2 = creatorSide === "2";
  const creatorOnDraw = creatorSide === "0";
  const opponentOnTeam1 = opponentSide === "1";
  const opponentOnTeam2 = opponentSide === "2";

  const teamBox = ({
    team,
    crest,
    playerLabel,
    playerAddr,
    isCreator,
    stakeText,
  }: {
    team: string;
    crest?: string;
    playerLabel: string;
    playerAddr?: string;
    isCreator: boolean;
    stakeText: string;
  }) => (
    <div className="brand-card rounded-2xl p-4 text-center">
      <div className="flex justify-center mb-2">
        <TeamCrest name={team} logo={crest} size={44} />
      </div>
      <div className="font-display font-semibold text-lg truncate">{team}</div>
      <div
        className={`mt-1 text-xs truncate ${
          isCreator ? "text-gold" : "text-muted-foreground"
        }`}
        title={playerAddr}
      >
        {playerLabel}
      </div>
      <div className="mt-3 text-sm font-bold text-gold">{stakeText}</div>
    </div>
  );

  const creatorChip = (
    <div className="mt-2 mx-auto max-w-[22ch] text-[10px] uppercase tracking-widest text-gold">
      {shortAddr(live.creator)} picked Draw
    </div>
  );

  const box1 = teamBox({
    team: live.team1,
    crest: fx?.logo1,
    playerLabel: creatorOnTeam1
      ? `by ${shortAddr(live.creator)} · Creator`
      : opponentOnTeam1
        ? `by ${shortAddr(live.opponent)} · Rival`
        : "waiting for rival",
    playerAddr: creatorOnTeam1 ? live.creator : opponentOnTeam1 ? live.opponent : undefined,
    isCreator: creatorOnTeam1,
    stakeText:
      creatorOnTeam1 || opponentOnTeam1 ? `Stake ${formatWei(live.amount)}` : "Open slot",
  });

  const box2 = teamBox({
    team: live.team2,
    crest: fx?.logo2,
    playerLabel: creatorOnTeam2
      ? `by ${shortAddr(live.creator)} · Creator`
      : opponentOnTeam2
        ? `by ${shortAddr(live.opponent)} · Rival`
        : "waiting for rival",
    playerAddr: creatorOnTeam2 ? live.creator : opponentOnTeam2 ? live.opponent : undefined,
    isCreator: creatorOnTeam2,
    stakeText:
      creatorOnTeam2 || opponentOnTeam2 ? `Stake ${formatWei(live.amount)}` : "Open slot",
  });

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {box1}

        <div className="text-center">
          <div className="chip chip-gold w-14 h-14 mx-auto text-lg font-bold animate-float">
            2x
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            {statusLabel} pot
          </div>
          {creatorOnDraw && creatorChip}
        </div>

        {box2}
      </div>

      {active.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {active.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Show active duel ${i + 1}`}
              title={`Duel ${i + 1} of ${active.length}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                i === idx
                  ? "w-5 bg-gold"
                  : "w-1.5 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}

function shortAddr(addr: string): string {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/* ========================= STATS STRIP ========================= */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="brand-card brand-card-hover p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl gradient-gold flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[var(--primary-foreground)]" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className={`font-display font-bold text-2xl truncate ${accent ?? ""}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function StatsStrip() {
  const { data: bets } = useBets();
  const { data: escrow } = useTotalEscrow();

  const open = (bets || []).filter((b) => b.status === "OPEN").length;
  const active = (bets || []).filter((b) => b.status === "JOINED").length;
  const resolved = (bets || []).filter((b) => b.status === "RESOLVED").length;

  const stats = [
    {
      icon: CircleDollarSign,
      label: "Total Escrow",
      value: formatWei(escrow || 0),
      accent: "text-gold",
    },
    { icon: Gem, label: "Open Bets", value: String(open), accent: "text-foreground" },
    {
      icon: Users,
      label: "Active Duels",
      value: String(active),
      accent: "text-win",
    },
    {
      icon: Trophy,
      label: "Resolved",
      value: String(resolved),
      accent: "text-foreground",
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16 animate-slide-up">
      {stats.map((s, i) => (
        <StatCard key={s.label} {...s} />
      ))}
    </section>
  );
}

/* ========================== PLAY ========================== */

function PlaySection() {
  return (
    <section id="play" className="mb-20 scroll-mt-28">
      <SectionHeader
        eyebrow="The Arena"
        title="Place your wager"
        subtitle="Create a bet or accept an open challenge. Both sides lock the same stake — only one walks away with it."
      />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        <div className="lg:col-span-8">
          <div className="brand-card brand-card-hover p-10 text-center h-full flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-2xl gradient-gold flex items-center justify-center mb-5">
              <Swords className="w-8 h-8 text-[var(--primary-foreground)]" />
            </div>
            <h3 className="font-display font-semibold text-2xl uppercase mb-3">
              The Arena is open
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              Browse every duel, filter to the ones you&apos;re in, or jump
              straight into a friend&apos;s bet by entering its ID — all on one
              dedicated page.
            </p>
            <Button
              asChild
              size="lg"
              variant="gradient"
              className="mt-6 h-12 px-8 text-base font-bold uppercase tracking-wider"
            >
              <Link href="/play">
                Open the Arena
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="lg:col-span-4">
          <MarketStats />
        </div>
      </div>
    </section>
  );
}

/* ====================== HOW IT WORKS ====================== */

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-10">
      <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold mb-3">
        {eyebrow}
      </div>
      <h2 className="text-3xl md:text-4xl font-bold uppercase">{title}</h2>
      {subtitle && (
        <p className="mt-4 text-muted-foreground leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Coins,
      step: "01",
      title: "Create a Bet",
      body: "Pick a match, choose your side — Team 1, Team 2, or Draw — and lock your stake. The contract holds it in escrow.",
    },
    {
      icon: Swords,
      step: "02",
      title: "Find Your Rival",
      body: "Another player accepts the challenge by matching your stake on the opposite outcome. The duel is sealed.",
    },
    {
      icon: ShieldCheck,
      step: "03",
      title: "AI Verifies the Result",
      body: "After the match, WagerDuel fetches the real score from trusted sources. Validators independently confirm it on-chain.",
    },
    {
      icon: Trophy,
      step: "04",
      title: "Winner Takes All",
      body: "The entire pot is paid to the winner automatically. A draw with no draw-side player refunds both stakes.",
    },
  ];

  return (
    <section id="how-it-works" className="mb-20 scroll-mt-28">
      <SectionHeader
        eyebrow="How It Works"
        title="From wager to winner"
        subtitle="A transparent, four-step duel — enforced entirely by smart contract logic and AI consensus."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {steps.map((s) => (
          <div
            key={s.step}
            className="brand-card brand-card-hover p-6 flex flex-col relative overflow-hidden group"
          >
            <div className="absolute -top-3 -right-2 font-display font-bold text-7xl text-gold/10 group-hover:text-gold/20 transition-colors select-none">
              {s.step}
            </div>
            <div className="w-12 h-12 rounded-xl gradient-gold flex items-center justify-center mb-5">
              <s.icon className="w-6 h-6 text-[var(--primary-foreground)]" />
            </div>
            <h3 className="font-display font-semibold text-xl uppercase mb-2">
              {s.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ========================== RULES ========================== */

function Rules() {
  const rules = [
    {
      icon: Lock,
      title: "Matching stakes",
      body: "An opponent must lock the exact same stake as the creator, on the opposite outcome. No asymmetric risk.",
    },
    {
      icon: Scale,
      title: "Fair draws",
      body: "If the match ends in a draw and neither player backed the draw side, both stakes are refunded. Nobody loses.",
    },
    {
      icon: Zap,
      title: "Open to resolve",
      body: "Anyone can trigger resolution after the match — the payout is deterministic once the AI-verified result is accepted.",
    },
    {
      icon: ShieldCheck,
      title: "Cancellation rights",
      body: "A creator can cancel an open bet before an opponent joins and withdraw their stake, no questions asked.",
    },
  ];

  return (
    <section id="rules" className="mb-20 scroll-mt-28">
      <SectionHeader
        eyebrow="House Rules"
        title="Fair play, by code"
        subtitle="A transparent 2% platform fee on settled pots funds the arena. Everything else is enforced deterministically on-chain - only the two of you."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {rules.map((r) => (
          <div
            key={r.title}
            className="brand-card brand-card-hover p-6 flex items-start gap-5"
          >
            <div className="w-11 h-11 rounded-xl border border-gold/40 bg-gold/10 flex items-center justify-center shrink-0">
              <r.icon className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg uppercase mb-1.5">
                {r.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {r.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ===================== WHY / CTA ===================== */

function WhySection() {
  const features = [
    {
      icon: Swords,
      title: "Truly peer-to-peer",
      body: "No bookmaker, no oddsmaker. It's always one player against another on equal terms - a flat 2% fee funds the platform, nothing more.",
    },
    {
      icon: Sparkles,
      title: "No oracles needed",
      body: "GenLayer contracts read the web directly and use AI validators to reach consensus on the real result.",
    },
    {
      icon: Lock,
      title: "On-chain escrow",
      body: "Stakes live in the contract and can only move to a verified winner or back to the players.",
    },
    {
      icon: Zap,
      title: "Automatic payouts",
      body: "The moment a result is verified, the pot is transferred. No withdrawal requests, no waiting on a human.",
    },
  ];

  return (
    <section className="mb-20">
      <SectionHeader
        eyebrow="Why WagerDuel"
        title="Betting the way it should be"
        subtitle="Built on GenLayer's intelligent contracts — the first blockchain where contracts can reason about the real world."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map((f) => (
          <div key={f.title} className="brand-card brand-card-hover p-6 text-center">
            <div className="w-12 h-12 rounded-full border border-gold/40 bg-gold/10 flex items-center justify-center mx-auto mb-4">
              <f.icon className="w-5 h-5 text-gold" />
            </div>
            <h3 className="font-display font-semibold text-lg uppercase mb-2">
              {f.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CtaBanner() {
  return (
    <section className="felt-panel rounded-3xl p-10 md:p-14 text-center relative overflow-hidden mb-20">
      <div className="absolute -top-10 -left-10 w-56 h-56 rounded-full bg-gold/10 blur-3xl" />
      <div className="absolute -bottom-10 -right-10 w-56 h-56 rounded-full bg-gold/10 blur-3xl" />

      <div className="relative">
        <div className="chip chip-gold w-16 h-16 mx-auto text-2xl font-bold mb-6 animate-float">
          2x
        </div>
        <h2 className="text-4xl md:text-5xl font-bold uppercase mb-4">
          Ready to <span className="gold-text">wager?</span>
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          Connect your wallet, find a rival, and settle it on the pitch — with
          the result verified by AI and the winner paid instantly.
        </p>
        <Button
          asChild
          size="lg"
          variant="gradient"
          className="h-13 px-10 text-base font-bold uppercase tracking-wider"
        >
          <Link href="/play">
            Enter the Arena
            <ArrowRight className="w-5 h-5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/* ========================= FOOTER ========================= */

function Footer() {
  return (
    <footer className="border-t border-gold/15 pt-10 pb-6">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <WagerDuelMark size="sm" />
              <span className="font-display font-semibold uppercase tracking-wider">
                Wager<span className="gold-text">Duel</span>
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Peer-to-peer football betting on GenLayer. Real stakes, real
              matches, AI-verified results — no bookmakers, no middlemen. A flat
              2% fee on settled pots supports the arena.
            </p>
          </div>

          <div className="md:justify-self-center">
            <h4 className="font-display font-semibold uppercase tracking-wider text-sm mb-3 text-gold">
              Explore
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/play" className="hover:text-gold transition-colors">Play</Link></li>
              <li><Link href="/fixtures" className="hover:text-gold transition-colors">Fixtures</Link></li>
              <li><a href="#how-it-works" className="hover:text-gold transition-colors">How It Works</a></li>
              <li><a href="#rules" className="hover:text-gold transition-colors">Rules</a></li>
            </ul>
          </div>

          <div className="md:justify-self-end">
            <h4 className="font-display font-semibold uppercase tracking-wider text-sm mb-3 text-gold">
              Built On
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="https://genlayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold transition-colors"
                >
                  GenLayer
                </a>
              </li>
              <li>
                <a
                  href="https://docs.genlayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold transition-colors"
                >
                  Docs
                </a>
              </li>
              <li>
                <a
                  href="https://studio.genlayer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gold transition-colors"
                >
                  Studio
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gold/10 pt-5 text-center space-y-2">
          <p className="text-xs text-muted-foreground">
            Contract:{" "}
            <code className="bg-gold/10 text-gold px-1.5 py-0.5 rounded text-[11px]">
              0xa397d1bd44C67308D4747851D346f03b4069912C
            </code>{" "}
            ·{" "}
            <a
              href="https://studio.genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gold transition-colors"
            >
              GenLayer Studio
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            WagerDuel is a demonstration on the GenLayer network. Play responsibly —
            only wager what you can afford to lose. This platform is for
            educational purposes and not affiliated with any gambling operator.
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} WagerDuel · Powered by GenLayer
          </p>
        </div>
      </div>
    </footer>
  );
}

/* =========================== PAGE =========================== */

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-grow pt-32 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-screen-2xl mx-auto">
          <Hero />
          <StatsStrip />
          <PlaySection />
          <HowItWorks />
          <Rules />
          <WhySection />
          <CtaBanner />
        </div>
      </main>

      <Footer />
    </div>
  );
}
