import type { Template, Terrain } from "../core/model";

// Placeholder until step 8 (subsets).
export function CustomTemplateEditor(_props: { terrains: [Terrain, Terrain]; onChange: (t: Template | null, valid: boolean) => void }) {
  return <p className="hint">The custom template editor arrives in a later build step.</p>;
}
