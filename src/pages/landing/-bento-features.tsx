import { Plane, Timer, Wrench, Flame, Users } from "lucide-react";
import { TiltCard } from "@/components/tilt-card";

interface Feature {
  icon: typeof Timer;
  title: string;
  tagline: string;
  body: string;
  span?: string;
}

const FEATURES: Feature[] = [
  {
    icon: Timer,
    title: "Dual Timecards",
    tagline: "Separate sim and real-world logging in 5-minute precision blocks",
    body: "Track every second of airtime with surgical precision - automatically separates simulator flights from real-world flights, ensuring your logs are always accurate to the minute.",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    icon: Wrench,
    title: "Gear Garage",
    tagline:
      "Quads, goggles, radios and every component with wear-based service alerts",
    body: "Your intelligent gear maintenance system. Get proactive alerts based on actual usage time, flight conditions, and component wear patterns - never fly with uncertain equipment again.",
  },
  {
    icon: Flame,
    title: "Streaks & Heatmap",
    tagline:
      "GitHub-style consistency grid and streak counter that keeps you flying",
    body: "Visualize your flying consistency with an engaging heatmap that shows your flight patterns over time. Build and maintain streaks that motivate you to fly more regularly and improve your skills.",
  },
  {
    icon: Users,
    title: "Squad Portal",
    tagline:
      "Team spaces with rotating entry codes that expire on your schedule",
    body: "Fly together securely with your squadron. Shared flight logs, rotating access codes, and team analytics keep your squad coordinated and safe - all while maintaining operational security and privacy controls.",
  },
  {
    icon: Plane,
    title: "Export Anything",
    tagline: "CSV exports of your whole logbook, any time",
    body: "Own your data completely. Export your entire flight logbook as CSV for spreadsheets whenever you need it. No vendor lock-in, no restrictions - just pure, accessible data that belongs to you.",
  },
];

function FeatureCard({ icon: Icon, title, tagline, body, span }: Feature) {
  return (
    <TiltCard className={span ?? ""} maxTilt={4}>
      <article className="hud-panel h-full p-6 transition-colors duration-200 hover:border-primary/25">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <Icon className="h-5 w-5 text-primary" aria-hidden />
          </span>
          <div>
            <h3 className="font-display font-semibold text-foreground">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground">{tagline}</p>
          </div>
        </div>
        <div className="border-t border-border/20 pt-4">
          <p className="text-muted-foreground">{body}</p>
        </div>
      </article>
    </TiltCard>
  );
}

/**
 * Bento feature grid for the landing page. Data-driven from FEATURES;
 * cards tilt on pointer with a subtle sheen (TiltCard).
 */
export function BentoFeatures() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 pb-24">
      <h2 className="mb-12 text-center font-display text-2xl font-bold text-foreground">
        Built for Precision Flying
      </h2>
      <div className="rise-in-stagger grid gap-4 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}
