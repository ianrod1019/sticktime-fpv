import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// Code-split: three.js never blocks first paint or LCP. The headline is
// server-rendered; the scene mounts client-side after hydration.
const DroneHeroScene = lazy(() =>
  import("@/components/three/drone-hero-scene").then((m) => ({
    default: m.DroneHeroScene,
  })),
);

export function LandingHero() {
  return (
    <section className="relative mx-auto max-w-7xl px-6">
      {/* 3D layer sits behind the copy, full-bleed inside the section */}
      <div className="absolute inset-0 -z-10">
        <Suspense fallback={null}>
          <DroneHeroScene />
        </Suspense>
      </div>

      {/* Legibility scrim under the copy column — canvas stays vivid on the right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/85 to-transparent md:via-background/70"
      />

      {/* Technical grid overlay stays for the HUD vibe */}
      <div className="pointer-events-none absolute inset-0">
        <div className="grid h-full w-full grid-cols-[1px_auto_1px] grid-rows-[1px_auto_1px] gap-4">
          <div className="col-span-3 border-b border-border/20" />
          <div className="row-span-3 border-r border-border/20" />
        </div>
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-0 py-24 md:py-32">
        <div className="rise-in max-w-2xl">
          <p className="label-mono">Flight hour tracking for FPV pilots</p>
          <h1 className="mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-foreground lg:text-6xl">
            Every pack. Every sim run.{" "}
            <span className="text-primary">Counted.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            StickTime is the logbook, gear hanger and analytics dashboard for
            pilots who take stick time seriously — from your first hover to your
            hundredth race.
          </p>
          <div className="mt-8 flex gap-4">
            <Link to="/" search={{ showAuth: true, mode: "signup" }}>
              <Button size="lg">Start your logbook</Button>
            </Link>
            <Link to="/" search={{ showAuth: true, mode: "login" }}>
              <Button size="lg" variant="outline">
                I already fly here
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
