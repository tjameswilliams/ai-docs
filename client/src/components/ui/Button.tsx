import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "destructive"
  | "plan"
  | "ghost"
  | "panel"
  | "text"
  | "shape"
  | "exp";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  kbd?: string;
  children?: ReactNode;
}

// Each variant: bg + hover bg via gradient (linear-gradient inline because Tailwind
// utilities don't compose multi-stop gradients with arbitrary stops cleanly).
// Active state: translate-y-[0.5px] + inset shadow.
const variantStyles: Record<ButtonVariant, { bg: string; bgHover: string; fg: string; border: string; shadow: string }> = {
  primary: {
    bg: "linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)",
    bgHover: "linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)",
    fg: "#fff",
    border: "1px solid rgba(96,165,250,0.6)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.3)",
  },
  destructive: {
    bg: "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)",
    bgHover: "linear-gradient(180deg, #f87171 0%, #ef4444 100%)",
    fg: "#fff",
    border: "1px solid rgba(248,113,113,0.5)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 2px rgba(0,0,0,0.3)",
  },
  plan: {
    bg: "linear-gradient(180deg, rgba(180,83,9,0.6) 0%, rgba(120,53,15,0.7) 100%)",
    bgHover: "linear-gradient(180deg, rgba(217,119,6,0.6) 0%, rgba(180,83,9,0.7) 100%)",
    fg: "#fde68a",
    border: "1px solid rgba(217,119,6,0.5)",
    shadow: "inset 0 0 0 1px rgba(180,83,9,0.3)",
  },
  ghost: {
    bg: "transparent",
    bgHover: "rgba(63,63,70,0.6)",
    fg: "#a1a1aa",
    border: "1px solid transparent",
    shadow: "none",
  },
  panel: {
    bg: "linear-gradient(180deg, #2d2d33 0%, #232328 100%)",
    bgHover: "linear-gradient(180deg, #38383f 0%, #2d2d33 100%)",
    fg: "#e4e4e7",
    border: "1px solid #3f3f46",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.2)",
  },
  text: {
    bg: "linear-gradient(180deg, rgba(124,58,237,0.18) 0%, rgba(124,58,237,0.08) 100%)",
    bgHover: "linear-gradient(180deg, rgba(139,92,246,0.25) 0%, rgba(124,58,237,0.15) 100%)",
    fg: "#c4b5fd",
    border: "1px solid rgba(139,92,246,0.3)",
    shadow: "inset 0 1px 0 rgba(196,181,253,0.08)",
  },
  shape: {
    bg: "linear-gradient(180deg, rgba(220,38,38,0.18) 0%, rgba(220,38,38,0.08) 100%)",
    bgHover: "linear-gradient(180deg, rgba(239,68,68,0.25) 0%, rgba(220,38,38,0.15) 100%)",
    fg: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.3)",
    shadow: "inset 0 1px 0 rgba(252,165,165,0.08)",
  },
  exp: {
    bg: "linear-gradient(180deg, #10b981 0%, #059669 100%)",
    bgHover: "linear-gradient(180deg, #34d399 0%, #10b981 100%)",
    fg: "#fff",
    border: "1px solid rgba(52,211,153,0.5)",
    shadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.3)",
  },
};

const sizeStyles: Record<ButtonSize, { h: number; padX: number; font: number; gap: number }> = {
  xs: { h: 22, padX: 8, font: 11, gap: 5 },
  sm: { h: 26, padX: 10, font: 11.5, gap: 6 },
  md: { h: 30, padX: 12, font: 12.5, gap: 7 },
  lg: { h: 34, padX: 16, font: 13, gap: 8 },
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  kbd,
  children,
  disabled,
  className,
  style,
  ...rest
}: ButtonProps) {
  const v = variantStyles[variant];
  const sz = sizeStyles[size];

  return (
    <button
      {...rest}
      disabled={disabled}
      data-button-variant={variant}
      className={
        "ai-btn group inline-flex items-center justify-center font-medium leading-none whitespace-nowrap rounded-[5px] transition-[background,box-shadow,transform] duration-[120ms] " +
        "active:translate-y-[0.5px] disabled:opacity-45 disabled:cursor-not-allowed " +
        (className ?? "")
      }
      style={{
        height: sz.h,
        padding: `0 ${sz.padX}px`,
        fontSize: sz.font,
        gap: sz.gap,
        background: v.bg,
        color: v.fg,
        border: v.border,
        boxShadow: v.shadow,
        letterSpacing: "0.005em",
        transitionTimingFunction: "cubic-bezier(0.2,0,0,1)",
        // hover bg via CSS variable so we can swap with :hover in a quick stylesheet rule
        ["--ai-btn-bg-hover" as string]: v.bgHover,
        ["--ai-btn-shadow-active" as string]: "inset 0 1px 2px rgba(0,0,0,0.25)",
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={sz.font + 1} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sz.font + 1} />}
      {kbd && (
        <span
          className="ml-1 rounded-[3px] border font-mono"
          style={{
            padding: "1px 4px",
            fontSize: 9,
            color: "rgba(255,255,255,0.6)",
            background: "rgba(0,0,0,0.25)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          {kbd}
        </span>
      )}
    </button>
  );
}
