import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProWall } from "@/components/auth/pro-wall";
import { BatteryHealthDashboard } from "@/components/gear-card/battery-health-dashboard";

export const Route = createFileRoute("/_authenticated/battery-health")({
  head: () => ({
    meta: [
      { title: "LiPo Health & IR Tracking — StickTime FPV" },
      { name: "description", content: "Voltage sag curve analytics, pack degradation alerts, and internal resistance monitoring over time." },
      { property: "og:title", content: "LiPo Health & IR Tracking — StickTime FPV" },
      {
        property: "og:description",
        content: "Voltage sag curve analytics, pack degradation alerts, and internal resistance monitoring over time.",
      },
    ],
  }),
  component: BatteryHealth,
});

function BatteryHealth() {
  const [loading, setLoading] = useState(true);
  const [showProWall, setShowProWall] = useState(false);
  const [packCount, setPackCount] = useState(0);
  const [gearIds, setGearIds] = useState<string[]>([]);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const { data: proAccessData } = await supabase.rpc("check_pro_access");
      if (!proAccessData) {
        setShowProWall(true);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: packs } = await supabase
            .from("battery_packs")
            .select("gear_id")
            .eq("user_id", user.id);
          
          if (packs && packs.length > 0) {
            const uniqueGearIds = [...new Set(packs.map((p) => p.gear_id))];
            setGearIds(uniqueGearIds);
            setPackCount(packs.length);
          }
        }
      }
    } catch (err) {
      console.error("Error checking access:", err);
      setShowProWall(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (showProWall) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <ProWall
          featureName="LiPo Health & IR Tracking"
          description="Voltage sag curve analytics, pack degradation alerts, and internal resistance monitoring over time."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {gearIds.map((gearId, idx) => (
        <BatteryHealthDashboard key={gearId} gearId={gearId} packCount={packCount} />
      ))}
    </div>
  );
}