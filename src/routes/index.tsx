import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Plane, Timer, Wrench, Flame, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";
import { useAuth } from "@/context/auth-context";
import { z } from "zod";
import { TopNav } from "@/components/top-nav";

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

function Landing() {
  const { showAuth, mode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    setAuthModalOpen(!!showAuth);
  }, [showAuth, loading]);

  const closeAuth = () => {
    navigate({ to: "/", search: { showAuth: undefined, mode: undefined } });
  };

  const openAuth = (mode: "login" | "signup") => {
    navigate({ to: "/", search: { showAuth: true, mode } });
  };

  const goHome = () => {
    navigate({ to: "/", replace: true });
  };

  return (
    <>
      <TopNav />

      <div className="min-h-screen relative pt-20">
        <section className="relative mx-auto max-w-7xl px-6">
          {/* Technical Grid Overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="grid w-full h-full grid-cols-[1px_auto_1px] grid-rows-[1px_auto_1px] gap-4">
              <div className="border-b border-border/20 col-span-3" />
              <div className="border-r border-border/20 row-span-3" />
            </div>
          </div>

          <div className="relative grid max-w-7xl mx-auto gap-0 py-20">
            {/* Left Column - Content */}
            <div className="max-w-2xl">
              <p className="label-mono">Flight hour tracking for FPV pilots</p>
              <h1 className="mt-4 text-5xl font-bold leading-[1.05] tracking-tight text-foreground lg:text-6xl">
                Every pack. Every sim run.{" "}
                <span className="text-primary">Counted.</span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl">
                StickTime is the logbook, gear hanger and analytics dashboard
                for pilots who take stick time seriously — from your first hover
                to your hundredth race.
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

        {/* Features - Bento Grid Style */}
        <section className="relative mx-auto max-w-7xl px-6 pb-24">
          <h2 className="text-center text-2xl font-bold mb-12 text-foreground">
            Built for Precision Flying
          </h2>

          <div className="grid gap-4">
            {/* Bento Grid Layout */}
            <div className="grid gap-4">
              {/* Large Feature - Flight Time */}
              <article className="col-span-2 row-span-2 bg-card/50 border border-border/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Timer className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Dual Timecards
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Separate sim and real-world logging in 5-minute precision
                      blocks
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-muted-foreground">
                    Track every second of airtime with surgical precision -
                    automatically separates simulator flights from real-world
                    flights, ensuring your logs are always accurate to the
                    minute.
                  </p>
                </div>
              </article>

              {/* Medium Feature - Gear Management */}
              <article className="bg-card/50 border border-border/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Wrench className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Gear Garage
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Quads, goggles, radios and every component with wear-based
                      service alerts
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-muted-foreground">
                    Your intelligent gear maintenance system. Get proactive
                    alerts based on actual usage time, flight conditions, and
                    component wear patterns - never fly with uncertain equipment
                    again.
                  </p>
                </div>
              </article>

              {/* Medium Feature - Streaks & Progress */}
              <article className="bg-card/50 border border-border/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Flame className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Streaks & Heatmap
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      GitHub-style consistency grid and streak counter that
                      keeps you flying
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-muted-foreground">
                    Visualize your flying consistency with an engaging heatmap
                    that shows your flight patterns over time. Build and
                    maintain streaks that motivate you to fly more regularly and
                    improve your skills.
                  </p>
                </div>
              </article>

              {/* Medium Feature - Squad Portal */}
              <article className="bg-card/50 border border-border/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Squad Portal
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Team spaces with rotating entry codes that expire on your
                      schedule
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-muted-foreground">
                    Fly together securely with your squadron. Shared flight
                    logs, rotating access codes, and team analytics keep your
                    squad coordinated and safe - all while maintaining
                    operational security and privacy controls.
                  </p>
                </div>
              </article>

              {/* Medium Feature - Data Export */}
              <article className="bg-card/50 border border-border/30 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Plane className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Export Anything
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      CSV exports of your whole logbook, any time
                    </p>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-4">
                  <p className="text-muted-foreground">
                    Own your data completely. Export your entire flight logbook
                    as CSV for spreadsheets whenever you need it. No vendor
                    lock-in, no restrictions - just pure, accessible data that
                    belongs to you.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
          StickTime FPV — built for the quad-obsessed.
        </footer>

        {authModalOpen && (
          <AuthModal
            isOpen={true}
            onClose={closeAuth}
            initialMode={mode || "login"}
          />
        )}
      </div>
    </>
  );
}
