import { useMemo } from "react";

/**
 * Palette mirrors the app's semantic tokens:
 * primary = high-vis aviation orange, sim = panel blue, canvas = void.
 */
export const SCENE_COLORS = {
  ember: "#f97316",
  emberSoft: "#fb923c",
  sim: "#60a5fa",
  carbon: "#18181b",
  carbonLight: "#27272a",
  steel: "#3f3f46",
} as const;

export interface LightRigProps {
  /** Warm rim strength behind the subject (the "ember edge"). */
  rimIntensity?: number;
  /** Cool fill from the sim-blue side. */
  fillIntensity?: number;
  /** Neutral key from above/front — kept dim to avoid blown-out whites. */
  keyIntensity?: number;
}

/**
 * Structured three-point rig tuned for the void canvas:
 * dim neutral key, warm ember rim for silhouette separation, faint
 * sim-blue fill so shadows stay readable without going flat black.
 */
export function LightRig({
  rimIntensity = 2.4,
  fillIntensity = 0.75,
  keyIntensity = 1.15,
}: LightRigProps) {
  const rimColor = useMemo(() => SCENE_COLORS.ember, []);
  const fillColor = useMemo(() => SCENE_COLORS.sim, []);

  return (
    <>
      {/* Soft base so nothing renders pure black against the void */}
      <ambientLight intensity={0.48} />
      {/* Neutral key: high, slightly front — intentionally underexposed */}
      <directionalLight position={[4, 6, 5]} intensity={keyIntensity} />
      {/* Ember rim from behind-left for the high-vis edge */}
      <directionalLight
        position={[-5, 3, -4]}
        intensity={rimIntensity}
        color={rimColor}
      />
      {/* Sim-blue fill from the right, very low */}
      <directionalLight
        position={[6, -2, 3]}
        intensity={fillIntensity}
        color={fillColor}
      />
    </>
  );
}
