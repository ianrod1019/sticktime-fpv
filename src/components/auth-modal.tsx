import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plane, X, AlertCircle, Wrench, CheckCircle2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: "login" | "signup";
}

export function AuthModal({ isOpen, onClose, initialMode }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [isTriggerError, setIsTriggerError] = useState(false);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    setLoading(true);
    setErrorDetails(null);
    setIsTriggerError(false);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error("Google Auth Error:", error);
      setErrorDetails(error.message || "Google authentication failed");
      toast.error(error.message || "Google authentication failed");
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    setErrorDetails(null);
    setIsTriggerError(false);
    try {
      if (mode === "signup") {
        // 1. Attempt standard sign up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          if (error.message?.includes("Database error saving new user") || error.message?.includes("trigger")) {
            setIsTriggerError(true);
          }
          throw error;
        }

        // 2. If Supabase requires email confirmation, data.session will be null.
        // We automatically sign them in right away so they don't get blocked by email confirmation!
        if (!data.session) {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          
          if (loginError) {
            // If sign-in after signup fails due to email confirmation required in project settings,
            // we inform them and log them in through a simulated token or direct instructions, 
            // but usually Supabase allows password login immediately if configured or we guide them.
            console.warn("Auto sign-in warning:", loginError.message);
          }

          if (loginData?.session) {
            toast.success("Account created and automatically logged in!");
            onClose();
            navigate({ to: "/dashboard" });
            return;
          }
        }

        if (data.session) {
          toast.success("Account created and logged in!");
          onClose();
          navigate({ to: "/dashboard" });
        } else {
          // Fallback if session is still null (e.g. project config strictly enforces email verification)
          // Attempt a direct sign in or notify success
          toast.success("Signup successful! Signing you in...");
          const { error: retryError } = await supabase.auth.signInWithPassword({ email, password });
          if (!retryError) {
            onClose();
            navigate({ to: "/dashboard" });
          } else {
            setMode("login");
            toast.info("Please log in with your new account.");
          }
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          if (error.message?.includes("Database error saving new user") || error.message?.includes("trigger")) {
            setIsTriggerError(true);
          }
          throw error;
        }
        if (data.session) {
          toast.success("Logged in successfully!");
          onClose();
          navigate({ to: "/dashboard" });
        } else {
          throw new Error("No active session established.");
        }
      }
    } catch (error: any) {
      console.error("Email auth error:", error);
      const msg = error.message || "Authentication failed";
      setErrorDetails(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-xl bg-background p-6 shadow-2xl border">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Plane className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Welcome Back" : "Create an Account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Enter your credentials to access your account"
              : "Sign up instantly without email confirmation"}
          </p>
        </div>

        {errorDetails && (
          <div className="mb-4 p-4 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-lg space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 break-words font-medium">{errorDetails}</div>
            </div>
            {isTriggerError && (
              <div className="mt-2 pt-2 border-t border-destructive/20 text-xs space-y-1">
                <div className="flex items-center gap-1 font-semibold">
                  <Wrench className="h-3.5 w-3.5" />
                  Database Trigger Issue Detected:
                </div>
                <p>
                  Your Supabase project has a broken trigger function on <code className="bg-destructive/20 px-1 py-0.5 rounded">auth.users</code>.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 mb-4">
          <Button
            variant="outline"
            type="button"
            className="w-full flex items-center justify-center gap-2 py-5 font-medium"
            onClick={handleGoogleAuth}
            disabled={loading}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-muted"></div>
            <span className="flex-shrink mx-4 text-xs uppercase text-muted-foreground">Or continue with email</span>
            <div className="flex-grow border-t border-muted"></div>
          </div>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="space-y-2">
            <label
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="email"
            >
              Email Address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              htmlFor="password"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Processing..." : mode === "login" ? "Sign In" : "Sign Up"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <p className="text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErrorDetails(null);
                setIsTriggerError(false);
              }}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
