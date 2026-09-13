import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { AuthModal } from "@/components/auth-modal";
import { useAuth } from "@/context/auth-context";
import { TopNav } from "@/components/top-nav";
import { LandingHero } from "@/pages/landing/-hero";
import { BentoFeatures } from "@/pages/landing/-bento-features";

const authSchema = z.object({
  showAuth: z.boolean().optional(),
  mode: z.enum(["login", "signup"]).optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => authSchema.parse(search),
  head: () => ({
    meta: [
      { title: "StickTime FPV — FPV flight hour & fleet tracking" },
      {
        name: "description",
        content:
          "Log simulator and real-world FPV airtime in 5-minute blocks, track quad maintenance health, and build your flying streak.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { showAuth, mode } = Route.useSearch();
  const navigate = useNavigate();
  const { loading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    setAuthModalOpen(!!showAuth);
  }, [showAuth, loading]);

  const closeAuth = () => {
    navigate({ to: "/", search: { showAuth: undefined, mode: undefined } });
  };

  return (
    <>
      <TopNav />

      <div className="relative min-h-screen pt-20">
        <LandingHero />
        <BentoFeatures />

        <footer className="border-t border-border px-6 py-8 text-center font-mono text-xs text-muted-foreground">
          StickTime FPV — built for the quad-obsessed.
        </footer>

        {authModalOpen && (
          <AuthModal
            isOpen={true}
            onClose={closeAuth}
            initialMode={mode || "login"}
          />
        )}
      </div>
    </>
  );
}
