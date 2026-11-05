import { describe, expect, it } from "vitest";
import * as ops from "../core/ops";
import { ProjectHistory } from "./history";

describe("ProjectHistory", () => {
  it("undoes and redoes commands", () => {
    const h = new ProjectHistory(ops.createProject("a"));
    h.dispatch("Rename", (p) => ops.renameProject(p, "b"));
    expect(h.project.name).toBe("b");
    expect(h.dirty).toBe(true);
    h.undo();
    expect(h.project.name).toBe("a");
    expect(h.dirty).toBe(false);
    h.redo();
    expect(h.project.name).toBe("b");
  });

  it("ignores no-op commands", () => {
    const h = new ProjectHistory(ops.createProject("a"));
    h.dispatch("Nothing", (p) => p);
    expect(h.canUndo).toBe(false);
  });

  it("records a gesture as one entry", () => {
    const h = new ProjectHistory(ops.createProject("a"));
    h.preview((p) => ops.renameProject(p, "b"));
    h.preview((p) => ops.renameProject(p, "c"));
    expect(h.project.name).toBe("c");
    expect(h.canUndo).toBe(false);
    h.commit("Stroke");
    expect(h.undoLabel).toBe("Stroke");
    h.undo();
    expect(h.project.name).toBe("a");
  });

  it("cancels a gesture", () => {
    const h = new ProjectHistory(ops.createProject("a"));
    h.preview((p) => ops.renameProject(p, "b"));
    h.cancel();
    expect(h.project.name).toBe("a");
    expect(h.canUndo).toBe(false);
  });

  it("clears redo on a new command", () => {
    const h = new ProjectHistory(ops.createProject("a"));
    h.dispatch("1", (p) => ops.renameProject(p, "b"));
    h.undo();
    h.dispatch("2", (p) => ops.renameProject(p, "c"));
    expect(h.canRedo).toBe(false);
  });
});
