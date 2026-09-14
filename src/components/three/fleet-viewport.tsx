import { useEffect, useRef, useState } from "react";
import { CanvasBase } from "@/components/three/canvas-base";
import { ClientOnly } from "@/components/three/client-only";
import { FpvDrone } from "@/components/three/fpv-drone";
import { HudRings } from "@/components/three/hud-rings";
import { LightRig } from "@/components/three/lights";
import { ParticleField } from "@/components/three/particle-field";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  Activity,
  Crosshair,
  Gauge,
  Maximize2,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { Group } from "three";

const RIGS = [
  {
    id: "STK-01",
    label: "RACE // 5IN",
    state: "READY",
    hours: "42.8h",
    color: "orange",
  },
  {
    id: "STK-02",
    label: "CINE // 7IN",
    state: "SERVICE DUE",
    hours: "18.2h",
    color: "sky",
  },
  {
    id: "STK-03",
    label: "TRAINER // 5IN",
    state: "READY",
    hours: "76.4h",
    color: "emerald",
  },
] as const;

function ViewportRig({ active }: { active: number }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.getElapsedTime();
    group.current.position.y = Math.sin(t * 1.1) * 0.08;
    group.current.rotation.y += 0.0025;
    group.current.rotation.z = Math.sin(t * 0.55) * 0.035;
  });
  return (
    <group
      ref={group}
      position={[0, 0, 0]}
      scale={active === 1 ? 0.94 : active === 2 ? 1.05 : 1}
    >
      <FpvDrone />
      <HudRings />
    </group>
  );
}

function FleetScene({ active }: { active: number }) {
  return (
    <>
      <LightRig rimIntensity={3.1} fillIntensity={0.7} keyIntensity={1.1} />
      <group position={[0.15, 0.05, 0]} rotation={[0.06, -0.3, 0]}>
        <ViewportRig active={active} />
      </group>
      <ContactShadows
        position={[0, -0.5, 0]}
        opacity={0.4}
        scale={5}
        blur={2.5}
        far={4}
        color="#f97316"
      />
      <ParticleField count={120} spread={[8, 5, 5]} speed={0.5} />
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 2.8}
        maxPolarAngle={Math.PI / 1.8}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </>
  );
}

export function FleetViewport() {
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const selected = RIGS[active];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      className={`${fullscreen ? "fixed inset-4 z-50" : "relative"} overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0a0a0d] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_28px_80px_-45px_rgba(0,0,0,1)]`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_58%_40%,rgba(249,115,22,0.11),transparent_32%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:auto,44px_44px,44px_44px]" />
      <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary">
            <Crosshair className="h-4 w-4" />
          </span>
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-zinc-200">
              FLEET VIEWPORT
            </div>
            <div className="mt-0.5 font-mono text-[9px] tracking-[0.13em] text-zinc-600">
              LIVE 3D OPERATIONS MODEL
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((value) => !value)}
          className="rounded-md border border-white/[0.1] p-2 text-zinc-500 transition-colors hover:border-primary/30 hover:text-primary"
          aria-label={fullscreen ? "Exit full screen" : "Expand fleet viewport"}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <div
        className={`${fullscreen ? "h-[calc(100%-58px)]" : "h-[430px] sm:h-[480px]"} relative`}
      >
        <ClientOnly
          fallback={
            <div className="absolute inset-0 grid place-items-center">
              <div className="h-7 w-7 animate-spin rounded-full border border-primary border-t-transparent" />
            </div>
          }
        >
          <CanvasBase
            className="absolute inset-0"
            camera={{ position: [1.1, 1.4, 4.8], fov: 42 }}
            maxDpr={1.5}
          >
            <FleetScene active={active} />
          </CanvasBase>
        </ClientOnly>
        <div className="pointer-events-none absolute left-4 top-4 font-mono text-[9px] tracking-[0.14em] text-zinc-600">
          AZ 034° // EL 18°
        </div>
        <div className="pointer-events-none absolute right-4 top-4 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.14em] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> TELEMETRY
          LINKED
        </div>
        <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:grid-cols-3">
          <MiniReadout
            icon={Gauge}
            label="POWERTRAIN"
            value="NOMINAL"
            tone="text-emerald-400"
          />
          <MiniReadout
            icon={Activity}
            label="MOTOR TEMP"
            value="41.2°C"
            tone="text-primary"
          />
          <MiniReadout
            icon={ShieldCheck}
            label="AIRWORTHINESS"
            value={selected.state}
            tone={
              selected.state === "READY" ? "text-emerald-400" : "text-amber-300"
            }
          />
        </div>
      </div>
      <div className="relative z-10 grid border-t border-white/[0.08] bg-[#0d0d10] sm:grid-cols-3">
        {RIGS.map((rig, index) => (
          <button
            key={rig.id}
            type="button"
            onClick={() => setActive(index)}
            className={`flex items-center justify-between border-b border-white/[0.07] px-4 py-3 text-left transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${active === index ? "bg-primary/[0.08]" : "hover:bg-white/[0.035]"}`}
          >
            <span>
              <span
                className={`block font-mono text-[10px] tracking-[0.14em] ${active === index ? "text-primary" : "text-zinc-300"}`}
              >
                {rig.id}
              </span>
              <span className="mt-1 block font-mono text-[9px] tracking-[0.12em] text-zinc-600">
                {rig.label}
              </span>
            </span>
            <span className="text-right">
              <span
                className={`block font-mono text-[9px] tracking-[0.1em] ${rig.state === "READY" ? "text-emerald-400" : "text-amber-300"}`}
              >
                {rig.state}
              </span>
              <span className="mt-1 block font-mono text-[9px] text-zinc-600">
                {rig.hours}
              </span>
            </span>
          </button>
        ))}
      </div>
      {fullscreen && (
        <div className="fixed inset-0 -z-10 bg-[#050506]/90 backdrop-blur-sm" />
      )}
    </section>
  );
}

function MiniReadout({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="border border-white/[0.09] bg-black/55 px-3 py-2 backdrop-blur-md">
      <div className="flex items-center gap-1.5 font-mono text-[8px] tracking-[0.14em] text-zinc-600">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-1 font-mono text-[10px] tracking-[0.12em] ${tone}`}>
        {value}
      </div>
    </div>
  );
}
