import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateIncident } from "@/hooks/sms/use-incidents";
import { getOrgAirframes } from "@/lib/scheduling/api";
import type { GearOption } from "@/lib/scheduling/types";
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_SEVERITY_LEVELS,
  INCIDENT_TYPE_LABELS,
  INCIDENT_TYPES,
  type IncidentSeverity,
  type IncidentType,
} from "@/types/sms";

/** Pilot-facing quick incident report. Filing is the only action a pilot
 * gets here — review and status changes are the safety officer's job
 * (sms.incidents RLS enforces this server-side). */
export function IncidentReportForm({
  orgId,
  teamId,
}: {
  orgId: string;
  teamId: string;
}) {
  const create = useCreateIncident(orgId);
  const [airframes, setAirframes] = useState<GearOption[]>([]);

  const [airframeId, setAirframeId] = useState<string>("");
  const [incidentDate, setIncidentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [severity, setSeverity] = useState<IncidentSeverity>("low");
  const [incidentType, setIncidentType] = useState<IncidentType>("near_miss");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    getOrgAirframes(teamId)
      .then(setAirframes)
      .catch(() => setAirframes([]));
  }, [teamId]);

  const resetForm = () => {
    setAirframeId("");
    setIncidentDate(new Date().toISOString().slice(0, 10));
    setSeverity("low");
    setIncidentType("near_miss");
    setDescription("");
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Describe what happened.");
      return;
    }
    try {
      await create.mutateAsync({
        draft: {
          airframe_id: airframeId || null,
          incident_date: incidentDate,
          severity_level: severity,
          incident_type: incidentType,
          description: description.trim(),
        },
        file,
      });
      toast.success("Incident reported.");
      resetForm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not file report.",
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Report a safety incident</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Severity</Label>
            <Select
              value={severity}
              onValueChange={(v) => setSeverity(v as IncidentSeverity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_SEVERITY_LEVELS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {INCIDENT_SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Incident type</Label>
            <Select
              value={incidentType}
              onValueChange={(v) => setIncidentType(v as IncidentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INCIDENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Airframe (optional)</Label>
            <Select
              value={airframeId || "none"}
              onValueChange={(v) => setAirframeId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not applicable</SelectItem>
                {airframes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>What happened</Label>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the incident: conditions, sequence of events, any injuries or damage."
          />
        </div>

        <div>
          <Label>Attachment — photo or flight log (optional)</Label>
          <Input
            type="file"
            accept="application/pdf,image/*,.bin,.csv,.log"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <Button onClick={handleSubmit} disabled={create.isPending}>
          {create.isPending ? "Submitting…" : "Submit report"}
        </Button>
      </CardContent>
    </Card>
  );
}
