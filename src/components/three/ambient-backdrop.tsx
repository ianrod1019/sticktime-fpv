import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasBase } from "@/components/three/canvas-base";
import { ClientOnly } from "@/components/three/client-only";
import { ParticleField } from "@/components/three/particle-field";
import { SCENE_COLORS } from "@/components/three/lights";

const EMBER = SCENE_COLORS.ember;

/**
 * R3F owns the heartbeat via its rAF loop: frameloop="always" redraws every
 * frame, so dust drifts smoothly instead of stepping at the old 15fps
 * interval (which read as blinking). rAF auto-pauses while the tab is
 * hidden, and CanvasBase additionally flips to "never" when offscreen.
 */

/** Eased camera sway — dust parallax feels alive at full frame rate. */
function BackdropRig({
  pointer,
}: {
  pointer: React.RefObject<{ x: number; y: number }>;
}) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const p = pointer.current ?? { x: 0, y: 0 };
    camera.position.x +=
      (p.x * 0.5 + Math.sin(t * 0.12) * 0.25 - camera.position.x) * 0.08;
    camera.position.y +=
      (p.y * -0.3 + Math.cos(t * 0.09) * 0.15 - camera.position.y) * 0.08;
    camera.lookAt(0, 0, -6);
  });
  return null;
}

/**
 * Fixed, pointer-transparent WebGL backdrop for the logged-in app.
 * Rendered on R3F's requestAnimationFrame loop (paused while the tab is
 * hidden or scrolled offscreen), never touches React rendering, and sits at
 * -z-10 below all content.
 */
export function AmbientBackdrop() {
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pointer.current = {
          x: (e.clientX / window.innerWidth) * 2 - 1,
          y: (e.clientY / window.innerHeight) * 2 - 1,
        };
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const dustColor = useMemo(() => EMBER, []);

  return (
    <ClientOnly>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        data-ambient-backdrop
      >
        <CanvasBase
          className="absolute inset-0"
          maxDpr={1.25}
          camera={{ position: [0, 0, 3], fov: 50 }}
        >
          {/* Faint ember horizon glow low in the frame */}
          <mesh position={[0, -3.4, -8]}>
            <sphereGeometry args={[5.2, 24, 24]} />
            <meshBasicMaterial
              color={dustColor}
              transparent
              opacity={0.05}
              toneMapped={false}
            />
          </mesh>
          <ParticleField count={130} spread={[13, 8, 7]} speed={0.55} />
          <BackdropRig pointer={pointer} />
        </CanvasBase>
      </div>
    </ClientOnly>
  );
}
