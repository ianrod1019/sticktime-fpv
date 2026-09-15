import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIncidents, useReviewIncident } from "@/hooks/sms/use-incidents";
import { getIncidentAttachmentUrl } from "@/lib/sms/storage";
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_SEVERITY_LEVELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/types/sms";

const SEVERITY_BADGE_VARIANT: Record<
  IncidentSeverity,
  "secondary" | "default" | "destructive"
> = {
  low: "secondary",
  medium: "default",
  high: "destructive",
  catastrophic: "destructive",
};

/** Safety-officer / org-admin review queue: filter by severity, move a
 * report through status, and require a corrective action before closing
 * (also enforced server-side by the DB constraint). */
export function IncidentReviewQueue({ orgId }: { orgId: string }) {
  const { data: incidents, isLoading } = useIncidents(orgId);
  const review = useReviewIncident(orgId);

  const [severityFilter, setSeverityFilter] = useState<
    IncidentSeverity | "all"
  >("all");
  const [drafts, setDrafts] = useState<
    Record<string, { status: IncidentStatus; corrective_action: string }>
  >({});

  const filtered = useMemo(
    () =>
      (incidents ?? []).filter(
        (i) => severityFilter === "all" || i.severity_level === severityFilter,
      ),
    [incidents, severityFilter],
  );

  const draftFor = (incident: Incident) =>
    drafts[incident.incident_id] ?? {
      status: incident.status,
      corrective_action: incident.corrective_action ?? "",
    };

  const setDraft = (
    incident: Incident,
    patch: Partial<{ status: IncidentStatus; corrective_action: string }>,
  ) => {
    setDrafts((prev) => ({
      ...prev,
      [incident.incident_id]: { ...draftFor(incident), ...patch },
    }));
  };

  const handleSave = async (incident: Incident) => {
    const draft = draftFor(incident);
    if (draft.status === "closed" && !draft.corrective_action.trim()) {
      toast.error("A corrective action is required to close an incident.");
      return;
    }
    try {
      await review.mutateAsync({
        incidentId: incident.incident_id,
        review: {
          status: draft.status,
          corrective_action: draft.corrective_action.trim() || null,
        },
      });
      toast.success("Incident updated.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update incident.",
      );
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const url = await getIncidentAttachmentUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open attachment.",
      );
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Incident review queue</CardTitle>
        <Select
          value={severityFilter}
          onValueChange={(v) =>
            setSeverityFilter(v as IncidentSeverity | "all")
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {INCIDENT_SEVERITY_LEVELS.map((s) => (
              <SelectItem key={s} value={s}>
                {INCIDENT_SEVERITY_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No incidents match this filter.
          </p>
        )}
        {filtered.map((incident) => {
          const draft = draftFor(incident);
          return (
            <div
              key={incident.incident_id}
              className="space-y-3 rounded-md border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {INCIDENT_TYPE_LABELS[incident.incident_type]} ·{" "}
                    {incident.incident_date}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reported by pilot {incident.user_id.slice(0, 8)}
                  </p>
                </div>
                <Badge
                  variant={SEVERITY_BADGE_VARIANT[incident.severity_level]}
                >
                  {INCIDENT_SEVERITY_LABELS[incident.severity_level]}
                </Badge>
              </div>

              <p className="text-sm">{incident.description}</p>

              {incident.attachment_path && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(incident.attachment_path!)}
                >
                  View attachment
                </Button>
              )}

              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <Select
                  value={draft.status}
                  onValueChange={(v) =>
                    setDraft(incident, { status: v as IncidentStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["open", "under_review", "closed"] as const).map((s) => (
                      <SelectItem key={s} value={s}>
                        {INCIDENT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  rows={2}
                  placeholder="Corrective action (required to close)"
                  value={draft.corrective_action}
                  onChange={(e) =>
                    setDraft(incident, { corrective_action: e.target.value })
                  }
                />
              </div>

              <Button
                size="sm"
                onClick={() => handleSave(incident)}
                disabled={review.isPending}
              >
                Save
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
