import { useEffect, useState } from "react";
import { Lock, Crown, AlertTriangle, Shield, TrendingDown, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { db_request } from "@/lib/db_request";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

type ProWallProps = {
  children?: React.ReactNode;
  featureName: string;
  description?: string;
  allowAdminOverride?: boolean;
  fallbackPath?: string;
};

export function ProWall({ children, featureName, description, allowAdminOverride = true, fallbackPath }: ProWallProps) {
  const [hasProAccess, setHasProAccess] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userTier, setUserTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkProAccess();
  }, []);

  const checkProAccess = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setHasProAccess(false);
        setLoading(false);
        return;
      }

      // Get user's profile info
      const { data: profile } = await db_request({
        mode: "query",
        table: "profiles",
        operation: "select",
        selectColumns: "role, tier",
        filters: { id: user.id },
      });

      if (profile) {
        setUserRole(profile.role as AppRole);
        setUserTier(profile.tier);
      }

      // Check pro access using RPC function
      const { data: proAccessData, error } = await supabase
        .rpc("check_pro_access");

      if (error) {
        console.error("Error checking pro access:", error);
        setHasProAccess(false);
      } else {
        setHasProAccess(proAccessData as boolean);
      }
    } catch (err) {
      console.error("Error in pro access check:", err);
      setHasProAccess(false);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = allowAdminOverride && userRole === "admin";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        <span className="ml-2 text-xs text-muted-foreground">Checking pro access...</span>
      </div>
    );
  }

  if (hasProAccess || isAdmin) {
    return <>{children}</>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card className="bg-card/50 border-primary/20 border-dashed">
        <CardContent className="p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 border border-primary/30">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          
          <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center justify-center gap-2">
            {featureName}
          </h3>
          
          <p className="text-sm text-muted-foreground mb-6">
            {description || "This feature requires a Pro subscription. Upgrade to access advanced LiPo health analytics, voltage sag curve tracking, and internal resistance monitoring over time."}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/10">
              {isAdmin ? <Crown className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
              Current: {userTier || "Free"} {isAdmin ? `(Admin)` : ""}
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Required: Pro tier
            </Badge>
          </div>

          <div className="bg-secondary/20 border border-secondary/30 rounded-lg p-4 text-left text-xs space-y-2">
            <div className="font-medium text-foreground/80 mb-2">Pro features include:</div>
            <div className="space-y-1 text-muted-foreground">
              <div className="flex items-start gap-2">
                <Zap className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                <span>Real-time voltage sag curve analytics</span>
              </div>
              <div className="flex items-start gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                <span>Pack degradation alerts and health scoring</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                <span>Internal resistance (IR) tracking and trending</span>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 text-success mt-0.5 flex-shrink-0" />
                <span>Historical data analysis across multiple flight sessions</span>
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 p-3 bg-success/10 border border-success/30 rounded-lg">
              <p className="text-xs text-success">
                <Crown className="h-3.5 w-3.5 inline mr-1" /> 
                As an admin, you have access to all pro features including LiPo Health & IR Tracking.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}