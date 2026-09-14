import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BatteryCharging,
  BarChart3,
  CheckCircle2,
  Clock3,
  Wrench,
} from "lucide-react";
import { ClientOnly } from "@/components/three/client-only";
import { CanvasBase } from "@/components/three/canvas-base";
import { FpvDrone } from "@/components/three/fpv-drone";
import { HudRings } from "@/components/three/hud-rings";
import { LightRig } from "@/components/three/lights";
import { ParticleField } from "@/components/three/particle-field";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

const FEATURES = [
  {
    id: "logbook",
    kicker: "01 / FLIGHT LOGBOOK",
    title: "Every pack becomes useful context.",
    body: "See how a session moves from raw duration into a clean record: mode, airframe, packs, rating, and notes.",
    icon: Clock3,
    color: "orange",
    readout: "SESSION // 04:28",
  },
  {
    id: "battery",
    kicker: "02 / BATTERY HEALTH",
    title: "Energy data before failure data.",
    body: "Battery cycles and internal-resistance checks surface the packs that need attention before the next sortie.",
    icon: BatteryCharging,
    color: "sky",
    readout: "6S // 24.7V // 98%",
  },
  {
    id: "fleet",
    kicker: "03 / FLEET CONTROL",
    title: "Readiness that holds up under review.",
    body: "Airframes, parts, service work, and pilot activity share one operational history—so “ready” has a reason behind it.",
    icon: Wrench,
    color: "emerald",
    readout: "AIRWORTHINESS // READY",
  },
] as const;

function FlightLabScene({ active }: { active: number }) {
  const rig = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!rig.current) return;
    const t = clock.getElapsedTime();
    const targetX = active === 0 ? 0.25 : active === 1 ? -0.2 : 0.15;
    const targetY = active === 0 ? 0.08 : active === 1 ? 0.2 : -0.04;
    rig.current.position.x += (targetX - rig.current.position.x) * 0.045;
    rig.current.position.y +=
      (targetY + Math.sin(t * 1.1) * 0.06 - rig.current.position.y) * 0.045;
    rig.current.rotation.y += 0.0028 + active * 0.0008;
    rig.current.rotation.z +=
      ((active - 1) * 0.06 - rig.current.rotation.z) * 0.035;
  });
  return (
    <>
      <LightRig
        rimIntensity={2.8 + active * 0.3}
        fillIntensity={0.65}
        keyIntensity={1.05}
      />
      <group ref={rig} position={[0, 0.1, 0]} rotation={[0.04, -0.45, 0]}>
        <FpvDrone />
        <HudRings />
      </group>
      <ContactShadows
        position={[0, -0.55, 0]}
        opacity={0.4}
        scale={5}
        blur={2.4}
        far={4}
        color="#f97316"
      />
      <ParticleField
        count={100}
        spread={[7, 4.5, 5]}
        speed={0.45 + active * 0.12}
      />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={false}
        minPolarAngle={Math.PI / 2.9}
        maxPolarAngle={Math.PI / 1.9}
      />
    </>
  );
}

export function FeatureFlightLab() {
  const [active, setActive] = useState(0);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const next = Number(
          (visible.target as HTMLElement).dataset.featureIndex,
        );
        if (Number.isFinite(next)) setActive(next);
      },
      { rootMargin: "-30% 0px -35%", threshold: [0.2, 0.45, 0.7] },
    );
    itemRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const selected = FEATURES[active]!;
  const Icon = selected.icon;
  return (
    <section className="relative border-y border-white/[0.08] bg-[#0b0b0e]">
      <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <div className="order-2 space-y-3 px-4 py-16 sm:px-8 lg:order-1 lg:px-16 lg:py-28">
          <div className="mb-10 max-w-md">
            <p className="label-mono text-primary">Scroll the system</p>
            <h2 className="mt-3 font-display text-3xl font-semibold leading-[1] tracking-[-0.045em] text-zinc-100 sm:text-4xl">
              Watch one flight become an operating picture.
            </h2>
            <p className="mt-4 text-sm leading-6 text-zinc-500">
              The model changes as you move through the workflow. No stock
              imagery. No fake dashboard screenshots—just the actual product
              concepts in motion.
            </p>
          </div>
          {FEATURES.map((feature, index) => {
            const FeatureIcon = feature.icon;
            const selectedItem = active === index;
            return (
              <article
                key={feature.id}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                data-feature-index={index}
                className={`min-h-[320px] rounded-2xl border p-6 transition-all duration-300 sm:p-8 ${selectedItem ? "border-primary/35 bg-primary/[0.065] shadow-[0_0_45px_-28px_rgba(249,115,22,0.9)]" : "border-white/[0.08] bg-[#111114] opacity-65"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-lg border ${selectedItem ? "border-primary/25 bg-primary/10 text-primary" : "border-white/[0.1] bg-white/[0.025] text-zinc-500"}`}
                  >
                    <FeatureIcon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-600">
                    {feature.kicker}
                  </span>
                </div>
                <h3 className="mt-8 max-w-md font-display text-2xl font-semibold tracking-[-0.04em] text-zinc-100 sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-4 max-w-md text-sm leading-6 text-zinc-400">
                  {feature.body}
                </p>
                <div className="mt-8 flex items-center gap-3 border-t border-white/[0.08] pt-4 font-mono text-[9px] tracking-[0.14em] text-zinc-500">
                  <Activity className="h-3.5 w-3.5 text-primary" />{" "}
                  {feature.readout}
                  <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-400" />
                </div>
              </article>
            );
          })}
        </div>
        <div className="order-1 min-h-[530px] lg:order-2 lg:min-h-0">
          <div className="sticky top-16 h-[min(72vh,700px)] min-h-[500px] overflow-hidden border-l border-white/[0.08] bg-[#08080a] lg:top-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(249,115,22,0.13),transparent_35%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:auto,46px_46px,46px_46px]" />
            <ClientOnly
              fallback={
                <div className="absolute inset-0 grid place-items-center">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              }
            >
              <CanvasBase
                className="absolute inset-0"
                camera={{ position: [1.05, 1.3, 4.7], fov: 43 }}
                maxDpr={1.6}
              >
                <FlightLabScene active={active} />
              </CanvasBase>
            </ClientOnly>
            <div className="absolute left-5 top-5 right-5 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.16em] text-zinc-600">
                LIVE PRODUCT MODEL
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                DEMO DATA
              </span>
            </div>
            <div className="absolute bottom-5 left-5 right-5 rounded-xl border border-white/[0.1] bg-black/60 p-4 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-mono text-[10px] tracking-[0.16em] text-zinc-300">
                  {selected.kicker}
                </span>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <span className="font-display text-xl font-semibold tracking-[-0.03em] text-zinc-100">
                  {selected.readout}
                </span>
                <BarChart3 className="h-4 w-4 text-zinc-600" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
