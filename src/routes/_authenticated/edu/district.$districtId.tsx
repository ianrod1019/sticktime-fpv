import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, School } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSchool,
  getDistrictOverview,
  type EduSchoolSummary,
} from "@/lib/edu";

export const Route = createFileRoute(
  "/_authenticated/edu/district/$districtId",
)({
  head: () => ({ meta: [{ title: `District Console — StickTime FPV` }] }),
  component: DistrictConsolePage,
});

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-white/[0.08] bg-zinc-950">
      <CardContent className="pt-6">
        <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-500">
          {label.toUpperCase()}
        </p>
        <p className="mt-1 font-display text-2xl font-semibold text-zinc-100">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function SchoolRow({ school }: { school: EduSchoolSummary }) {
  return (
    <Link
      to="/edu/school/$schoolId"
      params={{ schoolId: school.school_id }}
      className="block rounded-lg border border-white/[0.08] bg-zinc-950 px-4 py-3 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
          <School className="h-4 w-4 text-primary" />
          {school.name}
        </span>
        <span className="text-xs text-zinc-500">
          {school.students} students · {school.instructors} instructors ·{" "}
          {school.open_assignments} assignments
        </span>
      </div>
    </Link>
  );
}

function CreateSchoolForm({ districtId }: { districtId: string }) {
  const [name, setName] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      createSchool({
        districtId,
        name,
        ...(siteCode.trim() ? { siteCode: siteCode.trim() } : {}),
      }),
    onSuccess: () => {
      setName("");
      setSiteCode("");
      queryClient.invalidateQueries({
        queryKey: ["edu-district-overview", districtId],
      });
    },
  });

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) mutation.mutate();
      }}
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor="school-name">New school</Label>
        <Input
          id="school-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Frontier West High"
          maxLength={160}
        />
      </div>
      <div className="w-full sm:w-40">
        <Input
          value={siteCode}
          onChange={(e) => setSiteCode(e.target.value)}
          placeholder="Site code (optional)"
          maxLength={32}
        />
      </div>
      <Button type="submit" disabled={mutation.isPending || !name.trim()}>
        <Plus className="mr-1 h-4 w-4" /> Add school
      </Button>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

function DistrictConsolePage() {
  const { districtId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["edu-district-overview", districtId],
    queryFn: () => getDistrictOverview(districtId),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Loading district…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    );
  }
  if (!data) return null;

  return (
    <div>
      <Link
        to="/edu"
        className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3 w-3" /> Classroom
      </Link>
      <PageHeader
        title="District Console"
        subtitle="Aggregates only — this console never lists individual students. Every access to a student record is logged separately."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Schools" value={data.totals.schools} />
        <StatTile label="Students" value={data.totals.students} />
        <StatTile label="Instructors" value={data.totals.instructors} />
        <StatTile label="Assignments" value={data.totals.open_assignments} />
        <StatTile label="Pending" value={data.totals.pending_enrollments} />
        <StatTile label="Min (30d)" value={data.flight_minutes_30d} />
      </div>

      <div className="mb-8">
        <CreateSchoolForm districtId={districtId} />
      </div>

      <h2 className="mb-3 font-mono text-[9px] tracking-[0.2em] text-zinc-500">
        SCHOOLS
      </h2>
      <div className="space-y-2">
        {data.per_school.map((s) => (
          <SchoolRow key={s.school_id} school={s} />
        ))}
      </div>
    </div>
  );
}
