import { useEffect, useState } from "react";
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from "../../state/prefs";
import { ui, useUi } from "../../state/app";
import { bindableCommands, eventShortcut, shortcutOf, type Command } from "../commands";
import { Modal } from "../widgets";

const close = () => ui.set({ dialog: null });

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="pref-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Sets one command's shortcut. Any other command using the same keys loses them. */
function assign(id: string, keys: string): string | null {
  const overrides = { ...ui.get().shortcuts };
  let taken: string | null = null;
  if (keys) {
    for (const c of bindableCommands()) {
      if (c.id !== id && shortcutOf(c, overrides) === keys) {
        overrides[c.id] = "";
        taken = c.label;
      }
    }
  }
  const def = bindableCommands().find((c) => c.id === id)?.shortcut ?? "";
  if (keys === def) delete overrides[id];
  else overrides[id] = keys;
  ui.set({ shortcuts: overrides });
  return taken;
}

function ShortcutRow({ c, capturing, onCapture }: { c: Command; capturing: boolean; onCapture: (on: boolean) => void }) {
  const overrides = useUi((s) => s.shortcuts);
  const current = shortcutOf(c, overrides);
  const changed = c.id in overrides;
  return (
    <div className={"shortcut-row" + (capturing ? " capturing" : "")}>
      <span className="muted shortcut-menu">{c.menu}</span>
      <span className="shortcut-label">{c.label}</span>
      <button type="button" className="shortcut-key" title="Click, then press the new key combination (Esc cancels)" onClick={() => onCapture(!capturing)}>
        {capturing ? "Press keys…" : current || <span className="muted">none</span>}
      </button>
      <button type="button" className="icon-btn" title="Remove shortcut" aria-label={`Remove shortcut for ${c.label}`} disabled={!current} onClick={() => assign(c.id, "")}>
        ✕
      </button>
      <button type="button" className="icon-btn" title="Restore default shortcut" aria-label={`Restore default shortcut for ${c.label}`} disabled={!changed} onClick={() => assign(c.id, c.shortcut ?? "")}>
        ↺
      </button>
    </div>
  );
}

function ShortcutEditor() {
  const [capturing, setCapturing] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [note, setNote] = useState("");
  const hasOverrides = useUi((s) => Object.keys(s.shortcuts).length > 0);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const keys = eventShortcut(e);
      if (!keys) return; // a modifier on its own: keep waiting
      const taken = assign(capturing, keys);
      setNote(taken ? `${keys} was removed from "${taken}".` : "");
      setCapturing(null);
    };
    // Capture phase, so the dialog's Escape handler and global shortcuts never see the key.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  const q = filter.trim().toLowerCase();
  const list = bindableCommands().filter((c) => !q || `${c.menu} ${c.label}`.toLowerCase().includes(q));

  return (
    <section className="pref-section">
      <h3>Keyboard shortcuts</h3>
      <div className="shortcut-tools">
        <input placeholder="Filter commands…" aria-label="Filter commands" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" disabled={!hasOverrides} onClick={() => (ui.set({ shortcuts: {} }), setNote("All shortcuts restored to defaults."))}>
          Restore all defaults
        </button>
      </div>
      <p className="hint">Click a shortcut, then press the new key combination. Esc cancels.</p>
      {note && <p className="hint pref-note">{note}</p>}
      <div className="shortcut-list">
        {list.map((c) => (
          <ShortcutRow key={c.id} c={c} capturing={capturing === c.id} onCapture={(on) => setCapturing(on ? c.id : null)} />
        ))}
        {list.length === 0 && <p className="muted">No matching commands</p>}
      </div>
    </section>
  );
}

export function PreferencesDialog() {
  const theme = useUi((s) => s.theme);
  const pixelPerfect = useUi((s) => s.pixelPerfect);
  const previewGrid = useUi((s) => s.previewGrid);
  const highlightUses = useUi((s) => s.highlightUses);
  const slotGuides = useUi((s) => s.slotGuides);
  const fontScale = useUi((s) => s.fontScale);
  const pct = Math.round(fontScale * 100);

  return (
    <Modal
      title="Preferences"
      onClose={close}
      width={600}
      footer={
        <button type="button" className="primary" onClick={close}>
          Done
        </button>
      }
    >
      <div className="prefs">
        <section className="pref-section">
          <h3>Appearance</h3>
          <Toggle label="Light mode" checked={theme === "light"} onChange={(v) => ui.set({ theme: v ? "light" : "dark" })} />
          <label className="pref-slider">
            <span>Font size</span>
            <input
              type="range"
              min={FONT_SCALE_MIN * 100}
              max={FONT_SCALE_MAX * 100}
              step={5}
              value={pct}
              aria-label="Font size"
              onChange={(e) => ui.set({ fontScale: e.target.valueAsNumber / 100 })}
            />
            <span className="pref-value">{pct}%</span>
            <button type="button" disabled={pct === 100} onClick={() => ui.set({ fontScale: 1 })}>
              Reset
            </button>
          </label>
        </section>

        <section className="pref-section">
          <h3>Drawing</h3>
          <Toggle label="Pixel-perfect strokes" checked={pixelPerfect} onChange={(v) => ui.set({ pixelPerfect: v })} hint="Removes L-shaped corners from the stroke being drawn" />
          <Toggle label="Slot guides" checked={slotGuides} onChange={(v) => ui.set({ slotGuides: v })} hint="Faint expected-shape overlay in empty template slots" />
        </section>

        <section className="pref-section">
          <h3>Preview</h3>
          <Toggle label="Preview grid" checked={previewGrid} onChange={(v) => ui.set({ previewGrid: v })} />
          <Toggle label="Highlight uses of selected tile" checked={highlightUses} onChange={(v) => ui.set({ highlightUses: v })} />
        </section>

        <ShortcutEditor />
      </div>
    </Modal>
  );
}
