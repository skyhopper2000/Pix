import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ContextItem {
  label: string;
  run: () => void;
  disabled?: boolean;
  /** Draw a separator above this item. */
  sep?: boolean;
  danger?: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextItem[];
}

/** Local state for one panel's right-click menu: `open(e, items)` from onContextMenu, render `<ContextMenu>`. */
export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const open = useCallback((e: React.MouseEvent, items: ContextItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);
  const close = useCallback(() => setMenu(null), []);
  return { menu, open, close };
}

/** A small popup menu at the pointer. Closes on click outside, Escape, scroll, resize or window blur. */
export function ContextMenu({ menu, onClose }: { menu: ContextMenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Keep the menu on screen.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.max(0, Math.min(menu.x, window.innerWidth - r.width - 4)), y: Math.max(0, Math.min(menu.y, window.innerHeight - r.height - 4)) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("wheel", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return createPortal(
    <div
      ref={ref}
      className="menu-dropdown context-menu"
      role="menu"
      style={{ position: "fixed", left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="menu-sep" />}
          <button
            type="button"
            role="menuitem"
            className={"menu-item" + (it.danger ? " danger" : "")}
            disabled={it.disabled}
            autoFocus={i === 0}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span className="menu-check" />
            <span className="menu-label">{it.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
