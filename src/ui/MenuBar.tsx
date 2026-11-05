import { useEffect, useMemo, useRef, useState } from "react";
import { ui, useHistoryFlags, useProject, useUi } from "../state/app";
import { commands, isEnabled, MENUS, type Command } from "./commands";

export function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Re-render when state that affects enabled/checked changes.
  useProject();
  useHistoryFlags();
  useUi((s) => s);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (c: Command) => {
    setOpen(null);
    if (isEnabled(c)) c.run();
  };

  return (
    <div className="menubar" ref={ref} role="menubar">
      <span className="app-mark" aria-hidden>
        ▦
      </span>
      {MENUS.map((m) => (
        <div key={m} className="menu-root">
          <button type="button" role="menuitem" className={"menu-title" + (open === m ? " open" : "")} onMouseDown={() => setOpen(open === m ? null : m)} onMouseEnter={() => open && setOpen(m)}>
            {m}
          </button>
          {open === m && (
            <div className="menu-dropdown" role="menu">
              {commands
                .filter((c) => c.menu === m && !c.hidden)
                .map((c, i) => (
                  <div key={c.id}>
                    {c.sep && i > 0 && <div className="menu-sep" />}
                    <button type="button" role="menuitem" className="menu-item" disabled={!isEnabled(c)} onClick={() => run(c)}>
                      <span className="menu-check">{c.checked?.() ? "✓" : ""}</span>
                      <span className="menu-label">{c.label}</span>
                      <span className="menu-shortcut">{c.shortcut ?? ""}</span>
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CommandPalette() {
  const open = useUi((s) => s.commandPalette);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);
  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => !c.hidden && isEnabled(c) && words.every((w) => `${c.menu} ${c.label}`.toLowerCase().includes(w)));
  }, [q, open]);
  const close = () => {
    setQ("");
    setSel(0);
    ui.set({ commandPalette: false });
  };
  const run = (c: Command | undefined) => {
    close();
    if (c) setTimeout(c.run, 0);
  };
  const latest = useRef({ items, sel });
  latest.current = { items, sel };
  useEffect(() => {
    if (!open) return;
    // Capture phase, so the docking layout's own keyboard handling can't swallow these keys.
    const onKey = (e: KeyboardEvent) => {
      const { items, sel } = latest.current;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown") setSel(Math.min(items.length - 1, sel + 1));
      else if (e.key === "ArrowUp") setSel(Math.max(0, sel - 1));
      else if (e.key === "Enter") run(items[sel]);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  if (!open) return null;
  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette-box" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          placeholder="Type a command…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
        />
        <div className="palette-list">
          {items.map((c, i) => (
            <button type="button" key={c.id} className={"palette-item" + (i === sel ? " sel" : "")} onMouseEnter={() => setSel(i)} onClick={() => run(c)}>
              <span className="palette-cat">{c.menu}:</span> {c.label}
              <span className="menu-shortcut">{c.shortcut ?? ""}</span>
            </button>
          ))}
          {items.length === 0 && <div className="palette-empty">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
