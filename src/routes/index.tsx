import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Timer, Wrench, Flame, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StickTime FPV — FPV flight hour & fleet tracking" },
      {
        name: "description",
        content:
          "Log simulator and real-world FPV airtime in 5-minute blocks, track quad maintenance health, and build your flying streak.",
      },
      { property: "og:title", content: "StickTime FPV — FPV flight hour & fleet tracking" },
      {
        property: "og:description",
        content:
          "Log simulator and real-world FPV airtime, track quad maintenance health, and build your flying streak.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Timer, title: "Dual timecards", body: "Separate sim and real-world logging in 5-minute precision blocks." },
  { icon: Wrench, title: "Gear garage", body: "Quads, goggles, radios and every component with wear-based service alerts." },
  { icon: Flame, title: "Streaks & heatmap", body: "A GitHub-style consistency grid and streak counter that keeps you flying." },
  { icon: Trophy, title: "Personal records", body: "Best laps and scores per track or simulator map." },
  { icon: Users, title: "Squad portal", body: "Team spaces with rotating entry codes that expire on your schedule." },
  { icon: Plane, title: "Export anything", body: "CSV and SQL dumps of your whole logbook, any time." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-bold">StickTime FPV</span>
        </div>
        <Link to="/auth">
          <Button variant="outline" size="sm">
            Sign in
          </Button>
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 lg:pt-24">
        <p className="label-mono">Flight hour tracking for FPV pilots</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight text-glow lg:text-7xl">
          Every pack. Every sim run. <span className="text-primary">Counted.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          StickTime is the logbook, gear garage and analytics dashboard for pilots who take stick
          time seriously — from your first hover to your hundredth race.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth">
            <Button size="lg">Start your logbook</Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="outline">
              I already fly here
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="hud-panel p-5">
            <Icon className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
        StickTime FPV — built for the quad-obsessed.
      </footer>
    </div>
  );
}
