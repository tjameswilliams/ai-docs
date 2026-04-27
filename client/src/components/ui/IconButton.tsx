import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";

export type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  size?: IconButtonSize;
  active?: boolean;
  tooltip?: string;
}

const sizeMap: Record<IconButtonSize, number> = { sm: 24, md: 28, lg: 32 };

export function IconButton({
  icon,
  size = "md",
  active = false,
  tooltip,
  className,
  style,
  disabled,
  ...rest
}: IconButtonProps) {
  const px = sizeMap[size];
  const iconSize = Math.round(px * 0.55);

  return (
    <button
      {...rest}
      disabled={disabled}
      title={tooltip}
      className={
        "ai-icon-btn inline-flex items-center justify-center rounded-[5px] transition-all duration-[120ms] " +
        "disabled:opacity-45 disabled:cursor-not-allowed " +
        (className ?? "")
      }
      style={{
        width: px,
        height: px,
        background: active ? "linear-gradient(180deg, #38383f 0%, #2d2d33 100%)" : "transparent",
        color: active ? "#fafafa" : "#a1a1aa",
        border: active ? "1px solid #52525b" : "1px solid transparent",
        boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "none",
        ["--ai-icon-btn-bg-hover" as string]: active ? "linear-gradient(180deg, #404048 0%, #313137 100%)" : "rgba(63,63,70,0.5)",
        ["--ai-icon-btn-fg-hover" as string]: active ? "#fafafa" : "#e4e4e7",
        ...style,
      }}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
