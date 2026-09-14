import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Backpack, Clock, Plane, Signal } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentRecord } from "@/lib/edu";

export const Route = createFileRoute("/_authenticated/edu/student/$userId")({
  head: () => ({ meta: [{ title: `Student Record — StickTime FPV` }] }),
  component: StudentRecordPage,
});

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="border-white/[0.08] bg-zinc-950">
      <CardContent className="flex items-center gap-3 pt-6">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-500">
            {label.toUpperCase()}
          </p>
          <p className="font-display text-xl font-semibold text-zinc-100">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentRecordPage() {
  const { userId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["edu-student-record", userId],
    queryFn: () => getStudentRecord(userId),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Loading record…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    );
  }
  if (!data) return null;

  const stats = data.flight_stats;
  const fmt = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;

  return (
    <div>
      <Link
        to="/edu"
        className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3 w-3" /> Classroom
      </Link>
      <PageHeader
        title={data.callsign}
        subtitle="Educational record. This access — your role and the relationship that authorized it — has been written to the audit trail."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Clock} label="Sessions" value={stats.session_count} />
        <StatTile
          icon={Plane}
          label="Sim time"
          value={fmt(stats.sim_minutes)}
        />
        <StatTile
          icon={Signal}
          label="Real time"
          value={fmt(stats.real_minutes)}
        />
        <StatTile
          icon={Backpack}
          label="Open checkouts"
          value={data.open_checkouts.length}
        />
      </div>

      <h2 className="mb-3 font-mono text-[9px] tracking-[0.2em] text-zinc-500">
        RECENT SESSIONS
      </h2>
      {data.recent_sessions.length === 0 ? (
        <p className="text-sm text-zinc-500">No sessions logged yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Minutes</th>
                <th className="px-4 py-2">Sim / notes</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_sessions.map((s) => (
                <tr key={s.id} className="border-t border-white/[0.06]">
                  <td className="px-4 py-2 text-zinc-300">{s.flown_on}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        s.session_type === "sim" ? "secondary" : "outline"
                      }
                    >
                      {s.session_type}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-zinc-300">
                    {s.duration_minutes}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {s.sim_platform ??
                      `${s.packs_flown} packs · ${s.crashes} crashes`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
