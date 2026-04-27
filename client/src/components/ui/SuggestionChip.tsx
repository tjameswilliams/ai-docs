import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface SuggestionChipProps {
  icon?: IconName;
  onClick?: () => void;
  children: ReactNode;
}

export function SuggestionChip({ icon, onClick, children }: SuggestionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full transition-all duration-[120ms] whitespace-nowrap"
      style={{
        padding: "4px 10px",
        fontSize: 10.5,
        color: "#a1a1aa",
        background: "rgba(28,28,32,0.6)",
        border: "1px solid #27272a",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(63,63,70,0.5)";
        el.style.color = "#e4e4e7";
        el.style.borderColor = "#3f3f46";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = "rgba(28,28,32,0.6)";
        el.style.color = "#a1a1aa";
        el.style.borderColor = "#27272a";
      }}
    >
      {icon && <Icon name={icon} size={10} className="shrink-0" />}
      {children}
    </button>
  );
}
