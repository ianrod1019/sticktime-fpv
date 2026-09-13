import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. */
  maxTilt?: number;
  /** Perspective in pixels. */
  perspective?: number;
}

/**
 * Pointer-tracked 3D tilt. Pure CSS perspective + transform — no WebGL.
 * Inert on touch devices and under prefers-reduced-motion, where it
 * degrades to a plain elevated card.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 6,
  perspective = 900,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<string>(
    "perspective(900px) rotateX(0deg) rotateY(0deg)",
  );
  const [glareX, setGlareX] = useState(50);
  const [glareY, setGlareY] = useState(50);
  const [active, setActive] = useState(false);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotY = (px - 0.5) * 2 * maxTilt;
    const rotX = (0.5 - py) * 2 * maxTilt;
    setTransform(
      `perspective(${perspective}px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`,
    );
    setGlareX(px * 100);
    setGlareY(py * 100);
    setActive(true);
  }

  function handleLeave() {
    setTransform(`perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`);
    setActive(false);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn(
        "group relative transition-transform duration-200 ease-out will-change-transform",
        className,
      )}
      style={{ transform }}
    >
      {/* Sheen that follows the pointer while tilting */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300",
          active ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: `radial-gradient(420px circle at ${glareX}% ${glareY}%, oklch(1 0 0 / 0.05), transparent 55%)`,
        }}
      />
      {children}
    </div>
  );
}
