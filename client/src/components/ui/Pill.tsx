import type { ReactNode } from "react";

export type PillTone = "neutral" | "saved" | "dirty" | "plan" | "info" | "success" | "danger";

interface PillProps {
  tone?: PillTone;
  mono?: boolean;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const tones: Record<PillTone, { bg: string; fg: string; border: string; dotColor: string }> = {
  neutral: {
    bg: "#1c1c20",
    fg: "#a1a1aa",
    border: "rgba(63,63,70,0.5)",
    dotColor: "#71717a",
  },
  saved: {
    bg: "rgba(16,185,129,0.1)",
    fg: "#10b981",
    border: "rgba(16,185,129,0.25)",
    dotColor: "#10b981",
  },
  dirty: {
    bg: "rgba(245,158,11,0.1)",
    fg: "#f59e0b",
    border: "rgba(245,158,11,0.25)",
    dotColor: "#f59e0b",
  },
  plan: {
    bg: "rgba(245,158,11,0.15)",
    fg: "#fbbf24",
    border: "rgba(245,158,11,0.25)",
    dotColor: "#fbbf24",
  },
  info: {
    bg: "rgba(59,130,246,0.15)",
    fg: "#60a5fa",
    border: "rgba(59,130,246,0.25)",
    dotColor: "#60a5fa",
  },
  success: {
    bg: "rgba(16,185,129,0.15)",
    fg: "#34d399",
    border: "rgba(16,185,129,0.25)",
    dotColor: "#10b981",
  },
  danger: {
    bg: "rgba(239,68,68,0.15)",
    fg: "#f87171",
    border: "rgba(239,68,68,0.25)",
    dotColor: "#ef4444",
  },
};

export function Pill({ tone = "neutral", mono = false, dot = false, children, className }: PillProps) {
  const t = tones[tone];
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full uppercase tracking-[0.05em] " +
        (mono ? "font-mono normal-case tracking-normal " : "") +
        (className ?? "")
      }
      style={{
        fontSize: 9.5,
        padding: "2px 7px",
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontWeight: mono ? 400 : 600,
      }}
    >
      {dot && (
        <span
          className="inline-block rounded-full"
          style={{ width: 5, height: 5, background: t.dotColor, boxShadow: `0 0 6px ${t.dotColor}` }}
        />
      )}
      {children}
    </span>
  );
}
