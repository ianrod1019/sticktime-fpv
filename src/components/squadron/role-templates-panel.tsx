/**
 * RoleTemplatesPanel — squadron-defined reusable permission templates
 * ("student", "coach", …). CRUD flows through the guarded RPCs
 * create_team_role / delete_team_role (owner/manager enforced
 * server-side); the client never writes team_roles directly.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db_request } from "@/lib/db_request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  PERMISSION_LABELS,
  type PermissionKey,
  type TeamRole,
} from "@/components/squadron/permission-shared";

const PERMISSION_FIELDS: Array<[PermissionKey, string]> = [
  ["can_edit_gear", "Gear"],
  ["can_view_analytics", "Analytics"],
  ["can_view_ledger", "Ledger"],
];

interface NewRoleForm {
  name: string;
  can_edit_gear: boolean;
  can_view_analytics: boolean;
  can_view_ledger: boolean;
}

const EMPTY_ROLE: NewRoleForm = {
  name: "",
  can_edit_gear: false,
  can_view_analytics: false,
  can_view_ledger: false,
};

export function RoleTemplatesPanel({
  teamId,
  roles,
  onRolesChanged,
}: {
  teamId: string;
  roles: TeamRole[];
  onRolesChanged: () => void;
}) {
  const [newRole, setNewRole] = useState<NewRoleForm>(EMPTY_ROLE);

  const createRole = useMutation({
    mutationFn: async (input: NewRoleForm) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "create_team_role",
        rpcParams: {
          _team_id: teamId,
          _name: input.name,
          _can_edit_gear: input.can_edit_gear,
          _can_view_analytics: input.can_view_analytics,
          _can_view_ledger: input.can_view_ledger,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role created");
      setNewRole(EMPTY_ROLE);
      onRolesChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await db_request({
        mode: "rpc",
        rpcFunction: "delete_team_role",
        rpcParams: { _team_id: teamId, _role_id: roleId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role deleted");
      onRolesChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Role templates
      </p>
      {roles.length > 0 && (
        <div className="space-y-2 mb-3">
          {roles.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/60 px-4 py-2.5"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {r.name}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {(
                    [
                      r.can_edit_gear && "gear",
                      r.can_view_analytics && "analytics",
                      r.can_view_ledger && "ledger",
                    ].filter(Boolean) as string[]
                  ).join(" · ") || "no permissions"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:text-destructive shrink-0"
                onClick={() => deleteRole.mutate(r.id)}
                disabled={deleteRole.isPending}
                aria-label={`Delete role ${r.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newRole.name}
          onChange={(e) => setNewRole((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="New role name (e.g. coach)"
          className="h-9 w-56"
          maxLength={40}
        />
        {PERMISSION_FIELDS.map(([key, label]) => (
          <Label
            key={key}
            title={PERMISSION_LABELS[key].hint}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Switch
              checked={newRole[key]}
              onCheckedChange={(checked) =>
                setNewRole((prev) => ({ ...prev, [key]: checked }))
              }
              aria-label={`${label} for new role`}
            />
            {label}
          </Label>
        ))}
        <Button
          size="sm"
          className="h-9"
          onClick={() => {
            const name = newRole.name.trim();
            if (name.length < 2) {
              toast.error("Role name must be at least 2 characters");
              return;
            }
            createRole.mutate({ ...newRole, name });
          }}
          disabled={createRole.isPending || newRole.name.trim().length < 2}
        >
          <Plus className="h-4 w-4" /> Create role
        </Button>
      </div>
    </div>
  );
}
