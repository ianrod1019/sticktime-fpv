import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Object3D, type InstancedMesh } from "three";
import { SCENE_COLORS } from "@/components/three/lights";

const EMBER = SCENE_COLORS.ember;

/** Rough mobile heuristic — enough to halve particle counts on phones. */
function isCompactViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export interface ParticleFieldProps {
  /** Base particle count before the mobile adjustment. */
  count?: number;
  /** Bounding half-extents of the drift volume. */
  spread?: [number, number, number];
  /** Mote tint. */
  color?: string;
  /** Point size in world units. */
  size?: number;
  /** Overall drift speed multiplier. */
  speed?: number;
}

/**
 * Instanced dust motes drifting slowly upward with a slight sine sway.
 * Reads as atmosphere in front of the void canvas without costing draw
 * calls — one InstancedMesh, one material.
 */
export function ParticleField({
  count = 220,
  spread = [14, 9, 8],
  color = EMBER,
  size = 0.035,
  speed = 1,
}: ParticleFieldProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const compact = useMemo(isCompactViewport, []);

  const resolvedCount = compact ? Math.floor(count * 0.5) : count;

  const seeds = useMemo(() => {
    return Array.from({ length: resolvedCount }, () => ({
      x: (Math.random() * 2 - 1) * spread[0],
      y: (Math.random() * 2 - 1) * spread[1],
      z: (Math.random() * 2 - 1) * spread[2],
      speedY: (0.1 + Math.random() * 0.22) * speed,
      sway: 0.3 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      scale: 0.5 + Math.random() * 0.9,
    }));
    // spread/speed are static per mount; recomputed only if count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCount]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = clock.getElapsedTime();
    const spanY = spread[1] * 2;

    for (let i = 0; i < resolvedCount; i++) {
      const s = seeds[i];
      if (!s) continue;
      // Rise and wrap within the vertical span
      let y = s.y + t * s.speedY;
      y = ((((y + spread[1]) % spanY) + spanY) % spanY) - spread[1];
      // Gentle horizontal sway
      const x = s.x + Math.sin(t * 0.2 * s.sway + s.phase) * 0.6;

      dummy.position.set(x, y, s.z);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, resolvedCount]}>
      <sphereGeometry args={[size, 6, 6]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.35}
        toneMapped={false}
      />
    </instancedMesh>
  );
}
