import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Link2,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  EDU_ROLE_LABEL,
  EDU_ROLE_RANK,
  archiveMember,
  assignInstructor,
  listMyStudents,
  listSchoolRoster,
  queueEnrollment,
  reinstateMember,
  type EduRole,
  type EduRosterMember,
} from "@/lib/edu";
import { useEduMemberships } from "./route";

export const Route = createFileRoute("/_authenticated/edu/school/$schoolId")({
  head: () => ({ meta: [{ title: `School Roster — StickTime FPV` }] }),
  component: SchoolRosterPage,
});

function StaffActions({
  member,
  onArchive,
  onReinstate,
}: {
  member: EduRosterMember;
  onArchive: (m: EduRosterMember) => void;
  onReinstate: (m: EduRosterMember) => void;
}) {
  if (member.status === "active") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onArchive(member)}
        title="Archive: keep the record, end access"
      >
        <Archive className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onReinstate(member)}
      title="Reinstate membership"
    >
      <ArchiveRestore className="h-4 w-4" />
    </Button>
  );
}

function RosterTable({
  roster,
  canArchive,
  onArchive,
  onReinstate,
}: {
  roster: EduRosterMember[];
  canArchive: boolean;
  onArchive: (m: EduRosterMember) => void;
  onReinstate: (m: EduRosterMember) => void;
}) {
  const sorted = [...roster].sort(
    (a, b) =>
      EDU_ROLE_RANK[a.edu_role] - EDU_ROLE_RANK[b.edu_role] ||
      a.callsign.localeCompare(b.callsign),
  );
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08]">
      <table className="w-full text-sm">
        <thead className="bg-zinc-950 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-zinc-500">
          <tr>
            <th className="px-4 py-2">Member</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2 w-16" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => (
            <tr key={m.membership_id} className="border-t border-white/[0.06]">
              <td className="px-4 py-2">
                {m.edu_role === "student" ? (
                  <Link
                    to="/edu/student/$userId"
                    params={{ userId: m.user_id }}
                    className="text-primary hover:underline"
                  >
                    {m.callsign}
                  </Link>
                ) : (
                  <span className="text-zinc-100">{m.callsign}</span>
                )}
              </td>
              <td className="px-4 py-2 text-zinc-400">
                {EDU_ROLE_LABEL[m.edu_role]}
              </td>
              <td className="px-4 py-2">
                <Badge
                  variant={m.status === "active" ? "secondary" : "outline"}
                >
                  {m.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right">
                {canArchive && (
                  <StaffActions
                    member={m}
                    onArchive={onArchive}
                    onReinstate={onReinstate}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnrollForm({ schoolId }: { schoolId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      queueEnrollment({
        schoolId,
        schoolEmail: email,
        eduRole: role as EduRole,
      }),
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["edu-memberships"] });
    },
  });

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) mutation.mutate();
      }}
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor="enroll-email">
          School-issued email (no invite email is sent)
        </Label>
        <Input
          id="enroll-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@school.edu"
        />
      </div>
      <div className="w-full sm:w-40">
        <Label htmlFor="enroll-role">Role</Label>
        <select
          id="enroll-role"
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="student">Student</option>
          <option value="instructor">Instructor</option>
          <option value="school_admin">School Admin</option>
        </select>
      </div>
      <Button type="submit" disabled={mutation.isPending || !email.trim()}>
        <UserPlus className="mr-1 h-4 w-4" /> Queue
      </Button>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

interface PendingEntry {
  id: string;
  school_email: string;
  edu_role: EduRole;
  created_at: string;
}

/**
 * The school's pending roster queue. "Provision" runs the edge function:
 * it matches the email to an existing account or silently creates one
 * (no invite email is sent), then links the membership.
 */
function PendingQueue({ schoolId }: { schoolId: string }) {
  const queryClient = useQueryClient();
  const { data: pending, error } = useQuery({
    queryKey: ["edu-pending-roster", schoolId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .schema("edu")
        .from("pending_roster")
        .select("id, school_email, edu_role, created_at")
        .eq("school_id", schoolId)
        .order("created_at");
      if (qErr) throw qErr;
      return (data ?? []) as PendingEntry[];
    },
  });

  const provisionMut = useMutation({
    mutationFn: async (entry: PendingEntry) => {
      const { error: fnError } = await supabase.functions.invoke(
        "edu-provision-member",
        { body: { schoolId, email: entry.school_email } },
      );
      if (fnError) throw fnError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["edu-pending-roster", schoolId],
      });
      queryClient.invalidateQueries({
        queryKey: ["edu-school-roster", schoolId],
      });
    },
  });

  if (error) return null;
  const entries = pending ?? [];
  if (entries.length === 0) return null;

  return (
    <Card className="mb-8 border-white/[0.08] bg-zinc-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Pending enrollments (provision silently — no emails sent)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-white/[0.06]">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-zinc-300">{entry.school_email}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline">{entry.edu_role}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={provisionMut.isPending}
                  onClick={() => provisionMut.mutate(entry)}
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" /> Provision
                </Button>
              </span>
            </li>
          ))}
        </ul>
        {provisionMut.isError && (
          <p className="mt-2 text-xs text-destructive">
            {(provisionMut.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Pair an instructor with a student — district/school admins only. */
function AssignForm({
  schoolId,
  roster,
}: {
  schoolId: string;
  roster: EduRosterMember[];
}) {
  const queryClient = useQueryClient();
  const instructors = roster.filter(
    (m) => m.edu_role === "instructor" && m.status === "active",
  );
  const students = roster.filter(
    (m) => m.edu_role === "student" && m.status === "active",
  );
  const [instructorId, setInstructorId] = useState("");
  const [studentId, setStudentId] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      assignInstructor({
        schoolId,
        instructorUserId: instructorId,
        studentUserId: studentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["edu-my-students", schoolId],
      });
    },
  });

  if (instructors.length === 0 || students.length === 0) return null;

  return (
    <form
      className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (instructorId && studentId) mutation.mutate();
      }}
    >
      <div className="flex-1 space-y-1">
        <Label htmlFor="assign-instructor">Instructor</Label>
        <select
          id="assign-instructor"
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={instructorId}
          onChange={(e) => setInstructorId(e.target.value)}
        >
          <option value="">Select instructor…</option>
          {instructors.map((m) => (
            <option key={m.membership_id} value={m.user_id}>
              {m.callsign}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 space-y-1">
        <Label htmlFor="assign-student">Student</Label>
        <select
          id="assign-student"
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">Select student…</option>
          {students.map((m) => (
            <option key={m.membership_id} value={m.user_id}>
              {m.callsign}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="submit"
        disabled={!instructorId || !studentId || mutation.isPending}
      >
        <Link2 className="mr-1 h-4 w-4" /> Assign
      </Button>
      {mutation.isError && (
        <p className="text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

function SchoolRosterPage() {
  const { schoolId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: memberships } = useEduMemberships();

  const membership = (memberships ?? []).find(
    (m) => m.school_id === schoolId && m.status === "active",
  );
  const role = membership?.edu_role;
  const canArchive = role === "district_admin";
  const isInstructor = role === "instructor";
  const isStaff = role === "school_admin" || role === "district_admin";

  const { data: roster, error: rosterError } = useQuery({
    queryKey: ["edu-school-roster", schoolId],
    queryFn: () => listSchoolRoster(schoolId),
    enabled: !!isStaff,
  });

  const { data: students, error: studentsError } = useQuery({
    queryKey: ["edu-my-students", schoolId],
    queryFn: () => listMyStudents(schoolId),
    enabled: isInstructor,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["edu-school-roster", schoolId],
    });
    queryClient.invalidateQueries({ queryKey: ["edu-my-students", schoolId] });
    queryClient.invalidateQueries({ queryKey: ["edu-memberships"] });
  };

  const archiveMut = useMutation({
    mutationFn: (m: EduRosterMember) => archiveMember(m.membership_id),
    onSuccess: invalidate,
  });
  const reinstateMut = useMutation({
    mutationFn: (m: EduRosterMember) => reinstateMember(m.membership_id),
    onSuccess: invalidate,
  });

  return (
    <div>
      <Link
        to="/edu"
        className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-3 w-3" /> Classroom
      </Link>
      <PageHeader
        title="School Roster"
        subtitle="Staff views here are written to the audit trail. Instructors see only the students assigned to them."
      />

      {isStaff && (
        <div className="mb-8">
          <EnrollForm schoolId={schoolId} />
        </div>
      )}

      {isStaff && <PendingQueue schoolId={schoolId} />}

      {isInstructor && students && (
        <Card className="mb-8 border-white/[0.08] bg-zinc-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My students</CardTitle>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No students assigned yet. Ask your school admin to assign you.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {students.map((s) => (
                  <li key={s.membership_id} className="py-2">
                    <Link
                      to="/edu/student/$userId"
                      params={{ userId: s.user_id }}
                      className="text-primary hover:underline"
                    >
                      {s.callsign}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {studentsError && (
              <p className="text-xs text-destructive">
                {(studentsError as Error).message}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isStaff && (
        <>
          <h2 className="mb-3 font-mono text-[9px] tracking-[0.2em] text-zinc-500">
            ROSTER
          </h2>
          {rosterError ? (
            <p className="text-sm text-destructive">
              {(rosterError as Error).message}
            </p>
          ) : (
            <>
              <AssignForm schoolId={schoolId} roster={roster ?? []} />
              <RosterTable
                roster={roster ?? []}
                canArchive={canArchive}
                onArchive={(m) => archiveMut.mutate(m)}
                onReinstate={(m) => reinstateMut.mutate(m)}
              />
            </>
          )}
        </>
      )}

      {!isStaff && !isInstructor && (
        <p className="text-sm text-zinc-500">
          Students log flights from the{" "}
          <Link to="/log" className="text-primary hover:underline">
            logbook
          </Link>{" "}
          — this page is for staff.
        </p>
      )}
    </div>
  );
}
