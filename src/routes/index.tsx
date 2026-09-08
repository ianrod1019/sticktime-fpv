import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Plane, 
  Timer, 
  Wrench, 
  Flame, 
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/auth-modal";
import { useAuth } from "@/context/auth-context";
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
      <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-[var(--color-background)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="flex items-center gap-8">
          <div className="hidden md:flex space-x-6">
            <a href="/features" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Features</a>
            <a href="/docs" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Docs</a>
            <a href="/pricing" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Pricing</a>
            <a href="/terms" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Terms</a>
            <a href="/privacy" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Privacy</a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : user ? (
            <Link to="/dashboard">
              <Button variant="default" size="sm">Dashboard</Button>
            </Link>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => openAuth("login")}
            >
              Sign in
            </Button>
          )}
        </div>
      </nav>

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
              Every pack. Every sim run. <span className="text-primary">Counted.</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-xl">
              StickTime is the logbook, gear garage and analytics dashboard for pilots who take stick
              time seriously — from your first hover to your hundredth race.
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
          
          {/* Right Column - Terminal Preview */}
          <div className="relative w-[480px] hidden lg:block">
            <div className="relative">
              {/* Window Header Bar */}
              <div className="flex h-10 items-center px-4 bg-muted/50 border-b border-border/30">
                <div className="flex-1 text-xs text-muted-foreground font-mono">
                  /home/pilot/sticktime-fvp/logbook.db
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-success/50" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/50" />
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
                </div>
              </div>
              
              {/* Terminal Content */}
              <div className="p-4 font-mono text-sm text-muted-foreground bg-border/10 whitespace-pre-wrap overflow-auto h-[320px]">
2026-09-08 13:27:46 [INFO] Starting StickTime FPV Telemetry Service
2026-09-08 13:27:47 [DEBUG] Loading configuration from /home/pilot/.sticktime/config.yaml
2026-09-08 13:27:47 [INFO] Connected to Supabase project: sticktime-fpv-prod
2026-09-08 13:27:48 [INFO] Quad telemetry receiver active on UDP port 5760
2026-09-08 13:27:48 [WARN] No GPS fix - using last known position
2026-09-08 13:27:49 [INFO] Streaming flight data to web dashboard
2026-09-08 13:27:50 [DEBUG] Processing 5-minute timeblock for battery pack #3
2026-09-08 13:27:50 [INFO] Maintenance alert: Motors serviced - 2h 15m remaining
2026-09-08 13:27:51 [INFO] Flight log saved: 12m 43s (quad: Source One v5)
2026-09-08 13:27:51 [DEBUG] Syncing with squad hangar: Alpha Squadron
2026-09-08 13:27:52 [INFO] System ready - Awaiting pilot input
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features - Bento Grid Style */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24">
        <h2 className="text-center text-2xl font-bold mb-12 text-foreground">Built for Precision Flying</h2>
        
        <div className="grid gap-4">
          {/* Bento Grid Layout */}
          <div className="grid gap-4">
            {/* Large Feature - Flight Time */}
            <article className="col-span-2 row-span-2 bg-card/50 border border-border/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Timer className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Dual Timecards</h3>
                  <p className="text-muted-foreground text-sm">Separate sim and real-world logging in 5-minute precision blocks</p>
                </div>
              </div>
              <div className="border-t border-border/20 pt-4">
                <p className="text-muted-foreground">Track every second of airtime with surgical precision - automatically separates simulator flights from real-world flights, ensuring your logs are always accurate to the minute.</p>
              </div>
            </article>
            
            {/* Medium Feature - Gear Management */}
            <article className="bg-card/50 border border-border/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Wrench className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Gear Garage</h3>
                  <p className="text-muted-foreground text-sm">Quads, goggles, radios and every component with wear-based service alerts</p>
                </div>
              </div>
              <div className="border-t border-border/20 pt-4">
                <p className="text-muted-foreground">Your intelligent gear maintenance system. Get proactive alerts based on actual usage time, flight conditions, and component wear patterns - never fly with uncertain equipment again.</p>
              </div>
            </article>
            
            {/* Medium Feature - Streaks & Progress */}
            <article className="bg-card/50 border border-border/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Flame className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Streaks & Heatmap</h3>
                  <p className="text-muted-foreground text-sm">GitHub-style consistency grid and streak counter that keeps you flying</p>
                </div>
              </div>
              <div className="border-t border-border/20 pt-4">
                <p className="text-muted-foreground">Visualize your flying consistency with an engaging heatmap that shows your flight patterns over time. Build and maintain streaks that motivate you to fly more regularly and improve your skills.</p>
              </div>
            </article>
            
            {/* Medium Feature - Squad Portal */}
            <article className="bg-card/50 border border-border/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Squad Portal</h3>
                  <p className="text-muted-foreground text-sm">Team spaces with rotating entry codes that expire on your schedule</p>
                </div>
              </div>
              <div className="border-t border-border/20 pt-4">
                <p className="text-muted-foreground">Fly together securely with your squadron. Shared flight logs, rotating access codes, and team analytics keep your squad coordinated and safe - all while maintaining operational security and privacy controls.</p>
              </div>
            </article>
            
            {/* Large Feature - Data Export */}
            <article className="col-span-2 bg-card/50 border border-border/30 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Plane className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Export Anything</h3>
                  <p className="text-muted-foreground text-sm">CSV and SQL dumps of your whole logbook, any time</p>
                </div>
              </div>
              <div className="border-t border-border/20 pt-4">
                <p className="text-muted-foreground">Own your data completely. Export your entire flight logbook as CSV for spreadsheets or SQL for custom analysis whenever you need it. No vendor lock-in, no restrictions - just pure, accessible data that belongs to you.</p>
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