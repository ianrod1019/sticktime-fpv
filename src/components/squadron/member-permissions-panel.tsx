/**
 * MemberPermissionsPanel — roster + per-member switches + batch actions.
 *
 * Reads the roster through get_squadron_permissions (owner/manager only,
 * server-enforced). Every change flows through guarded RPCs; the client
 * never writes team_members directly:
 *   - set_member_permission          single switch toggle
 *   - assign_member_role             role-template assign / clear
 *   - set_member_permissions_batch   switch toggle for many (atomic, via bar)
 *   - set_member_org_role_batch      promote/demote (owner only, atomic)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db_request } from "@/lib/db_request";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BatchPermissionBar } from "@/components/squadron/batch-permission-bar";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type PermissionKey,
  type TeamRole,
} from "@/components/squadron/permission-shared";

interface RosterRow {
  member_id: string;
  display_name: string;
  team_role: string;
  role_id: string | null;
  role_name: string | null;
  can_edit_gear: boolean;
  can_view_analytics: boolean;
  can_view_ledger: boolean;
}

export function MemberPermissionsPanel({
  teamId,
  isOwner,
  roles,
}: {
  teamId: string;
  isOwner: boolean;
  roles: TeamRole[];
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: roster } = useQuery({
    queryKey: ["squadron-permissions-roster", teamId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db_request({
        mode: "rpc",
        rpcFunction: "get_squadron_permissions",
        rpcParams: { _team_id: teamId },
      });
      if (error) throw error;
      return (data ?? []) as RosterRow[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["squadron-permissions-roster", teamId],
    });

  const setPermission = useMutation({
    mutationFn: async (input: {
      memberId: string;
      permission: PermissionKey;
      granted: boolean;
    }) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "set_member_permission",
        rpcParams: {
          _team_id: teamId,
          _user_id: input.memberId,
          _permission: input.permission,
          _granted: input.granted,
        },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const assignRole = useMutation({
    mutationFn: async (input: { memberId: string; roleId: string | null }) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "assign_member_role",
        rpcParams: {
          _team_id: teamId,
          _user_id: input.memberId,
          _role_id: input.roleId,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member role updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSelected = (memberId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };

  const rosterRows = roster ?? [];
  const batchableIds = rosterRows
    .filter((m) => selected.has(m.member_id) && m.team_role === "member")
    .map((m) => m.member_id);
  const busy =
    setPermission.isPending || assignRole.isPending;

  return (
    <div>
      {rosterRows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Roster unavailable.</p>
      ) : (
        <div className="space-y-3">
          {rosterRows.map((m) => {
            const isStaff = m.team_role === "owner" || m.team_role === "manager";
            const selectable = m.team_role === "member";
            return (
              <div
                key={m.member_id}
                className="rounded-lg border border-border/50 bg-card/60 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {selectable && (
                      <Checkbox
                        checked={selected.has(m.member_id)}
                        onCheckedChange={(checked) =>
                          toggleSelected(m.member_id, checked === true)
                        }
                        aria-label={`Select ${m.display_name}`}
                      />
                    )}
                    <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {(m.display_name || "P").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.display_name}
                      </p>
                      <p className="text-[11px] capitalize text-muted-foreground">
                        {m.team_role}
                        {m.role_name ? ` · ${m.role_name}` : ""}
                      </p>
                    </div>
                  </div>
                  {isStaff ? (
                    <span className="text-[11px] uppercase tracking-wide text-primary font-semibold shrink-0">
                      Always on
                    </span>
                  ) : (
                    <Select
                      value={m.role_id ?? "none"}
                      onValueChange={(value) =>
                        assignRole.mutate({
                          memberId: m.member_id,
                          roleId: value === "none" ? null : value,
                        })
                      }
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 w-40 shrink-0">
                        <SelectValue placeholder="No role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No role</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {!isStaff && (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/40 pt-3">
                    {PERMISSION_KEYS.map((perm) => (
                      <Label
                        key={perm}
                        title={PERMISSION_LABELS[perm].hint}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <Switch
                          checked={m[perm]}
                          onCheckedChange={(checked) =>
                            setPermission.mutate({
                              memberId: m.member_id,
                              permission: perm,
                              granted: checked,
                            })
                          }
                          disabled={busy}
                          aria-label={`${PERMISSION_LABELS[perm].short} access for ${m.display_name}`}
                        />
                        {PERMISSION_LABELS[perm].short}
                      </Label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOwner && batchableIds.length > 0 && (
        <BatchPermissionBar
          teamId={teamId}
          memberIds={batchableIds}
          onDone={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
