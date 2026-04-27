import { Icon } from "./Icon";

export type ToolChipStatus = "running" | "done" | "failed";

interface ToolChipProps {
  status: ToolChipStatus;
  name: string;
  label?: string;
  onClick?: () => void;
}

// Compact tool-call chip used inline in assistant messages.
// done = emerald check, failed = red x, running = blue spinning loader.
export function ToolChip({ status, name, label, onClick }: ToolChipProps) {
  const statusStyle = {
    running: { color: "#60a5fa", icon: "loader" as const, spin: true },
    done: { color: "#10b981", icon: "check" as const, spin: false },
    failed: { color: "#ef4444", icon: "x" as const, spin: false },
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-[4px] transition-colors duration-[120ms] hover:bg-zinc-800/80"
      style={{
        padding: "3px 7px",
        fontSize: 10.5,
        background: "rgba(28,28,32,0.7)",
        border: "1px solid #27272a",
        color: "#e4e4e7",
        fontFamily: "var(--font-mono)",
        cursor: onClick ? "pointer" : "default",
        maxWidth: "100%",
      }}
    >
      <Icon
        name={statusStyle.icon}
        size={11}
        className={statusStyle.spin ? "animate-spin" : ""}
      />
      <span style={{ color: statusStyle.color, fontWeight: 500 }}>{name}</span>
      {label && (
        <span
          className="truncate"
          style={{ color: "#71717a", maxWidth: 220 }}
          title={label}
        >
          {label}
        </span>
      )}
    </button>
  );
}
