import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bell, Send, Radio, Megaphone, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  target_tier: string;
  target_user_id: string | null;
  created_at: string;
}

export function BroadcastNotificationsView() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetTier, setTargetTier] = useState("all");

  const { data: notifications, isLoading } = useQuery({
    queryKey: ["admin-broadcast-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as NotificationItem[];
    },
  });

  const sendBroadcastMutation = useMutation({
    mutationFn: async ({ title, message, targetTier }: { title: string; message: string; targetTier: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { error } = await supabase.from("notifications").insert({
        title,
        message,
        target_tier: targetTier,
        sender_id: userData.user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-broadcast-notifications"] });
      toast.success("Broadcast push notification sent successfully!", {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      });
      setTitle("");
      setMessage("");
      setTargetTier("all");
    },
    onError: (err: any) => {
      toast.error(`Failed to broadcast notification: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error("Please provide both a title and a message.");
      return;
    }
    sendBroadcastMutation.mutate({ title, message, targetTier });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Compose Notification Card */}
      <Card className="border-border bg-card/60 lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base font-mono flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Broadcast Push Alert
          </CardTitle>
          <CardDescription>
            Dispatch critical safety bulletins, firmware patch notes, or tier-specific announcements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Target Audience / Tier</label>
              <Select value={targetTier} onValueChange={setTargetTier}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All Pilots (Global Broadcast)</SelectItem>
                  <SelectItem value="free">📦 Free Tier Pilots</SelectItem>
                  <SelectItem value="pro">⚡ Pro Tier Pilots</SelectItem>
                  <SelectItem value="enterprise">🏢 Enterprise Tier Pilots</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Notification Title</label>
              <Input
                placeholder="e.g. Critical Firmware Safety Advisory"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Message Body</label>
              <Textarea
                placeholder="Enter alert details, maintenance schedule, or safety instructions..."
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full gap-2 font-mono"
              disabled={sendBroadcastMutation.isPending}
            >
              <Send className="h-4 w-4" />
              {sendBroadcastMutation.isPending ? "Broadcasting..." : "Dispatch Broadcast Push"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Broadcast History & Stream */}
      <Card className="border-border bg-card/60 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base font-mono flex items-center gap-2">
            <Radio className="h-5 w-5 text-secondary" /> Dispatched Broadcast History
          </CardTitle>
          <CardDescription>
            Active feed of alerts sent to pilots across the FPV telemetry network.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading broadcast history...</div>
          ) : notifications?.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Bell className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm">No broadcast alerts sent yet.</span>
            </div>
          ) : (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {notifications?.map((item) => {
                const tier = item.target_tier || "all";
                return (
                  <div key={item.id} className="p-4 rounded-lg bg-muted/40 border border-border/60 space-y-2 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={tier === "all" ? "default" : "secondary"}
                          className="font-mono text-[10px] uppercase tracking-wider"
                        >
                          Target: {tier}
                        </Badge>
                        <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {item.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
