import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, School, Users } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EDU_ROLE_LABEL, highestRole, type EduMembership } from "@/lib/edu";
import { useEduMemberships } from "./route";

export const Route = createFileRoute("/_authenticated/edu/")({
  head: () => ({ meta: [{ title: `Classroom — StickTime FPV` }] }),
  component: EduIndexPage,
});

function MembershipCard({ membership }: { membership: EduMembership }) {
  const isStaff = membership.edu_role !== "student";
  return (
    <Card className="border-white/[0.08] bg-zinc-950">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            {isStaff ? (
              <School className="h-4 w-4 text-primary" />
            ) : (
              <Users className="h-4 w-4 text-zinc-400" />
            )}
            {membership.school_name}
          </span>
          <Badge variant="secondary">
            {EDU_ROLE_LABEL[membership.edu_role]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-zinc-500">
        <p>{membership.district_name}</p>
        {isStaff && (
          <Link
            to="/edu/school/$schoolId"
            params={{ schoolId: membership.school_id }}
            className="mt-3 inline-block text-primary hover:underline"
          >
            Open roster →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function EduIndexPage() {
  const { data: memberships, isLoading, error } = useEduMemberships();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">{(error as Error).message}</p>
    );
  }

  const role = highestRole(memberships ?? []);
  const isDistrictAdmin = role === "district_admin";
  const district = (memberships ?? []).find(
    (m) => m.status === "active" && m.edu_role === "district_admin",
  );

  return (
    <div>
      <PageHeader
        title="Classroom"
        subtitle="Your institutional memberships. Flight data stays on your personal pages; staff views here are logged and audited."
        action={<GraduationCap className="h-8 w-8 text-zinc-700" />}
      />

      {isDistrictAdmin && district && (
        <Link
          to="/edu/district/$districtId"
          params={{ districtId: district.district_id }}
          className="mb-6 block rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary hover:bg-primary/10"
        >
          Open the {district.district_name} district console →
        </Link>
      )}

      {(memberships ?? []).filter((m) => m.status === "active").length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active institutional memberships.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(memberships ?? [])
            .filter((m) => m.status === "active")
            .map((m) => (
              <MembershipCard key={m.membership_id} membership={m} />
            ))}
        </div>
      )}
    </div>
  );
}
