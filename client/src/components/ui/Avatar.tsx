import { Icon } from "./Icon";

export type AvatarKind = "user" | "assistant" | "logo";

interface AvatarProps {
  kind?: AvatarKind;
  size?: number;
  initials?: string;
  className?: string;
}

// User: pink gradient circle with initials.
// Assistant / logo: brand-gradient rounded square with sparkle in a glass inner panel.
export function Avatar({ kind = "user", size = 22, initials = "U", className }: AvatarProps) {
  if (kind === "user") {
    return (
      <div
        className={"flex items-center justify-center rounded-full shrink-0 " + (className ?? "")}
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
          color: "#fff",
          fontSize: Math.round(size * 0.4),
          fontWeight: 700,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
        }}
      >
        {initials.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  // assistant / logo — brand-gradient square w/ glass inner panel
  const radius = Math.max(4, Math.round(size * 0.28));
  return (
    <div
      className={"relative shrink-0 " + (className ?? "")}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--brand-gradient)",
        boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 2px 6px rgba(99,102,241,0.4)",
      }}
    >
      <div
        className="absolute flex items-center justify-center"
        style={{
          inset: 2,
          borderRadius: Math.max(2, radius - 2),
          background: "rgba(15,15,18,0.5)",
        }}
      >
        <Icon name="sparkle" size={Math.round(size * 0.45)} className="text-white" />
      </div>
    </div>
  );
}
