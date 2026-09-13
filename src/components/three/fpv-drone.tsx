import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group, Mesh, PointLight } from "three";
import { SCENE_COLORS } from "@/components/three/lights";

const EMBER = SCENE_COLORS.ember;

/** Carbon fiber deck — flat quad frame plate. */
function Deck() {
  return (
    <RoundedBox
      args={[1.5, 0.06, 1.5]}
      radius={0.02}
      smoothness={4}
      position={[0, 0, 0]}
    >
      <meshStandardMaterial
        color={SCENE_COLORS.carbon}
        metalness={0.55}
        roughness={0.42}
      />
    </RoundedBox>
  );
}

/** Top plate stack with emissive ember strip — the power hub. */
function Stack() {
  const ledRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ledRef.current) {
      const mat = ledRef.current.material as { emissiveIntensity?: number };
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = 1.6 + Math.sin(t * 2.4) * 0.5;
      }
    }
  });

  return (
    <group position={[0, 0.09, 0]}>
      {/* Flight controller stack */}
      <RoundedBox args={[0.52, 0.1, 0.52]} radius={0.015} smoothness={4}>
        <meshStandardMaterial
          color={SCENE_COLORS.carbonLight}
          metalness={0.6}
          roughness={0.35}
        />
      </RoundedBox>
      {/* Ember LED strip along the front edge */}
      <mesh ref={ledRef} position={[0, 0.01, 0.28]}>
        <boxGeometry args={[0.44, 0.03, 0.04]} />
        <meshStandardMaterial
          color={EMBER}
          emissive={EMBER}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      {/* FPV camera pod, tilted up like a race quad */}
      <group position={[0, 0.06, 0.32]} rotation={[-0.35, 0, 0]}>
        <RoundedBox args={[0.3, 0.22, 0.16]} radius={0.03} smoothness={4}>
          <meshStandardMaterial
            color={SCENE_COLORS.steel}
            metalness={0.7}
            roughness={0.3}
          />
        </RoundedBox>
        {/* Lens */}
        <mesh position={[0, 0.02, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.05, 16]} />
          <meshStandardMaterial
            color="#0c0c0e"
            metalness={0.9}
            roughness={0.12}
          />
        </mesh>
      </group>
    </group>
  );
}

interface ArmProps {
  angle: number;
}

/** One arm + motor bell + spinning prop. Angles are 45/135/225/315 degrees. */
function Arm({ angle }: ArmProps) {
  const armGroup = useRef<Group>(null);
  const propRef = useRef<Group>(null);
  const lightRef = useRef<PointLight>(null);

  const rad = useMemo(() => (angle * Math.PI) / 180, [angle]);
  const dirX = useMemo(() => Math.cos(rad), [rad]);
  const dirZ = useMemo(() => Math.sin(rad), [rad]);
  // Alternating prop direction like a real quad (props-in config)
  const spinDir = useMemo(() => (angle % 180 === 45 ? 1 : -1), [angle]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (propRef.current) {
      propRef.current.rotation.y = t * 26 * spinDir;
    }
    // Motor glow pulses softly, phase-shifted per motor
    if (lightRef.current) {
      lightRef.current.intensity = 0.55 + Math.sin(t * 3 + angle) * 0.18;
    }
  });

  return (
    <group ref={armGroup} rotation={[0, -rad, 0]}>
      {/* Arm beam reaching outward along +X after rotation */}
      <mesh position={[0.52, -0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.055, 0.9, 10]} />
        <meshStandardMaterial
          color={SCENE_COLORS.carbon}
          metalness={0.5}
          roughness={0.5}
        />
      </mesh>
      {/* Motor bell */}
      <group position={[0.92, 0.05, 0]}>
        <mesh>
          <cylinderGeometry args={[0.11, 0.12, 0.12, 18]} />
          <meshStandardMaterial
            color={SCENE_COLORS.steel}
            metalness={0.85}
            roughness={0.28}
          />
        </mesh>
        {/* Motor status light */}
        <pointLight
          ref={lightRef}
          position={[0, 0.12, 0]}
          color={EMBER}
          intensity={0.55}
          distance={1.4}
          decay={2}
        />
        {/* Prop disc: two thin crossed blades, blurred-fast spin */}
        <group ref={propRef} position={[0, 0.1, 0]}>
          {[0, Math.PI / 2].map((blade) => (
            <mesh key={blade} rotation={[0, blade, 0]}>
              <boxGeometry args={[0.62, 0.006, 0.055]} />
              <meshStandardMaterial
                color={SCENE_COLORS.carbonLight}
                metalness={0.4}
                roughness={0.45}
                transparent
                opacity={0.85}
              />
            </mesh>
          ))}
          {/* Prop hub */}
          <mesh>
            <cylinderGeometry args={[0.03, 0.03, 0.03, 10]} />
            <meshStandardMaterial
              color={EMBER}
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        </group>
        {/* Ember nav LED under the motor */}
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.028, 10, 10]} />
          <meshStandardMaterial
            color={EMBER}
            emissive={EMBER}
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
        {/* Soft warm glow pool under each motor */}
        <pointLight
          position={[0, -0.14, 0]}
          color={EMBER}
          intensity={0.35}
          distance={0.9}
          decay={2}
        />
      </group>
      {/* dirX/dirZ kept for future asymmetric frames */}
      <group visible={false}>
        <mesh position={[dirX, 0, dirZ]} />
      </group>
    </group>
  );
}

/**
 * Cinematic stylized FPV quad assembled from primitives:
 * carbon deck, stack + tilted cam pod, four arms with spinning props
 * and ember nav LEDs. Hover bob + subtle banking live on the parent.
 */
export function FpvDrone() {
  const bodyRef = useRef<Group>(null);
  const bankRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (bodyRef.current) {
      // Gentle hover bob
      bodyRef.current.position.y = Math.sin(t * 1.1) * 0.07;
    }
    if (bankRef.current) {
      // Slow idle banking, like trimming on the sticks
      bankRef.current.rotation.z = Math.sin(t * 0.6) * 0.045;
      bankRef.current.rotation.x = Math.sin(t * 0.43 + 1.2) * 0.03;
    }
  });

  return (
    <group ref={bodyRef}>
      <group ref={bankRef}>
        <Deck />
        <Stack />
        <Arm angle={45} />
        <Arm angle={135} />
        <Arm angle={225} />
        <Arm angle={315} />
      </group>
    </group>
  );
}
