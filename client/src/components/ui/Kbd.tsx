import type { ReactNode } from "react";

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <span
      className={"inline-flex items-center font-mono rounded-[3px] " + (className ?? "")}
      style={{
        fontSize: 9,
        padding: "1px 5px",
        background: "#0f0f12",
        color: "#52525b",
        border: "1px solid #27272a",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}
