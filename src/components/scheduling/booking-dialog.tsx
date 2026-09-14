/**
 * BookingDialog — create/edit a booking with per-person allocation.
 *
 * Save flow: validate → server person-conflict lookup (warn but allow)
 * → submit. Gear conflicts are hard server rejections; they surface as
 * inline errors and the row stays for correction. Delete only for
 * existing bookings, guarded by an AlertDialog.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarPlus,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classifySchedulingError } from "@/lib/scheduling/api";
import type {
  BookingPayload,
  GearOption,
  PersonConflict,
  RosterMember,
  ScheduleEvent,
  ScheduleStatus,
} from "@/lib/scheduling/types";
import { SCHEDULE_STATUSES, STATUS_LABEL } from "@/lib/scheduling/types";

export interface BookingDraft {
  /** Null when creating. */
  id: string | null;
  event_title: string;
  description: string;
  assigned_user_id: string;
  airframe_id: string | null;
  battery_id: string | null;
  start: string; // datetime-local string
  end: string;
  status: ScheduleStatus;
}

export function draftFromEvent(e: ScheduleEvent): BookingDraft {
  return {
    id: e.id,
    event_title: e.event_title,
    description: e.description ?? "",
    assigned_user_id: e.assigned_user_id,
    airframe_id: e.airframe_id,
    battery_id: e.battery_id,
    start: toLocalInput(e.start_time),
    end: toLocalInput(e.end_time),
    status: e.status,
  };
}

export function draftFromSlot(
  date: Date,
  startMinute: number,
  roster: RosterMember[],
): BookingDraft {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setMinutes(startMinute);
  const end = new Date(start.getTime() + 60 * 60_000);
  return {
    id: null,
    event_title: "",
    description: "",
    assigned_user_id: roster[0]?.user_id ?? "",
    airframe_id: null,
    battery_id: null,
    start: toLocalInput(start.toISOString()),
    end: toLocalInput(end.toISOString()),
    status: "scheduled",
  };
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

export function BookingDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  roster,
  airframes,
  batteries,
  canManage,
  onSave,
  onDelete,
  onCheckConflicts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: BookingDraft | null;
  setDraft: (d: BookingDraft) => void;
  roster: RosterMember[];
  airframes: GearOption[];
  batteries: GearOption[];
  canManage: boolean;
  onSave: (payload: BookingPayload, id: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCheckConflicts: (p: {
    userId: string;
    start: string;
    end: string;
    excludeId?: string | null;
  }) => Promise<PersonConflict[]>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<PersonConflict[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setConflicts(null);
    }
  }, [open]);

  if (!draft) return null;

  const durationOk = draft.start && draft.end && draft.end > draft.start;

  const checkConflicts = async () => {
    if (!durationOk) return [];
    return onCheckConflicts({
      userId: draft.assigned_user_id,
      start: fromLocalInput(draft.start),
      end: fromLocalInput(draft.end),
      excludeId: draft.id,
    });
  };

  const submit = async (force: boolean) => {
    setError(null);

    if (!draft.event_title.trim()) {
      setError("Give the booking a title.");
      return;
    }
    if (!draft.assigned_user_id) {
      setError("Assign a person to this slot.");
      return;
    }
    if (!durationOk) {
      setError("The end time must be after the start time.");
      return;
    }
    if (draft.battery_id && !draft.airframe_id) {
      setError("A battery can only be booked together with an airframe.");
      return;
    }

    if (!force) {
      setSaving(true);
      let found: PersonConflict[] = [];
      try {
        found = await checkConflicts();
      } catch {
        // The conflict check is advisory — a failed lookup must not
        // block saving; the server still guards everything.
        found = [];
      } finally {
        setSaving(false);
      }
      if (found.length > 0) {
        setConflicts(found);
        return;
      }
    }

    setConflicts(null);
    setSaving(true);
    try {
      await onSave(
        {
          event_title: draft.event_title.trim(),
          description: draft.description.trim() || null,
          assigned_user_id: draft.assigned_user_id,
          airframe_id: draft.airframe_id,
          battery_id: draft.battery_id,
          start_time: fromLocalInput(draft.start),
          end_time: fromLocalInput(draft.end),
          status: draft.status,
        },
        draft.id,
      );
      onOpenChange(false);
    } catch (err) {
      setError(classifySchedulingError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <CalendarPlus className="h-4.5 w-4.5 text-primary" aria-hidden />
            {draft.id ? "Edit booking" : "New booking"}
          </DialogTitle>
          <DialogDescription>
            Allocate a person to a time slot — with or without hardware.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bk-title">Title</Label>
            <Input
              id="bk-title"
              value={draft.event_title}
              maxLength={120}
              placeholder="Tinywhoop Trainer Class"
              onChange={(e) =>
                setDraft({ ...draft, event_title: e.target.value })
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bk-desc">Description</Label>
            <Textarea
              id="bk-desc"
              rows={2}
              value={draft.description}
              placeholder="Notes for the assigned pilot or class…"
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Assigned person</Label>
              <Select
                {...(draft.assigned_user_id
                  ? { value: draft.assigned_user_id }
                  : {})}
                onValueChange={(v) =>
                  setDraft({ ...draft, assigned_user_id: v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select roster member" />
                </SelectTrigger>
                <SelectContent>
                  {roster.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.callsign} ({m.org_role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) =>
                  setDraft({ ...draft, status: v as ScheduleStatus })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Airframe</Label>
              <Select
                {...(draft.airframe_id ? { value: draft.airframe_id } : {})}
                onValueChange={(v) =>
                  setDraft({ ...draft, airframe_id: v === NONE ? null : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional — org fleet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {airframes.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Battery set</Label>
              <Select
                {...(draft.battery_id ? { value: draft.battery_id } : {})}
                onValueChange={(v) =>
                  setDraft({ ...draft, battery_id: v === NONE ? null : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional — org fleet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {batteries.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-start">Starts</Label>
              <Input
                id="bk-start"
                type="datetime-local"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bk-end">Ends</Label>
              <Input
                id="bk-end"
                type="datetime-local"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          {conflicts && conflicts.length > 0 && (
            <div className="space-y-2 rounded-md border border-amber-400/30 bg-amber-500/[0.08] px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <TriangleAlert className="h-4 w-4 text-amber-300" />
                <span className="text-xs font-semibold text-amber-200">
                  This person already has {conflicts.length} overlapping booking
                  {conflicts.length > 1 ? "s" : ""}:
                </span>
              </div>
              <ul className="space-y-1">
                {conflicts.map((c) => (
                  <li
                    key={c.id}
                    className="font-mono text-[10px] text-amber-100/80"
                  >
                    {new Date(c.start_time).toLocaleString([], {
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    –{" "}
                    {new Date(c.end_time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {c.event_title}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-amber-200/70">
                You can still schedule this — instructors sometimes run parallel
                stations. Hardware conflicts are always blocked.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => submit(true)}
                disabled={saving}
              >
                Schedule anyway
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {draft.id && canManage ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => submit(false)} disabled={saving}>
              {saving && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {draft.id ? "Save changes" : "Create booking"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This releases the airframe and battery for the slot. The action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!draft.id) return;
                setSaving(true);
                try {
                  await onDelete(draft.id);
                  setConfirmDelete(false);
                  onOpenChange(false);
                } catch (err) {
                  setError(classifySchedulingError(err).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/** Sentinel for the optional gear selects. */
const NONE = "__none__";
