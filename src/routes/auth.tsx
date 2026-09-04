import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plane, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refreshRoleAndTier } = useAuth();

  const handleGoogleAuth = async () => {
    setLoading(true);
    setErrorDetails(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const errorObj = err as Error;
      console.error("Google Auth Error:", errorObj);
      setErrorDetails(errorObj.message || "Google authentication failed");
      toast.error(errorObj.message || "Google authentication failed");
      setLoading(false);
    }
  };

  const handleAuth = async (type: 'login' | 'signup') => {
    if (!email || !password) {
      toast.error("Please enter both email and password");
      return;
    }
    setLoading(true);
    setErrorDetails(null);
    try {
      if (type === 'signup') {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password 
        });

        if (error) throw error;
        
        if (data.session?.user) {
          await refreshRoleAndTier();
          toast.success("Account created and logged in successfully!");
          navigate({ to: "/dashboard" });
        } else {
          toast.success("Account created successfully! Please sign in.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });

        if (error) throw error;
        
        if (data.session?.user) {
          await refreshRoleAndTier();
          toast.success("Welcome back! Role and permissions verified.");
          navigate({ to: "/dashboard" });
        } else {
          throw new Error("No session returned upon sign in.");
        }
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      console.error(`${type} error:`, errorObj);
      const msg = errorObj.message || "Authentication failed. Please check your credentials.";
      setErrorDetails(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-primary/20 bg-card/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Plane className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">StickTime FPV</CardTitle>
          <CardDescription>Enter your credentials or use Google to access your logbook</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorDetails && (
            <div className="p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1 break-words">{errorDetails}</div>
            </div>
          )}

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

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-muted"></div>
            <span className="flex-shrink mx-4 text-xs uppercase text-muted-foreground">Or email</span>
            <div className="flex-grow border-t border-muted"></div>
          </div>

          <div className="space-y-2">
            <Input
              type="email"
              placeholder="pilot@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <Input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" onClick={() => handleAuth('signup')} disabled={loading}>
              {loading ? "Processing..." : "Sign Up"}
            </Button>
            <Button onClick={() => handleAuth('login')} disabled={loading}>
              {loading ? "Loading..." : "Sign In"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
