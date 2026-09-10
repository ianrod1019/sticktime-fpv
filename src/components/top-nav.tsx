import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

function DroneIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
      <line x1="4" y1="4" x2="9" y2="9" />
      <line x1="20" y1="4" x2="15" y2="9" />
      <line x1="4" y1="20" x2="9" y2="15" />
      <line x1="20" y1="20" x2="15" y2="15" />
      <circle cx="4" cy="4" r="2" />
      <circle cx="20" cy="4" r="2" />
      <circle cx="4" cy="20" r="2" />
      <circle cx="20" cy="20" r="2" />
    </svg>
  );
}

export function TopNav() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const openAuth = (mode: "login" | "signup") => {
    navigate({ to: "/", search: { showAuth: true, mode } });
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-[var(--color-background)]/95 backdrop-blur-sm border-b border-[var(--color-border)]">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-2">
          <DroneIcon className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold">StickTime FPV</span>
        </Link>
        <div className="hidden md:flex space-x-6">
          <Link to="/features" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Features</Link>
          <Link to="/docs" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Docs</Link>
          <Link to="/pricing" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Pricing</Link>
          <Link to="/terms" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Terms</Link>
          <Link to="/privacy" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Privacy</Link>
          <Link to="/battery-health" className="text-foreground hover:text-primary transition-colors font-mono text-sm">Battery Health</Link>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {loading ? (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        ) : user ? (
          <Link to="/dashboard">
            <Button variant="default" size="sm">Dashboard</Button>
          </Link>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => openAuth("login")}
          >
            Sign in
          </Button>
        )}
      </div>
    </nav>
  );
}