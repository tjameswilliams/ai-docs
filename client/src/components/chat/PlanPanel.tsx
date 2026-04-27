import { useState, useRef, useEffect } from "react";
import { useStore } from "../../store";
import { sendChatMessage } from "../../lib/chatStream";
import { api } from "../../api/client";
import type { Plan, PlanStep } from "../../types";
import { Button, Icon, Pill } from "../ui";

const STEP_ICON = {
  pending: { name: "circle" as const, color: "#71717a", spin: false },
  in_progress: { name: "loader" as const, color: "#60a5fa", spin: true },
  completed: { name: "check-circle" as const, color: "#10b981", spin: false },
  skipped: { name: "minus" as const, color: "#52525b", spin: false },
};

function StepRow({
  step,
  index,
  indent = false,
}: {
  step: PlanStep;
  index: string;
  indent?: boolean;
}) {
  const isStreaming = useStore((s) => s.isStreaming);
  const isClickable = step.status === "pending" && !isStreaming;
  const meta = STEP_ICON[step.status as keyof typeof STEP_ICON] || STEP_ICON.pending;

  return (
    <button
      onClick={
        isClickable
          ? () => sendChatMessage(`Let's work on step ${index}: ${step.title}`)
          : undefined
      }
      disabled={!isClickable}
      className={`flex items-start gap-1.5 text-left w-full py-0.5 ${indent ? "pl-4" : ""} ${
        isClickable ? "hover:bg-zinc-800/50 rounded cursor-pointer" : "cursor-default"
      } ${step.status === "completed" ? "opacity-70" : ""}`}
    >
      <Icon
        name={meta.name}
        size={11}
        className={"shrink-0 mt-[3px] " + (meta.spin ? "animate-spin" : "")}
        strokeWidth={2}
      />
      <span
        className="text-[11px] leading-[18px]"
        style={{
          color:
            step.status === "completed"
              ? "#52525b"
              : step.status === "in_progress"
              ? "#93c5fd"
              : "#d4d4d8",
          textDecoration: step.status === "completed" ? "line-through" : undefined,
        }}
      >
        <span style={{ color: "#52525b" }}>{index}.</span> {step.title}
      </span>
    </button>
  );
}

function getExecutionFocusSteps(plan: Plan): {
  lastCompleted: { step: PlanStep; index: string } | null;
  current: { step: PlanStep; index: string } | null;
} {
  let lastCompleted: { step: PlanStep; index: string } | null = null;
  let current: { step: PlanStep; index: string } | null = null;

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const idx = `${i + 1}`;
    if (step.status === "completed") lastCompleted = { step, index: idx };
    if (step.status === "in_progress") current = { step, index: idx };
    if (step.substeps) {
      for (let j = 0; j < step.substeps.length; j++) {
        const sub = step.substeps[j];
        const subIdx = `${i + 1}.${j + 1}`;
        if (sub.status === "completed") lastCompleted = { step: sub, index: subIdx };
        if (sub.status === "in_progress") current = { step: sub, index: subIdx };
      }
    }
  }
  return { lastCompleted, current };
}

const PLAN_STATUS_TONE = {
  draft: "plan" as const,
  approved: "info" as const,
  in_progress: "info" as const,
  completed: "success" as const,
  archived: "neutral" as const,
};

export function PlanPanel({ plan }: { plan: Plan }) {
  const [expanded, setExpanded] = useState(false);
  const loadActivePlan = useStore((s) => s.loadActivePlan);
  const isStreaming = useStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isExecuting = plan.status === "in_progress" || plan.status === "approved";

  let total = 0;
  let completed = 0;
  for (const step of plan.steps) {
    total++;
    if (step.status === "completed") completed++;
    if (step.substeps) {
      for (const sub of step.substeps) {
        total++;
        if (sub.status === "completed") completed++;
      }
    }
  }
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const { lastCompleted, current } = getExecutionFocusSteps(plan);

  useEffect(() => {
    if (expanded && scrollRef.current) {
      const activeEl = scrollRef.current.querySelector("[data-active-step]");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [plan, expanded]);

  const handleApprove = () => sendChatMessage("The plan looks good, let's start building.");
  const handleComplete = async () => {
    await api.updatePlan(plan.id, { status: "completed" });
    await loadActivePlan();
  };
  const handleArchive = async () => {
    await api.updatePlan(plan.id, { status: "archived" });
    await loadActivePlan();
  };

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        maxHeight: "50%",
        background: "rgba(15,15,18,0.7)",
        borderBottom: "1px solid #1c1c20",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-zinc-800/40 shrink-0"
      >
        <Icon name={expanded ? "caret-d" : "caret-r"} size={11} className="text-zinc-600" />
        <span className="text-[11.5px] font-medium truncate" style={{ color: "#e4e4e7" }}>
          {plan.title}
        </span>
        <Pill tone={PLAN_STATUS_TONE[plan.status as keyof typeof PLAN_STATUS_TONE] || "neutral"}>
          {plan.status === "in_progress" ? "Running" : plan.status}
        </Pill>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <div
            style={{
              width: 48,
              height: 3,
              borderRadius: 9999,
              background: "#27272a",
              overflow: "hidden",
            }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
                boxShadow: "0 0 6px rgba(16,185,129,0.4)",
              }}
            />
          </div>
          <span className="font-mono text-[10px]" style={{ color: "#71717a" }}>
            {completed}/{total}
          </span>
        </div>
      </button>

      {/* Collapsed exec focus */}
      {!expanded && isExecuting && (lastCompleted || current) && (
        <div className="px-3 pb-2 space-y-0">
          {lastCompleted && (
            <div className="flex items-center gap-1.5 py-0.5 opacity-60">
              <Icon name="check-circle" size={11} className="text-emerald-500 shrink-0" strokeWidth={2} />
              <span className="text-[11px] truncate" style={{ color: "#52525b", textDecoration: "line-through" }}>
                <span style={{ color: "#3f3f46" }}>{lastCompleted.index}.</span> {lastCompleted.step.title}
              </span>
            </div>
          )}
          {current && (
            <div className="flex items-center gap-1.5 py-0.5">
              <Icon name="loader" size={11} className="text-blue-400 shrink-0 animate-spin" strokeWidth={2} />
              <span className="text-[11px] truncate" style={{ color: "#93c5fd" }}>
                <span style={{ color: "#52525b" }}>{current.index}.</span> {current.step.title}
              </span>
            </div>
          )}
        </div>
      )}

      {!expanded && plan.status === "draft" && plan.description && (
        <div className="px-3 pb-2">
          <p className="text-[11px] truncate" style={{ color: "#71717a" }}>{plan.description}</p>
        </div>
      )}

      {expanded && (
        <div ref={scrollRef} className="overflow-y-auto min-h-0 px-3 pb-2.5">
          {plan.description && (
            <p className="text-[11px] mb-2" style={{ color: "#a1a1aa" }}>{plan.description}</p>
          )}
          <div className="space-y-0">
            {plan.steps.map((step, i) => (
              <div key={step.id}>
                <div {...(step.status === "in_progress" ? { "data-active-step": true } : {})}>
                  <StepRow step={step} index={`${i + 1}`} />
                </div>
                {step.substeps?.map((sub, j) => (
                  <div
                    key={sub.id}
                    {...(sub.status === "in_progress" ? { "data-active-step": true } : {})}
                  >
                    <StepRow step={sub} index={`${i + 1}.${j + 1}`} indent />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            {plan.status === "draft" && (
              <Button
                variant="primary"
                size="xs"
                icon="check-circle"
                onClick={handleApprove}
                disabled={isStreaming}
              >
                Approve Plan
              </Button>
            )}
            {isExecuting && (
              <Button
                variant="exp"
                size="xs"
                icon="check"
                onClick={handleComplete}
                disabled={isStreaming}
              >
                Complete
              </Button>
            )}
            <span className="flex-1" />
            <Button variant="ghost" size="xs" onClick={handleArchive} disabled={isStreaming}>
              Archive
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
