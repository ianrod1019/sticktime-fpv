/**
 * BatchPermissionBar — bulk actions for selected plain members.
 * Both actions are single atomic RPCs; server-side guards decide
 * owner-only role changes and refuse staff rows.
 */
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db_request } from "@/lib/db_request";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  type PermissionKey,
} from "@/components/squadron/permission-shared";

export function BatchPermissionBar({
  teamId,
  memberIds,
  onDone,
  disabled,
}: {
  teamId: string;
  memberIds: string[];
  onDone: () => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["squadron-permissions-roster", teamId],
    });

  const batchPermissions = useMutation({
    mutationFn: async (input: {
      permission: PermissionKey;
      granted: boolean;
    }) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "set_member_permissions_batch",
        rpcParams: {
          _team_id: teamId,
          _user_ids: memberIds,
          _permission: input.permission,
          _granted: input.granted,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Updated ${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`);
      onDone();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const batchRole = useMutation({
    mutationFn: async (newRole: "member" | "manager") => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "set_member_org_role_batch",
        rpcParams: {
          _team_id: teamId,
          _user_ids: memberIds,
          _new_role: newRole,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Updated ${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`);
      onDone();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = batchPermissions.isPending || batchRole.isPending;

  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        {memberIds.length} member{memberIds.length === 1 ? "" : "s"} selected
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Set role:</span>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => batchRole.mutate("manager")}
        >
          Manager
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || disabled}
          onClick={() => batchRole.mutate("member")}
        >
          Member
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {PERMISSION_KEYS.map((perm) => (
          <Label
            key={perm}
            title={PERMISSION_LABELS[perm].hint}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Switch
              onCheckedChange={(checked) =>
                batchPermissions.mutate({ permission: perm, granted: checked })
              }
              disabled={busy || disabled}
              aria-label={`Batch ${PERMISSION_LABELS[perm].short}`}
            />
            {PERMISSION_LABELS[perm].short}
          </Label>
        ))}
      </div>
    </div>
  );
}
