import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";

export interface ProfileWithEmail {
  id: string;
  role: string;
  tier: string;
  created_at: string;
  updated_at: string;
  email?: string;
}

export function AdminPilotsTable() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [selectedTier, setSelectedTier] = useState<string>("free");

  const { data: profiles, isLoading: profilesLoading, error: profilesError } = useQuery({
    queryKey: ["admin-profiles-with-emails"],
    queryFn: async () => {
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("id, role, tier, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (profilesErr) throw profilesErr;

      let emailMap: Record<string, string> = {};
      try {
        const { data: rpcEmails, error: rpcErr } = await supabase.rpc("admin_get_user_emails");
        if (!rpcErr && rpcEmails) {
          (rpcEmails as any[]).forEach((item) => {
            if (item.id && item.email) {
              emailMap[item.id] = item.email;
            }
          });
        }
      } catch (e) {
        console.warn("Could not fetch emails via RPC:", e);
      }

      const combined: ProfileWithEmail[] = (profilesData || []).map((p) => ({
        ...p,
        email: emailMap[p.id] || p.id,
      }));

      return combined;
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, role, tier }: { id: string; role: string; tier: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ role, tier, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles-with-emails"] });
      toast.success("Pilot profile updated successfully");
      setEditingId(null);
    },
    onError: (err: any) => {
      toast.error(`Failed to update profile: ${err.message}`);
    },
  });

  const handleStartEdit = (profile: ProfileWithEmail) => {
    setEditingId(profile.id);
    setSelectedRole(profile.role || "user");
    setSelectedTier(profile.tier || "free");
  };

  const handleSaveEdit = (id: string) => {
    updateProfileMutation.mutate({ id, role: selectedRole, tier: selectedTier });
  };

  return (
    <Card className="border-border bg-card/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono">
          <Users className="h-5 w-5 text-primary" /> Registered Pilot Directory & Role Management
        </CardTitle>
        <CardDescription>
          View pilot email identity, system roles, and subscription tiers. Click edit to modify roles and tiers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {profilesLoading ? (
          <div className="py-12 text-center text-muted-foreground">Syncing pilot database...</div>
        ) : profilesError ? (
          <div className="py-12 text-center text-destructive">
            Failed to load pilot profiles: {(profilesError as Error).message}
          </div>
        ) : profiles?.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No pilot profiles found in database.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-3 font-medium">Pilot (Email & ID)</th>
                  <th className="pb-3 font-medium">System Role</th>
                  <th className="pb-3 font-medium">Tier</th>
                  <th className="pb-3 font-medium">Created</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {profiles?.map((p) => {
                  const isEditing = editingId === p.id;
                  const roleValue = (p.role || "user").toLowerCase();
                  const tierValue = (p.tier || "free").toLowerCase();

                  return (
                    <tr key={p.id} className="group hover:bg-muted/30">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-foreground text-sm flex items-center gap-2">
                          {p.email && p.email !== p.id ? p.email : `Pilot (${p.id.slice(0, 8)}...)`}
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          UUID: {p.id}
                        </div>
                      </td>
                      <td className="py-3">
                        {isEditing ? (
                          <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger className="h-8 w-28 text-xs font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">user</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                              <SelectItem value="dev">dev</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={roleValue === "admin" || roleValue === "dev" ? "default" : "outline"}
                            className="font-mono text-[10px]"
                          >
                            {roleValue}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3">
                        {isEditing ? (
                          <Select value={selectedTier} onValueChange={setSelectedTier}>
                            <SelectTrigger className="h-8 w-32 text-xs font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">free</SelectItem>
                              <SelectItem value="pro">pro</SelectItem>
                              <SelectItem value="enterprise">enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={tierValue === "pro" || tierValue === "enterprise" || tierValue === "premium" ? "secondary" : "outline"}
                            className="font-mono text-[10px]"
                          >
                            {tierValue}
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground text-xs font-mono">
                        {p.created_at ? new Date(p.created_at.replace(" ", "T")).toLocaleDateString() : "N/A"}
                      </td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              onClick={() => handleSaveEdit(p.id)}
                              disabled={updateProfileMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1.5 font-mono"
                            onClick={() => handleStartEdit(p)}
                          >
                            <Edit2 className="h-3 w-3" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
