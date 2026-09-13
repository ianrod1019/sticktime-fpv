import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import { CanvasBase } from "@/components/three/canvas-base";
import { ClientOnly } from "@/components/three/client-only";
import { FpvDrone } from "@/components/three/fpv-drone";
import { HudRings } from "@/components/three/hud-rings";
import { LightRig } from "@/components/three/lights";
import { ParticleField } from "@/components/three/particle-field";

/** Reads prefers-reduced-motion reactively. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Tracks pointer for a subtle parallax; inert on touch devices. */
function usePointerParallax(): { x: number; y: number } {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setPos({
          x: (e.clientX / window.innerWidth) * 2 - 1,
          y: (e.clientY / window.innerHeight) * 2 - 1,
        });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return pos;
}

/**
 * Where the drone sits relative to the hero copy: right of the headline on
 * desktop so the drone owns its own half of the frame, centered behind the
 * copy on mobile.
 */
function useDroneAnchor(): [number, number, number] {
  const [anchor, setAnchor] = useState<[number, number, number]>([0, 0, 0]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setAnchor(mq.matches ? [1.35, 0.28, 0] : [0, 0.15, 0]);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return anchor;
}

/** Slow parallax rig — orbits the camera a hair around the drone. */
function ParallaxRig({ x, y }: { x: number; y: number }) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const targetX = 1.05 + x * 0.55;
    const targetY = 1.35 + y * -0.3 + Math.sin(t * 0.22) * 0.08;
    camera.position.x += (targetX - camera.position.x) * 0.045;
    camera.position.y += (targetY - camera.position.y) * 0.045;
    // High 3/4 view over the starboard shoulder — reads the top deck,
    // camera pod and prop discs instead of an edge-on sliver.
    camera.lookAt(0.55, 0, 0);
  });
  return null;
}

/**
 * The landing hero scene: cinematic FPV quad with spinning props, HUD
 * telemetry rings, ember dust, structured light rig, and pointer parallax.
 * Fully static (single rendered pose) under prefers-reduced-motion.
 */
export function DroneHeroScene() {
  const reducedMotion = useReducedMotion();
  const parallax = usePointerParallax();
  const droneAnchor = useDroneAnchor();
  // Fade the canvas in after mount so the lazy scene never pops
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <ClientOnly
      fallback={
        <div className="absolute inset-0" aria-hidden role="presentation" />
      }
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 transition-opacity duration-1000 ease-out",
          mounted ? "opacity-100" : "opacity-0",
        )}
      >
        <CanvasBase
          className="absolute inset-0"
          camera={{ position: [1.05, 1.35, 4.6], fov: 44 }}
          maxDpr={1.75}
          frameloop={reducedMotion ? "demand" : "always"}
        >
          <LightRig />
          <group position={droneAnchor} rotation={[0, -0.5, 0]}>
            <FpvDrone />
            {!reducedMotion && <HudRings />}
          </group>
          {!reducedMotion && (
            <ParticleField count={160} spread={[9, 6, 6]} speed={0.8} />
          )}
          {!reducedMotion && <ParallaxRig x={parallax.x} y={parallax.y} />}
        </CanvasBase>
      </div>
    </ClientOnly>
  );
}
