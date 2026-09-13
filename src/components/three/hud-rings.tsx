import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { SCENE_COLORS } from "@/components/three/lights";

const EMBER = SCENE_COLORS.ember;
const SIM = SCENE_COLORS.sim;

interface RingArcProps {
  radius: number;
  /** Arc length in radians (a full torus is 2π). */
  arc: number;
  tilt: [number, number, number];
  color: string;
  opacity: number;
  tube?: number;
}

/** A single thin arc segment. */
function RingArc({
  radius,
  arc,
  tilt,
  color,
  opacity,
  tube = 0.012,
}: RingArcProps) {
  return (
    <mesh rotation={tilt}>
      <torusGeometry args={[radius, tube, 8, 96, arc]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        toneMapped={false}
      />
    </mesh>
  );
}

interface TickRingProps {
  radius: number;
  count: number;
  tilt: [number, number, number];
  color: string;
  opacity: number;
}

/** Radial tick marks — the "instrument graduation" feel. */
function TickRing({ radius, count, tilt, color, opacity }: TickRingProps) {
  const ticks = useMemo(() => {
    return Array.from({ length: count }, (_, i) => (i / count) * Math.PI * 2);
  }, [count]);

  return (
    <group rotation={tilt}>
      {ticks.map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
          rotation={[0, 0, angle]}
        >
          <boxGeometry args={[0.075, 0.011, 0.011]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacity}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * HUD telemetry rings around the drone: two ember arcs on counter-rotating
 * tilts, one sim-blue full ring, and a graduation tick ring. All additive-
 * looking via unlit basic materials at low opacity.
 */
export function HudRings() {
  const ringA = useRef<Group>(null);
  const ringB = useRef<Group>(null);
  const ringC = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringA.current) ringA.current.rotation.z = t * 0.16;
    if (ringB.current) ringB.current.rotation.z = -t * 0.11;
    if (ringC.current) {
      ringC.current.rotation.z = t * 0.05;
      ringC.current.rotation.y = Math.sin(t * 0.3) * 0.12;
    }
  });

  return (
    <group position={[0, 0.1, 0]}>
      {/* Ember arc pair — offset tilts, counter-rotation */}
      <group ref={ringA} rotation={[Math.PI / 2.15, 0.18, 0]}>
        <RingArc
          radius={1.55}
          arc={Math.PI * 0.62}
          tilt={[0, 0, 0]}
          color={EMBER}
          opacity={0.6}
        />
        <RingArc
          radius={1.55}
          arc={Math.PI * 0.34}
          tilt={[0, 0, Math.PI]}
          color={EMBER}
          opacity={0.35}
        />
      </group>
      <group ref={ringB} rotation={[Math.PI / 2.3, -0.28, 0.4]}>
        <RingArc
          radius={1.82}
          arc={Math.PI * 0.5}
          tilt={[0, 0, 0.4]}
          color={SCENE_COLORS.emberSoft}
          opacity={0.4}
          tube={0.009}
        />
      </group>
      {/* Sim-blue full ring + graduation ticks */}
      <group ref={ringC} rotation={[Math.PI / 2.05, 0.1, 0]}>
        <RingArc
          radius={2.1}
          arc={Math.PI * 2}
          tilt={[0, 0, 0]}
          color={SIM}
          opacity={0.16}
          tube={0.007}
        />
        <TickRing
          radius={2.1}
          count={48}
          tilt={[0, 0, 0]}
          color={SIM}
          opacity={0.28}
        />
      </group>
    </group>
  );
}
