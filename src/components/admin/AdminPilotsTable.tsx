import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Edit2, Check, X, Search, ShieldAlert, ShieldCheck, Shield, Lock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { BanPilotModal } from "./BanPilotModal";

export interface ProfileWithEmail {
  id: string;
  callsign?: string;
  subscription_tier: string;
  role?: string;
  created_at: string;
  email?: string;
  display_name?: string;
  is_banned?: boolean;
  ban_reason?: string;
  ban_until?: string | null;
}

export function AdminPilotsTable() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("free");
  const [selectedRole, setSelectedRole] = useState<string>("user");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Modal state for banning pilot
  const [selectedPilotToBan, setSelectedPilotToBan] = useState<ProfileWithEmail | null>(null);

  // Get current user id to prevent self-role editing
  useQuery({
    queryKey: ["current-auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.id) {
        setCurrentUserId(data.user.id);
        return data.user.id;
      }
      return null;
    },
  });

  const { data: profiles, isLoading: profilesErrorLoading, error: profilesError } = useQuery({
    queryKey: ["admin-profiles-with-emails-correct-schema-v8"],
    queryFn: async () => {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc("admin_get_admin_directory");
        if (!rpcErr && rpcData) {
          return (rpcData as any[]).map((item) => ({
            id: item.id,
            email: item.email || `pilot_${item.id.slice(0, 6)}@fpv.internal`,
            display_name: item.display_name || item.callsign || item.email?.split("@")[0] || "Pilot",
            callsign: item.callsign || "",
            subscription_tier: item.tier || item.subscription_tier || "free",
            role: item.role || "user",
            created_at: item.created_at || new Date().toISOString(),
            is_banned: !!item.is_banned,
            ban_reason: item.ban_reason || "",
            ban_until: item.ban_until || null,
          })) as ProfileWithEmail[];
        }
      } catch (e) {
        console.warn("admin_get_admin_directory RPC fallback:", e);
      }

      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (profilesErr) throw profilesErr;

      let emailMap: Record<string, string> = {};
      try {
        const { data: rpcEmails } = await supabase.rpc("admin_get_user_emails");
        if (rpcEmails) {
          (rpcEmails as any[]).forEach((item) => {
            if (item.id && item.email) {
              emailMap[item.id] = item.email;
            }
          });
        }
      } catch (err) {
        console.warn("Could not fetch emails via RPC:", err);
      }

      const combined: ProfileWithEmail[] = (profilesData || []).map((p: any) => {
        const userId = p.id || p.uuid;
        const userEmail = emailMap[userId] || `pilot_${(userId || "").slice(0, 6)}@fpv.internal`;
        const callsign = p.callsign || userEmail.split("@")[0];
        return {
          id: userId,
          email: userEmail,
          display_name: callsign,
          callsign: p.callsign || "",
          subscription_tier: p.tier || p.subscription_tier || "free",
          role: p.role || "user",
          created_at: p.created_at || new Date().toISOString(),
          is_banned: !!p.is_banned,
          ban_reason: p.ban_reason || "",
          ban_until: p.ban_until || null,
        };
      });

      return combined;
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, subscription_tier, role }: { id: string; subscription_tier: string; role: string }) => {
      if (currentUserId && id === currentUserId) {
        throw new Error("Security policy violation: You cannot edit your own role or subscription tier.");
      }

      const updatePayload = {
        tier: subscription_tier,
        subscription_tier,
        role,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", id);

      if (error) {
        const { error: err2 } = await supabase
          .from("profiles")
          .update(updatePayload)
          .eq("uuid", id);
        if (err2) throw err2;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("admin_audit_logs").insert({
          actor_id: userData.user.id,
          action: "update_pilot_profile_and_role",
          target_id: id,
          payload: { subscription_tier, role },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles-with-emails-correct-schema-v8"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs-list"] });
      toast.success("Pilot tier & role updated & logged successfully");
      setEditingId(null);
    },
    onError: (err: any) => {
      toast.error(`Failed to update profile: ${err.message}`);
    },
  });

  const toggleBanMutation = useMutation({
    mutationFn: async ({ p, is_banned, ban_reason, ban_until }: { p: ProfileWithEmail; is_banned: boolean; ban_reason?: string; ban_until?: string | null }) => {
      if (currentUserId && p.id === currentUserId) {
        throw new Error("Security policy violation: You cannot ban yourself.");
      }

      const roleLower = (p.role || "").toLowerCase();
      if (is_banned && (roleLower === "admin" || roleLower === "dev")) {
        throw new Error("Security policy violation: Administrators and developers cannot be banned.");
      }

      const updatePayload: any = {
        is_banned,
        ban_reason: is_banned ? (ban_reason || "Violation of community safety guidelines") : null,
        banned_at: is_banned ? new Date().toISOString() : null,
        ban_until: is_banned ? (ban_until || null) : null,
      };

      const { error } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", p.id);

      if (error) {
        const { error: err2 } = await supabase
          .from("profiles")
          .update(updatePayload)
          .eq("uuid", p.id);
        if (err2) throw err2;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from("admin_audit_logs").insert({
          actor_id: userData.user.id,
          action: is_banned ? "ban_pilot" : "unban_pilot",
          target_id: p.id,
          payload: updatePayload,
        });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles-with-emails-correct-schema-v8"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs-list"] });
      setSelectedPilotToBan(null);
      toast.success(variables.is_banned ? "Pilot has been banned successfully" : "Pilot has been unbanned successfully");
    },
    onError: (err: any) => {
      toast.error(`Failed to update ban status: ${err.message}`);
    },
  });

  const handleStartEdit = (profile: ProfileWithEmail) => {
    if (currentUserId && profile.id === currentUserId) {
      toast.error("Safety guardrail: You cannot edit your own role or subscription tier.");
      return;
    }
    setEditingId(profile.id);
    setSelectedTier(profile.subscription_tier || "free");
    setSelectedRole(profile.role || "user");
  };

  const handleSaveEdit = (id: string) => {
    if (currentUserId && id === currentUserId) {
      toast.error("Safety guardrail: You cannot edit your own role.");
      return;
    }
    updateProfileMutation.mutate({ id, subscription_tier: selectedTier, role: selectedRole });
  };

  const handleOpenBanModal = (p: ProfileWithEmail) => {
    if (currentUserId && p.id === currentUserId) {
      toast.error("Safety guardrail: You cannot ban yourself.");
      return;
    }

    const roleLower = (p.role || "").toLowerCase();
    if (!p.is_banned && (roleLower === "admin" || roleLower === "dev")) {
      toast.error("Safety guardrail: Administrators and developers cannot be banned.");
      return;
    }

    if (!p.is_banned) {
      setSelectedPilotToBan(p);
    } else {
      if (window.confirm(`Are you sure you want to unban pilot ${p.email}?`)) {
        toggleBanMutation.mutate({ p, is_banned: false });
      }
    }
  };

  const handleConfirmBanFromModal = (pilot: ProfileWithEmail, reason: string, banUntil: string | null) => {
    toggleBanMutation.mutate({ p: pilot, is_banned: true, ban_reason: reason, ban_until: banUntil });
  };

  const filteredProfiles = (profiles || []).filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.display_name && p.display_name.toLowerCase().includes(q)) ||
      (p.callsign && p.callsign.toLowerCase().includes(q)) ||
      p.id.toLowerCase().includes(q) ||
      (p.subscription_tier && p.subscription_tier.toLowerCase().includes(q)) ||
      (p.role && p.role.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Card className="border-border bg-card/65 shadow-lg">
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 font-mono">
                <Users className="h-5 w-5 text-primary" /> Pilot Directory & Role Management
              </CardTitle>
              <CardDescription>
                Manage pilot roles (User, Admin, Dev) and subscription tiers. Banning opens a secure modal requiring a mandatory reason and duration.
              </CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search loaded pilots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profilesErrorLoading ? (
            <div className="py-12 text-center text-muted-foreground font-mono">Syncing secure pilot directory & auth users...</div>
          ) : profilesError ? (
            <div className="py-12 text-center text-destructive">
              Failed to load pilot profiles: {(profilesError as Error).message}
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No pilot profiles match your search.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-3 font-medium">Pilot Identity (Email)</th>
                    <th className="pb-3 font-medium">Role & Callsign</th>
                    <th className="pb-3 font-medium">Subscription Tier</th>
                    <th className="pb-3 font-medium">Status & Admin Ban Reason</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredProfiles.map((p) => {
                    const isEditing = editingId === p.id;
                    const tierValue = (p.subscription_tier || "free").toLowerCase();
                    const roleLower = (p.role || "user").toLowerCase();
                    const isAdminOrDev = roleLower === "admin" || roleLower === "dev";
                    const isSelf = currentUserId === p.id;

                    return (
                      <tr key={p.id} className="group hover:bg-muted/30">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground text-sm flex items-center gap-2">
                            {p.email}
                            {isSelf && (
                              <Badge variant="outline" className="text-[9px] font-mono border-primary/40 text-primary bg-primary/5">
                                YOU
                              </Badge>
                            )}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                            ID: {p.id}
                          </div>
                        </td>
                        <td className="py-3">
                          {isEditing ? (
                            <Select value={selectedRole} onValueChange={setSelectedRole}>
                              <SelectTrigger className="h-8 w-32 text-xs font-mono">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">user</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                                <SelectItem value="dev">dev</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-foreground text-xs font-mono">
                                {p.callsign ? `@${p.callsign}` : p.display_name || "Pilot"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {isAdminOrDev ? (
                                  <Badge variant="default" className="font-mono text-[9px] gap-1 bg-warning/20 text-warning border-warning/40 w-fit">
                                    <Shield className="h-2.5 w-2.5" /> {roleLower.toUpperCase()}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground w-fit">
                                    {roleLower}
                                  </Badge>
                                )}
                              </div>
                            </div>
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
                                <SelectItem value="elite">elite</SelectItem>
                                <SelectItem value="enterprise">enterprise</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              variant={tierValue === "pro" || tierValue === "elite" || tierValue === "enterprise" ? "default" : "outline"}
                              className="font-mono text-[10px]"
                            >
                              {tierValue}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3">
                          {p.is_banned ? (
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive" className="font-mono text-[10px] gap-1 w-fit">
                                  <ShieldAlert className="h-3 w-3" /> Banned
                                </Badge>
{p.ban_until && (
                  <Badge variant="outline" className="font-mono text-[9px] text-warning border-warning/40 gap-1">
                                    <Calendar className="h-2.5 w-2.5" /> Until {new Date(p.ban_until).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-warning bg-primary/10 px-2 py-1 rounded border border-primary/10">
                                <Lock className="h-3 w-3 shrink-0 text-warning" />
                                <span className="truncate" title={`Admin-Only Ban Reason: ${p.ban_reason}`}>
                                  <b>Reason:</b> {p.ban_reason || "No reason specified"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="font-mono text-[10px] gap-1 text-success bg-success/10 border-success/30">
                              <ShieldCheck className="h-3 w-3" /> Active
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-success hover:text-success/80 hover:bg-success/10"
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
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`h-8 text-xs gap-1 font-mono ${isSelf ? "opacity-50 cursor-not-allowed" : ""}`}
                                  onClick={() => handleStartEdit(p)}
                                  disabled={isSelf}
                                  title={isSelf ? "You cannot edit your own role or tier" : "Edit Role & Tier"}
                                >
                                  <Edit2 className="h-3 w-3" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant={p.is_banned ? "outline" : "destructive"}
                                  className={`h-8 text-xs gap-1 font-mono ${(isAdminOrDev && !p.is_banned) || isSelf ? "opacity-50 cursor-not-allowed" : ""}`}
                                  onClick={() => handleOpenBanModal(p)}
                                  disabled={toggleBanMutation.isPending || (isAdminOrDev && !p.is_banned) || isSelf}
                                  title={isSelf ? "You cannot ban yourself" : isAdminOrDev && !p.is_banned ? "Administrators and developers cannot be banned" : undefined}
                                >
                                  {p.is_banned ? "Unban" : "Ban"}
                                </Button>
                              </>
                            )}
                          </div>
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

      <BanPilotModal
        isOpen={!!selectedPilotToBan}
        onClose={() => setSelectedPilotToBan(null)}
        pilot={selectedPilotToBan}
        onConfirmBan={handleConfirmBanFromModal}
        isLoading={toggleBanMutation.isPending}
      />
    </>
  );
}
