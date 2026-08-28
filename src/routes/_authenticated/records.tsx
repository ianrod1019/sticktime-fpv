import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trophy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDateKey } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/records")({
  head: () => ({
    meta: [
      { title: "Personal records — StickTime FPV" },
      { name: "description", content: "Track your best lap times and scores per track or sim map." },
      { property: "og:title", content: "Personal records — StickTime FPV" },
      {
        property: "og:description",
        content: "Track your best lap times and scores per track or sim map.",
      },
    ],
  }),
  component: Records,
});

function Records() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [trackId, setTrackId] = useState("none");
  const [lap, setLap] = useState("");
  const [score, setScore] = useState("");
  const [achievedOn, setAchievedOn] = useState(toDateKey(new Date()));

  const { data } = useQuery({
    queryKey: ["records"],
    queryFn: async () => {
      const [records, tracks] = await Promise.all([
        supabase.from("personal_records").select("*").order("achieved_on", { ascending: false }),
        supabase.from("tracks").select("id,name,kind"),
      ]);
      return { records: records.data ?? [], tracks: tracks.data ?? [] };
    },
  });

  const records = data?.records ?? [];
  const tracks = data?.tracks ?? [];

  const addRecord = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("personal_records").insert({
        user_id: u.user!.id,
        label,
        track_id: trackId !== "none" ? trackId : null,
        lap_seconds: lap ? Number(lap) : null,
        score: score ? Number(score) : null,
        achieved_on: achievedOn,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PR logged. Nice one.");
      setOpen(false);
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
        subtitle="Best laps and scores, per track or simulator map."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" /> New PR
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log a personal record</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rlabel">Label</Label>
                  <Input id="rlabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Fastest 3-lap" />
                </div>
                <div className="space-y-2">
                  <Label>Track</Label>
                  <Select value={trackId} onValueChange={setTrackId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No track</SelectItem>
                      {tracks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="rlap">Lap time (s)</Label>
                    <Input id="rlap" type="number" step="0.01" value={lap} onChange={(e) => setLap(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rscore">Score</Label>
                    <Input id="rscore" type="number" step="0.01" value={score} onChange={(e) => setScore(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rdate">Achieved on</Label>
                  <Input id="rdate" type="date" value={achievedOn} onChange={(e) => setAchievedOn(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addRecord.mutate()} disabled={!label}>
                  Save PR
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {records.map((r) => (
          <div key={r.id} className="hud-panel p-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Trophy className="h-4 w-4 text-primary" />
                  {r.label}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{r.achieved_on}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(r.id)} aria-label="Delete record">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 font-display text-2xl font-bold">
              {r.lap_seconds ? `${Number(r.lap_seconds).toFixed(2)}s` : r.score ? Number(r.score) : "—"}
            </p>
            {r.track_id && (
              <Badge variant="outline" className="mt-2">
                {tracks.find((t) => t.id === r.track_id)?.name ?? "Track"}
              </Badge>
            )}
          </div>
        ))}
        {records.length === 0 && (
          <p className="text-sm text-muted-foreground">No records yet. Go set one.</p>
        )}
      </div>
    </>
  );
}
