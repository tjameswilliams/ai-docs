import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  width?: number | string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, width = 560, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="flex flex-col max-h-[90vh] overflow-hidden"
        style={{
          width,
          maxWidth: "92vw",
          background: "#1f1f23",
          border: "1px solid #3f3f46",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className="flex items-center px-4 shrink-0"
            style={{
              height: 44,
              borderBottom: "1px solid #27272a",
              fontSize: 13,
              fontWeight: 500,
              color: "#fafafa",
            }}
          >
            {title}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
            style={{ borderTop: "1px solid #27272a", background: "#18181b" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
