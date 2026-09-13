import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, type CanvasProps } from "@react-three/fiber";
import { AdaptiveDpr, Html, Preload } from "@react-three/drei";
import { cn } from "@/lib/utils";

/**
 * Spinner shown inside the canvas while lazy scene chunks resolve.
 * Kept minimal: a single ring, themed via semantic tokens.
 */
function CanvasLoader() {
  return (
    <Html center>
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-primary/80 border-t-transparent"
        role="status"
        aria-label="Loading 3D scene"
      />
    </Html>
  );
}

/**
 * Pauses the render loop while the canvas is scrolled out of the viewport.
 * Zero GPU cost for offscreen scenes; state flips frameloop to "never".
 */
function useInViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setVisible(entry.isIntersecting);
      },
      { rootMargin: "10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

export interface CanvasBaseProps {
  /** Camera props; falls back to a sensible default view. */
  camera?: NonNullable<CanvasProps["camera"]>;
  /** Created-callback from R3F. */
  onCreated?: NonNullable<CanvasProps["onCreated"]>;
  /** Scene contents — wrapped in Suspense with a themed loader. */
  children: ReactNode;
  /** Sizing wrapper classes; parent must give it real dimensions. */
  className?: string | undefined;
  /** Base frameloop. Auto-paused while offscreen regardless. */
  frameloop?: CanvasProps["frameloop"];
  /** DPR clamp. Lower the max on heavy scenes. */
  maxDpr?: number;
  /** Inline styles for the sizing wrapper. */
  style?: React.CSSProperties | undefined;
}

const DEFAULT_CAMERA = { position: [0, 0.4, 5.2], fov: 42 } as const;

/**
 * Shared R3F canvas: explicit alpha+AA GL context, adaptive DPR, Suspense
 * with a themed loader, Preload, and IntersectionObserver pausing.
 * The wrapper owns sizing — pass `className` with real height/width.
 */
export function CanvasBase({
  children,
  className,
  frameloop = "always",
  maxDpr = 1.75,
  camera,
  onCreated,
  style,
}: CanvasBaseProps) {
  const { ref, visible } = useInViewport<HTMLDivElement>();
  const effectiveFrameloop = visible ? frameloop : "never";

  return (
    <div
      ref={ref}
      className={cn("relative h-full w-full", className)}
      style={style}
    >
      <Canvas
        frameloop={effectiveFrameloop}
        dpr={[1, maxDpr]}
        camera={camera ?? DEFAULT_CAMERA}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        {...(onCreated ? { onCreated } : {})}
      >
        <Suspense fallback={<CanvasLoader />}>
          {children}
          <Preload all />
        </Suspense>
        <AdaptiveDpr pixelated={false} />
      </Canvas>
    </div>
  );
}
