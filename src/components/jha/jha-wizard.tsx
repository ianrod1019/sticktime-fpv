/**
 * JhaWizard — multi-step interactive checklist that walks a pilot through
 * environmental, hardware, battery, and crew checks before flight.
 *
 * If any critical safety item fails, the submission is auto-flagged as
 * 'failed' and the wizard displays a blocking warning banner.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  Cpu,
  BatteryFull,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useSubmitJhaChecklist } from "@/hooks/jha/use-jha";
import {
  type JhaChecklistSection,
  type JhaChecklistItem,
  type JhaItemResponse,
  type JhaResponses,
  type JhaTemplate,
} from "@/types/jha";

// Section → icon mapping for the step header
const SECTION_ICONS: Record<string, typeof Cloud> = {
  Environmental: Cloud,
  Hardware: Cpu,
  Battery: BatteryFull,
  "Crew & Comms": Users,
};

const SECTION_COLORS: Record<string, string> = {
  Environmental: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  Hardware: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  Battery: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  "Crew & Comms": "text-violet-400 bg-violet-400/10 border-violet-400/20",
};

interface JhaWizardProps {
  template: JhaTemplate;
  orgId: string;
  airframeId?: string | null;
  dispatchId?: string | null;
  /** Called after a successful submission with the computed status. */
  onComplete?: (status: "passed" | "failed", submissionId?: string) => void;
}

export function JhaWizard({
  template,
  orgId,
  airframeId = null,
  dispatchId = null,
  onComplete,
}: JhaWizardProps) {
  const sections = template.items;
  const totalSteps = sections.length;
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<JhaResponses>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const submit = useSubmitJhaChecklist(orgId);

  const currentSection = sections[step];

  /** Update a single item response. */
  const toggleItem = (itemId: string, passed: boolean) => {
    setResponses((prev) => {
      const existing = prev[itemId];
      const noteText = existing?.note;
      const next: JhaItemResponse = { passed };
      if (noteText) next.note = noteText;
      return { ...prev, [itemId]: next };
    });
  };

  /** Update a note for an item. */
  const updateNote = (itemId: string, note: string) => {
    setNotes((prev) => ({ ...prev, [itemId]: note }));
    setResponses((prev) => {
      const existing = prev[itemId] ?? { passed: false };
      const next: JhaItemResponse = { passed: existing.passed };
      if (note) next.note = note;
      return { ...prev, [itemId]: next };
    });
  };

  /** Compute the overall status: if any critical item failed → 'failed'. */
  const { status, criticalFailures } = useMemo((): { status: "passed" | "failed"; criticalFailures: boolean } => {
    let hasCriticalFailure = false;
    for (const section of sections) {
      for (const item of section.items) {
        const resp = responses[item.id];
        if (item.critical && resp && !resp.passed) {
          hasCriticalFailure = true;
          break;
        }
      }
      if (hasCriticalFailure) break;
    }
    const allAnswered = sections.every((s) =>
      s.items.every((i) => responses[i.id]?.passed !== undefined),
    );
    const failedItems = sections.flatMap((s) =>
      s.items.filter((i) => responses[i.id] && !responses[i.id]!.passed),
    );
    return {
      status: (hasCriticalFailure ? "failed" : "passed") as "passed" | "failed",
      criticalFailures: hasCriticalFailure,
    };
  }, [sections, responses]);

  const sectionItems = currentSection?.items ?? [];

  /** Count answered items in the current section. */
  const sectionAnswered = sectionItems.filter(
    (i) => responses[i.id]?.passed !== undefined,
  ).length;
  const sectionTotal = sectionItems.length;
  const sectionProgress =
    sectionTotal > 0 ? (sectionAnswered / sectionTotal) * 100 : 0;

  /** Overall progress across all sections. */
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const totalAnswered = sections.reduce(
    (sum, s) =>
      sum + s.items.filter((i) => responses[i.id]?.passed !== undefined).length,
    0,
  );
  const overallProgress = totalItems > 0 ? (totalAnswered / totalItems) * 100 : 0;

  /** Can we proceed to the next step? (All items in current section answered) */
  const canProceed = sectionTotal > 0 && sectionAnswered === sectionTotal;
  const isLastStep = step === totalSteps - 1;
  const isSubmitReady = totalAnswered === totalItems;

  /** Submit the checklist. */
  const handleSubmit = async () => {
    try {
      const result = await submit.mutateAsync({
        template_id: template.template_id,
        airframe_id: airframeId,
        dispatch_id: dispatchId,
        responses,
        status,
      });
      if (status === "passed") {
        toast.success("JHA checklist passed — cleared for flight.");
      } else {
        toast.warning("JHA checklist failed — flight blocked.");
      }
      onComplete?.(status, result.submission_id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not submit checklist.",
      );
    }
  };

  const SectionIcon = currentSection ? (SECTION_ICONS[currentSection.section] ?? ClipboardCheck) : ClipboardCheck;

  return (
    <div className="space-y-6">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">
            Overall progress
          </span>
          <span className="font-mono text-xs text-zinc-400">
            {totalAnswered}/{totalItems} items
          </span>
        </div>
        <Progress value={overallProgress} className="h-1.5" />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {sections.map((s, i) => {
          const StepIcon = SECTION_ICONS[s.section] ?? ClipboardCheck;
          const sAnswered = s.items.filter(
            (it) => responses[it.id]?.passed !== undefined,
          ).length;
          const sComplete = sAnswered === s.items.length;
          return (
            <button
              key={s.section}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all",
                i === step
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : sComplete
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    : "border-white/[0.08] text-zinc-600 hover:border-white/[0.15] hover:text-zinc-400",
              )}
            >
              <StepIcon className="h-3 w-3" />
              {s.section}
              {sComplete && <CheckCircle2 className="h-3 w-3" />}
            </button>
          );
        })}
      </div>

      {/* Critical failure banner */}
      {criticalFailures && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-destructive">
              Critical safety failure detected
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              One or more critical safety items have been flagged as failed.
              This submission will be recorded as <strong>failed</strong> and
              the flight cannot proceed.
            </p>
          </div>
        </div>
      )}

      {/* Current section card */}            <Card className="border-white/[0.08] bg-white/[0.02]">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-lg border",
                  currentSection
                    ? (SECTION_COLORS[currentSection.section] ?? "text-zinc-400 bg-zinc-400/10 border-zinc-400/20")
                    : "text-zinc-400 bg-zinc-400/10 border-zinc-400/20",
                )}
              >
                <SectionIcon className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="text-base font-semibold text-zinc-100">
                  {currentSection?.section ?? "Loading…"}
                </CardTitle>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-600">
                  Step {step + 1} of {totalSteps} — {sectionAnswered}/
                  {sectionTotal} answered
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[10px]",
                sectionProgress === 100
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-white/[0.15] text-zinc-500",
              )}
            >
              {Math.round(sectionProgress)}%
            </Badge>
          </div>
          <Progress value={sectionProgress} className="h-1 mt-3" />
        </CardHeader>

        <CardContent className="space-y-3">
          {sectionItems.map((item) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              response={responses[item.id]}
              note={notes[item.id] ?? ""}
              onToggle={toggleItem}
              onNoteChange={updateNote}
            />
          ))}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
          className="gap-1.5"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>

        {isLastStep ? (
          <Button
            size="sm"
            disabled={!isSubmitReady || submit.isPending}
            onClick={handleSubmit}
            className={cn(
              "gap-1.5",
              status === "failed"
                ? "bg-destructive hover:bg-destructive/90"
                : "",
            )}
          >
            {submit.isPending ? (
              "Submitting…"
            ) : (
              <>
                <ClipboardCheck className="h-3.5 w-3.5" />
                {status === "failed" ? "Submit (Failed)" : "Submit & Clear"}
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canProceed}
            onClick={() => setStep((s) => s + 1)}
            className="gap-1.5"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// ChecklistItemRow — a single check item with pass/fail toggle + note
// -------------------------------------------------------------------
function ChecklistItemRow({
  item,
  response,
  note,
  onToggle,
  onNoteChange,
}: {
  item: JhaChecklistItem;
  response: JhaItemResponse | undefined;
  note: string;
  onToggle: (id: string, passed: boolean) => void;
  onNoteChange: (id: string, note: string) => void;
}) {
  const answered = response !== undefined;
  const passed = response?.passed ?? false;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all",
        answered
          ? passed
            ? "border-emerald-500/20 bg-emerald-500/[0.03]"
            : "border-destructive/20 bg-destructive/[0.03]"
          : "border-white/[0.08] bg-white/[0.015]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {item.critical && (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[9px] uppercase"
            >
              Critical
            </Badge>
          )}
          <span className="text-sm text-zinc-200">{item.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onToggle(item.id, true)}
            className={cn(
              "rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-all",
              answered && passed
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-white/[0.1] text-zinc-600 hover:border-emerald-500/30 hover:text-emerald-400",
            )}
          >
            Pass
          </button>
          <button
            type="button"
            onClick={() => onToggle(item.id, false)}
            className={cn(
              "rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-all",
              answered && !passed
                ? "border-destructive/40 bg-destructive/15 text-destructive"
                : "border-white/[0.1] text-zinc-600 hover:border-destructive/30 hover:text-destructive",
            )}
          >
            Fail
          </button>
        </div>
      </div>
      {answered && !passed && (
        <div className="mt-2">
          <Label className="text-[10px] uppercase tracking-wider text-zinc-600">
            Note (optional)
          </Label>
          <Textarea
            value={note}
            onChange={(e) => onNoteChange(item.id, e.target.value)}
            placeholder="Describe the issue…"
            className="mt-1 min-h-[60px] border-white/[0.08] bg-white/[0.02] text-xs"
          />
        </div>
      )}
    </div>
  );
}
