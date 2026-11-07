import { useState } from "react";
import { pack, parseHex, toHex, toHex6, unpack } from "../../core/color";
import type { Color } from "../../core/model";
import { addPaletteColors, removePaletteColor, replacePaletteColor, setPaletteLocked } from "../../core/ops";
import * as A from "../../state/actions";
import { history, ui, useProject, useUi } from "../../state/app";
import { IconButton } from "../widgets";

const css = (c: Color) => {
  const [r, g, b, a] = unpack(c);
  return `rgba(${r},${g},${b},${a / 255})`;
};

function ColorEditor({ label, color, onChange }: { label: string; color: Color; onChange: (c: Color) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [r, g, b, a] = unpack(color);
  return (
    <div className="color-editor">
      <span className="swatch big" style={{ background: css(color) }} title={label} />
      <input type="color" aria-label={`${label} colour`} value={toHex6(color)} onChange={(e) => onChange(((parseHex(e.target.value)! & 0xffffff00) | a) >>> 0)} />
      <input
        className="hex-input"
        aria-label={`${label} hex`}
        value={text ?? toHex(color)}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseHex(e.target.value);
          if (v !== null) onChange(v);
        }}
        onBlur={() => setText(null)}
      />
      <label className="alpha" title="Alpha">
        α
        <input type="range" min={0} max={255} value={a} aria-label={`${label} alpha`} onChange={(e) => onChange(pack(r, g, b, e.target.valueAsNumber))} />
      </label>
    </div>
  );
}

export function PalettePanel() {
  const p = useProject();
  const primary = useUi((s) => s.primary);
  const secondary = useUi((s) => s.secondary);
  const [selected, setSelected] = useState<number | null>(null);
  const colors = p.palette.colors;

  return (
    <div className="panel palette-panel">
      <div className="palette-current">
        <ColorEditor label="Primary" color={primary} onChange={(c) => ui.set({ primary: c })} />
        <ColorEditor label="Secondary" color={secondary} onChange={(c) => ui.set({ secondary: c })} />
      </div>
      <div className="panel-toolbar">
        <IconButton title="Add primary colour to palette" onClick={() => history.dispatch("Add colour", (pr) => addPaletteColors(pr, [primary]))}>
          ＋
        </IconButton>
        <IconButton title="Replace selected swatch with primary colour" disabled={selected === null} onClick={() => selected !== null && history.dispatch("Edit colour", (pr) => replacePaletteColor(pr, selected, primary))}>
          ✎
        </IconButton>
        <IconButton
          title="Remove selected swatch"
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            history.dispatch("Remove colour", (pr) => removePaletteColor(pr, selected));
            setSelected(null);
          }}
        >
          −
        </IconButton>
        <label className="check" title="Palette-locked: drawing tools only use palette colours">
          <input type="checkbox" checked={p.palette.locked} onChange={(e) => history.dispatch(e.target.checked ? "Lock palette" : "Unlock palette", (pr) => setPaletteLocked(pr, e.target.checked))} />
          Locked
        </label>
        <span className="spacer" />
        <IconButton title="Import palette (.gpl, .hex, .pal, Lospec .json, or the colours of an image)" onClick={() => void A.importPalette()}>
          ⤓
        </IconButton>
        <IconButton title="Export palette as .gpl" disabled={!colors.length} onClick={() => void A.exportPalette("gpl")}>
          ⤒
        </IconButton>
      </div>
      <div className="swatches" role="listbox" aria-label="Palette">
        {colors.map((c, i) => (
          <button
            type="button"
            role="option"
            aria-selected={selected === i}
            key={i}
            className={"swatch" + (c === primary ? " primary" : "") + (selected === i ? " sel" : "")}
            style={{ background: css(c) }}
            title={`${toHex(c)} — click: primary, right-click: secondary`}
            onClick={() => {
              setSelected(i);
              ui.set({ primary: c });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelected(i);
              ui.set({ secondary: c });
            }}
          />
        ))}
        {colors.length === 0 && <div className="hint">Empty palette. Add colours with ＋, or use Import to load a palette file or the colours of an image (up to 256).</div>}
      </div>
    </div>
  );
}
