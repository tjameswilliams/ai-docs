import type { ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div
      className={"uppercase select-none " + (className ?? "")}
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        color: "#52525b",
      }}
    >
      {children}
    </div>
  );
}
