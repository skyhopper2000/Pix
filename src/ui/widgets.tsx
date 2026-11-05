import { useEffect, useRef, type ReactNode } from "react";
import { useUi } from "../state/app";
import { drawChecker, fitCanvas, tileCanvas } from "./render";

/** A tile drawn at integer scale on a checkerboard. */
export function TileThumb({ pixels, w, h, size, title }: { pixels: Uint8ClampedArray | null; w: number; h: number; size: number; title?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useUi((s) => s.theme === "dark");
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const scale = Math.max(1, Math.floor(size / Math.max(w, h)));
    const cw = w * scale;
    const ch = h * scale;
    const ctx = fitCanvas(c, cw, ch);
    drawChecker(ctx, 0, 0, cw, ch, Math.max(2, scale * 2), dark);
    if (pixels) ctx.drawImage(tileCanvas(pixels, w, h), 0, 0, cw, ch);
  }, [pixels, w, h, size, dark]);
  return <canvas ref={ref} className="tile-thumb" title={title} />;
}

export function Modal({ title, children, onClose, footer, width = 420 }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title} style={{ width }}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, width = 64, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; width?: number; label?: string }) {
  return (
    <input
      type="number"
      aria-label={label}
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      step={step}
      style={{ width }}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function IconButton({ title, onClick, children, active, disabled }: { title: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={"icon-btn" + (active ? " active" : "")} title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
