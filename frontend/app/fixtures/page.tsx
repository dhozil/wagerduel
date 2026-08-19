"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Plus,
  Radio,
  Swords,
  Trophy,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CreateBetModal } from "@/components/CreateBetModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LEAGUES,
  loadFixtures,
  todayLocal,
  toLocalDateKey,
  type Fixture,
} from "@/lib/fixtures";
import { useWallet } from "@/lib/genlayer/wallet";

export default function FixturesPage() {
  const { isConnected } = useWallet();
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [activeLeague, setActiveLeague] = useState<string>("all");
  const [selectedFixture, setSelectedFixture] = useState<Fixture | null>(null);

  const { data: fixtures = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["fixtures", selectedDate, activeLeague],
    queryFn: () =>
      loadFixtures(
        selectedDate,
        activeLeague === "all" ? undefined : activeLeague
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const anyLive = useMemo(
    () => fixtures.some((f) => f.state === "in"),
    [fixtures]
  );

  const shiftDay = (delta: number) => {
    const d = new Date(`${selectedDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    setSelectedDate(toLocalDateKey(d));
  };

  const isToday = selectedDate === todayLocal();

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
                  Fixtures
                </h1>
                <p className="text-sm text-muted-foreground">
                  {anyLive
                    ? "Some matches are live right now — watch them update in real time."
                    : "Real-time schedules from the world's top leagues. Pick a match and create a bet on it."}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3 mt-5">
              {/* Date navigator */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDay(-1)}
                  className="h-9 w-9 p-0"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="relative">
                  <CalendarDays className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                    className="brand-navbar border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm font-mono bg-transparent text-foreground outline-none focus:border-gold/40"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shiftDay(1)}
                  className="h-9 w-9 p-0"
                  aria-label="Next day"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {!isToday && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(todayLocal())}
                    className="text-gold hover:text-gold/80"
                  >
                    Today
                  </Button>
                )}
              </div>

              {/* League filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveLeague("all")}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
                    activeLeague === "all"
                      ? "bg-gold text-[var(--primary-foreground)]"
                      : "text-muted-foreground hover:text-gold border border-white/10"
                  }`}
                >
                  All
                </button>
                {LEAGUES.map((l) => (
                  <button
                    key={l.slug}
                    onClick={() => setActiveLeague(l.slug)}
                    className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors cursor-pointer ${
                      activeLeague === l.slug
                        ? "bg-gold text-[var(--primary-foreground)]"
                        : "text-muted-foreground hover:text-gold border border-white/10"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          {isLoading && fixtures.length === 0 ? (
            <div className="brand-card p-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Loading fixtures...</p>
            </div>
          ) : isError && fixtures.length === 0 ? (
            <div className="brand-card p-12 text-center space-y-4">
              <Radio className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
              <div>
                <h3 className="text-lg font-bold">Couldn&apos;t load fixtures</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The live scoreboard is temporarily unreachable. Try again in a
                  moment.
                </p>
              </div>
              <Button variant="gradient" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : fixtures.length === 0 ? (
            <div className="brand-card p-12 text-center space-y-3">
              <Trophy className="w-12 h-12 mx-auto text-muted-foreground opacity-30" />
              <h3 className="text-lg font-bold">No fixtures on this date</h3>
              <p className="text-sm text-muted-foreground">
                There are no scheduled matches for {selectedDate}. Browse
                another day or create a custom bet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {fixtures.map((fx) => (
                <FixtureCard
                  key={`${fx.league}-${fx.id}-${fx.kickoff}`}
                  fixture={fx}
                  canCreate={isConnected}
                  onCreate={() => setSelectedFixture(fx)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Controlled create-bet modal prefilled with the selected fixture */}
      <CreateBetModal
        open={selectedFixture !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedFixture(null);
        }}
        initialValues={
          selectedFixture
            ? {
                gameDate: selectedFixture.gameDate,
                team1: selectedFixture.team1,
                team2: selectedFixture.team2,
                resolutionUrl: selectedFixture.resolutionUrl,
              }
            : null
        }
      />
    </div>
  );
}

function FixtureCard({
  fixture,
  canCreate,
  onCreate,
}: {
  fixture: Fixture;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const kickoff = new Date(fixture.kickoff);
  const kickoffLabel = isNaN(kickoff.getTime())
    ? "—"
    : kickoff.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

  const live = fixture.state === "in";
  const finished = fixture.state === "post";
  const showScore = fixture.score1 !== undefined && fixture.score2 !== undefined;

  const betEnabled = canCreate && !live && !finished;
  const betLabel = live ? "Match Started" : finished ? "Match Finished" : "Create Bet";
  const betEnabledTitle = !canCreate
    ? "Connect your wallet to create bets"
    : live
      ? "This match has already started"
      : finished
        ? "This match has already finished"
        : undefined;

  return (
    <div className="brand-card brand-card-hover p-5 flex flex-col animate-fade-in">
      {/* Top row */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {fixture.leagueLabel}
        </span>
        {live ? (
          <Badge className="bg-win/20 text-win border-win/40 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-win animate-pulse mr-1.5" />
            {fixture.statusDetail || "Live"}
          </Badge>
        ) : finished ? (
          <Badge variant="outline" className="text-muted-foreground border-white/20 uppercase tracking-wider">
            Final
          </Badge>
        ) : (
          <Badge variant="outline" className="text-yellow-400 border-yellow-500/30 uppercase tracking-wider">
            <Clock className="w-3 h-3 mr-1" />
            Scheduled
          </Badge>
        )}
      </div>

      {/* Teams + score */}
      <TeamLogo name={fixture.team1} logo={fixture.logo1} />
      <div className="my-3 border-t border-white/5" />
      <TeamLogo name={fixture.team2} logo={fixture.logo2} />

      {/* Meta */}
      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
        {showScore && (
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <span className="text-win">{fixture.score1}</span>
            <span>-</span>
            <span className="text-win">{fixture.score2}</span>
            <span className="text-muted-foreground font-normal">FT</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-gold" />
          {fixture.gameDate} · {kickoffLabel}
        </div>
        {fixture.venue && (
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-gold" />
            <span className="truncate" title={fixture.venue}>
              {fixture.venue}
            </span>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <Button
          onClick={onCreate}
          variant="gradient"
          className="w-full"
          disabled={!betEnabled}
          title={betEnabledTitle}
        >
          {betEnabled && <Plus className="w-4 h-4 mr-2" />}
          {betEnabled ? "Create Bet" : betLabel}
        </Button>
      </div>
    </div>
  );
}

function TeamLogo({ name, logo }: { name: string; logo?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {logo ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          className="w-8 h-8 shrink-0 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-8 h-8 shrink-0 rounded-lg bg-gold/10 flex items-center justify-center">
          <Trophy className="w-4 h-4 text-gold" />
        </div>
      )}
      <div className="min-w-0">
        <div className="font-display font-semibold truncate">{name}</div>
      </div>
    </div>
  );
}