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
import { useCreateMeetup } from "@/hooks/enterprise/use-enterprise";
import type { MeetupDraft } from "@/types/enterprise";

/**
 * MeetupFormDialog — create a squadron meetup (admin only).
 * Inline validation mirrors the server constraints (title length,
 * end-after-start) so errors resolve before the request fires.
 */

const TITLE_MIN = 1;
const TITLE_MAX = 120;

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface FormErrors {
  title?: string;
  start?: string;
  end?: string;
}

export function MeetupFormDialog({
  open,
  onOpenChange,
  orgId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
}) {
  const createMeetup = useCreateMeetup(orgId);
  const [draft, setDraft] = useState<MeetupDraft>(() => {
    const start = new Date();
    start.setHours(start.getHours() + 2, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return {
      title: "",
      description: "",
      location: "",
      start_time: toLocalInputValue(start),
      end_time: toLocalInputValue(end),
    };
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const setField = (field: keyof MeetupDraft, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const title = draft.title.trim();
    if (title.length < TITLE_MIN) next.title = "A title is required.";
    else if (title.length > TITLE_MAX)
      next.title = `Keep the title under ${TITLE_MAX} characters.`;

    if (!draft.start_time) next.start = "Pick a start time.";
    if (!draft.end_time) next.end = "Pick an end time.";
    if (draft.start_time && draft.end_time) {
      const start = new Date(draft.start_time);
      const end = new Date(draft.end_time);
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
    createMeetup.mutate(
      {
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
        location: draft.location.trim(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (err) =>
          setErrors((e) => ({
            ...e,
            title: err.message || "Could not create the meetup.",
          })),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Schedule a meetup</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="meetup-title">Title</Label>
            <Input
              id="meetup-title"
              value={draft.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Practice: gate racing"
              maxLength={TITLE_MAX}
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
              <Label htmlFor="meetup-start">Starts</Label>
              <Input
                id="meetup-start"
                type="datetime-local"
                value={draft.start_time}
                onChange={(e) => setField("start_time", e.target.value)}
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
              <Label htmlFor="meetup-end">Ends</Label>
              <Input
                id="meetup-end"
                type="datetime-local"
                value={draft.end_time}
                onChange={(e) => setField("end_time", e.target.value)}
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
            <Label htmlFor="meetup-location">Location</Label>
            <Input
              id="meetup-location"
              value={draft.location}
              onChange={(e) => setField("location", e.target.value)}
              placeholder="Field, park course, shop room…"
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="meetup-description">Description</Label>
            <Textarea
              id="meetup-description"
              value={draft.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="What to bring, what to expect…"
              rows={3}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMeetup.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMeetup.isPending}>
            {createMeetup.isPending ? "Scheduling…" : "Schedule meetup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
