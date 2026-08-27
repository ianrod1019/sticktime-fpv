import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trophy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({ meta: [{ title: "Records — StickTime FPV" }] }),
  component: Records,
});
function Records() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [lap, setLap] = useState("");
  const [score, setScore] = useState("");
  const { data } = useQuery({
    queryKey: ["records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personal_records")
        .select("*")
        .order("achieved_on", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("personal_records")
        .insert({
          user_id: user.user.id,
          label,
          lap_seconds: lap ? Number(lap) : null,
          score: score ? Number(score) : null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Personal record saved");
      setLabel("");
      setLap("");
      setScore("");
      queryClient.invalidateQueries({ queryKey: ["records"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("personal_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["records"] }),
  });
  return (
    <>
      <PageHeader
        title="Personal records"
        subtitle="Keep your fastest laps and highest scores attached to the layouts that matter."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="hud-panel p-5">
          <span className="label-mono">Log a PR</span>
          <div className="mt-4 space-y-3">
            <Label htmlFor="pr-label">Track or map</Label>
            <Input
              id="pr-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bando sprint"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label="Lap seconds"
                type="number"
                step="0.01"
                placeholder="Lap seconds"
                value={lap}
                onChange={(e) => setLap(e.target.value)}
              />
              <Input
                aria-label="Score"
                type="number"
                placeholder="Score"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </div>
            <Button disabled={!label || save.isPending} onClick={() => save.mutate()}>
              Save record
            </Button>
          </div>
        </section>
        <section className="hud-panel divide-y divide-border lg:col-span-2">
          {(data ?? []).map((record) => (
            <div key={record.id} className="flex items-center gap-4 p-4">
              <Trophy className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{record.label}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {record.lap_seconds != null && (
                    <Badge variant="secondary">{record.lap_seconds}s lap</Badge>
                  )}
                  {record.score != null && <Badge variant="outline">{record.score} score</Badge>}
                  <span className="text-xs text-muted-foreground">{record.achieved_on}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete personal record"
                onClick={() => remove.mutate(record.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!data?.length && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No records yet. Make the next one count.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
