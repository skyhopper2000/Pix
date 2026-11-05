import { Actions, DockLocation, Layout, type Model, type TabNode } from "flexlayout-react";
import "flexlayout-react/style/combined.css";
import { useCallback, useEffect, useState } from "react";
import { activeTile, activeTileset, history, ui, useHistoryFlags, useProject, useUi } from "../state/app";
import { eventShortcut, findShortcut, isEnabled, layoutBridge } from "./commands";
import { Dialogs } from "./Dialogs";
import { loadLayout, PANELS, resetLayout, saveLayout } from "./layout";
import { CommandPalette, MenuBar } from "./MenuBar";
import { EditorPanel } from "./panels/EditorPanel";
import { PalettePanel } from "./panels/PalettePanel";
import { PreviewPanel } from "./panels/PreviewPanel";
import { ProjectTree } from "./panels/ProjectTree";
import { TileBar } from "./panels/TileBar";
import "./styles.css";

function factory(node: TabNode) {
  switch (node.getComponent()) {
    case "editor":
      return <EditorPanel />;
    case "preview":
      return <PreviewPanel />;
    case "project":
      return <ProjectTree />;
    case "tiles":
      return <TileBar />;
    case "palette":
      return <PalettePanel />;
    default:
      return null;
  }
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const u = ui.get();
      if (u.dialog || u.commandPalette) return;
      const c = findShortcut(eventShortcut(e));
      if (!c) return;
      e.preventDefault();
      if (isEnabled(c)) c.run();
    };
    window.addEventListener("keydown", onKey);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (history.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
}

function StatusBar() {
  const p = useProject();
  const status = useUi((s) => s.status);
  const tool = useUi((s) => s.tool);
  useUi((s) => s.tileId);
  const { dirty } = useHistoryFlags();
  const ts = activeTileset(p);
  const tile = activeTile(p);
  return (
    <div className="statusbar" role="status">
      <span>{status}</span>
      <span className="spacer" />
      {ts && (
        <span>
          {ts.name} · {ts.tileWidth}×{ts.tileHeight}px
        </span>
      )}
      <span>{tile ? tile.name : ts ? "new tile (draft)" : ""}</span>
      <span>tool: {tool}</span>
      <span>{dirty ? "● unsaved" : "saved"}</span>
    </div>
  );
}

export function App() {
  const [model, setModel] = useState<Model>(() => loadLayout());
  const theme = useUi((s) => s.theme);
  const project = useProject();
  const { dirty } = useHistoryFlags();
  useGlobalShortcuts();

  useEffect(() => {
    document.title = `${dirty ? "● " : ""}${project.name} — Tile Studio`;
  }, [project.name, dirty]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const show = useCallback(
    (panel: string) => {
      // Closed tabs and emptied tabsets can linger in the model without a parent, so only trust attached nodes.
      let attached = false;
      const tabsets: string[] = [];
      model.visitNodes((n) => {
        if (n.getId() === panel) attached = true;
        if (n.getType() === "tabset") tabsets.push(n.getId());
      });
      if (attached) {
        model.doAction(Actions.selectTab(panel));
        return;
      }
      const json = { type: "tab" as const, id: panel, name: PANELS[panel], component: panel, enableClose: true };
      const active = model.getActiveTabset()?.getId();
      const anchor = active && tabsets.includes(active) ? active : tabsets[0];
      if (anchor) model.doAction(Actions.addNode(json, anchor, DockLocation.CENTER, -1, true));
      else {
        const root = model.getRootRow();
        if (root) model.doAction(Actions.addNode(json, root.getId(), DockLocation.CENTER, -1, true));
      }
    },
    [model],
  );

  useEffect(() => {
    layoutBridge.show = show;
    layoutBridge.reset = () => {
      setModel(resetLayout());
      ui.set({ status: "Layout reset" });
    };
  }, [show]);

  return (
    <div className="app">
      <MenuBar />
      <div className={"layout-host flexlayout__theme_" + (theme === "dark" ? "dark" : "light")}>
        <Layout model={model} factory={factory} onModelChange={(m) => saveLayout(m)} />
      </div>
      <StatusBar />
      <Dialogs />
      <CommandPalette />
    </div>
  );
}
