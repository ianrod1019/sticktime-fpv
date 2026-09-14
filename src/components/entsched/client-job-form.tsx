import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateClientJob } from "@/hooks/entsched/use-client-jobs";
import type { ClientJobDraft } from "@/types/entsched";

/**
 * ClientJobFormDialog — create a client job (org admins).
 * Inline validation mirrors the server constraints; the job starts as
 * draft or goes straight to pending_confirmation (share the link).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface FormErrors {
  title?: string;
  client_name?: string;
  client_email?: string;
  start?: string;
  end?: string;
}

export function ClientJobFormDialog({
  open,
  onOpenChange,
  orgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}) {
  const createJob = useCreateClientJob(orgId);
  const [draft, setDraft] = useState<ClientJobDraft>(() => {
    const start = new Date();
    start.setHours(start.getHours() + 24, 0, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    return {
      title: "",
      description: "",
      location: "",
      scheduled_start: toLocalInputValue(start),
      scheduled_end: toLocalInputValue(end),
      client_name: "",
      client_email: "",
      status: "pending_confirmation",
    };
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const setField = (field: keyof ClientJobDraft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const title = draft.title.trim();
    if (!title) next.title = "A job title is required.";
    else if (title.length > 140)
      next.title = "Keep the title under 140 characters.";

    if (!draft.client_name.trim())
      next.client_name = "The client's name is required.";

    if (draft.client_email.trim() && !EMAIL_RE.test(draft.client_email.trim()))
      next.client_email = "That email address doesn't look valid.";

    if (!draft.scheduled_start) next.start = "Pick a start time.";
    if (!draft.scheduled_end) next.end = "Pick an end time.";
    if (draft.scheduled_start && draft.scheduled_end) {
      const start = new Date(draft.scheduled_start);
      const end = new Date(draft.scheduled_end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        next.start = next.start ?? "Invalid date.";
      } else if (end <= start) {
        next.end = "End must be after start.";
      }
    }
    return next;
  };

  const handleSubmit = () => {
    const next = validate();
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    createJob.mutate(
      {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        location: draft.location.trim(),
        client_name: draft.client_name.trim(),
        client_email: draft.client_email.trim(),
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) =>
          setErrors((e) => ({
            ...e,
            title: err.message || "Could not create the job.",
          })),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New client job</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="job-title">Job title</Label>
            <Input
              id="job-title"
              value={draft.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Roof inspection — Carter & Sons"
              maxLength={140}
              aria-invalid={!!errors.title}
              className="mt-1.5"
            />
            {errors.title && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                <TriangleAlert className="h-3 w-3" />
                {errors.title}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="job-start">Starts</Label>
              <Input
                id="job-start"
                type="datetime-local"
                value={draft.scheduled_start}
                onChange={(e) => setField("scheduled_start", e.target.value)}
                aria-invalid={!!errors.start}
                className="mt-1.5"
              />
              {errors.start && (
                <p className="mt-1 text-[11px] text-destructive">
                  {errors.start}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="job-end">Ends</Label>
              <Input
                id="job-end"
                type="datetime-local"
                value={draft.scheduled_end}
                onChange={(e) => setField("scheduled_end", e.target.value)}
                aria-invalid={!!errors.end}
                className="mt-1.5"
              />
              {errors.end && (
                <p className="mt-1 text-[11px] text-destructive">
                  {errors.end}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="job-location">Location</Label>
            <Input
              id="job-location"
              value={draft.location}
              onChange={(e) => setField("location", e.target.value)}
              placeholder="Site address"
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="job-client-name">Client name</Label>
              <Input
                id="job-client-name"
                value={draft.client_name}
                onChange={(e) => setField("client_name", e.target.value)}
                placeholder="Who booked this"
                aria-invalid={!!errors.client_name}
                className="mt-1.5"
              />
              {errors.client_name && (
                <p className="mt-1 text-[11px] text-destructive">
                  {errors.client_name}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="job-client-email">
                Client email <span className="text-zinc-600">(optional)</span>
              </Label>
              <Input
                id="job-client-email"
                type="email"
                value={draft.client_email}
                onChange={(e) => setField("client_email", e.target.value)}
                placeholder="For the confirmation email"
                aria-invalid={!!errors.client_email}
                className="mt-1.5"
              />
              {errors.client_email && (
                <p className="mt-1 text-[11px] text-destructive">
                  {errors.client_email}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="job-description">Scope / notes</Label>
            <Textarea
              id="job-description"
              value={draft.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="What the client is paying for…"
              rows={3}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createJob.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createJob.isPending}>
            {createJob.isPending
              ? "Creating…"
              : draft.status === "pending_confirmation"
                ? "Create & await client"
                : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
