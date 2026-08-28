import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plane, Timer, Wrench, Flame, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";
import { z } from "zod";

const authSchema = z.object({
  showAuth: z.boolean().optional(),
  mode: z.enum(["login", "signup"]).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => authSchema.parse(search),
  head: () => ({
    meta: [
      { title: "StickTime FPV — FPV flight hour & fleet tracking" },
      {
        name: "description",
        content:
          "Log simulator and real-world FPV airtime in 5-minute blocks, track quad maintenance health, and build your flying streak.",
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
  const { showAuth, mode } = Route.useSearch();
  const navigate = useNavigate();

  const closeAuth = () => {
    navigate({ to: "/", search: { showAuth: undefined, mode: undefined } });
  };

  return (
    <div className="min-h-screen relative">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-bold">StickTime FPV</span>
        </div>
        <Link to="/" search={{ showAuth: true, mode: "login" }}>
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
          <Link to="/" search={{ showAuth: true, mode: "signup" }}>
            <Button size="lg">Start your logbook</Button>
          </Link>
          <Link to="/" search={{ showAuth: true, mode: "login" }}>
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

      {showAuth && (
        <AuthModal 
          isOpen={true} 
          onClose={closeAuth} 
          initialMode={mode || "login"} 
        />
      )}
    </div>
  );
}
