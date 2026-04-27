import { forwardRef, type InputHTMLAttributes } from "react";

type InputSize = "sm" | "md";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", className, style, ...rest },
  ref
) {
  const sz = size === "sm"
    ? { h: 26, font: 11.5, padX: 8 }
    : { h: 30, font: 12.5, padX: 10 };
  return (
    <input
      ref={ref}
      {...rest}
      className={
        "rounded-[5px] outline-none transition-colors duration-[120ms] " +
        "focus:border-[#3b82f6] " +
        (className ?? "")
      }
      style={{
        height: sz.h,
        fontSize: sz.font,
        padding: `0 ${sz.padX}px`,
        background: "#1c1c20",
        border: "1px solid #27272a",
        color: "#e4e4e7",
        ...style,
      }}
    />
  );
});
