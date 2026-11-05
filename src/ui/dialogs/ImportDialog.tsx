import { ui } from "../../state/app";
import { Modal } from "../widgets";

// Placeholder until step 9 (dialogs).
export function ImportDialog(_props: { fileName: string; bytes: Uint8Array }) {
  return (
    <Modal title="Not yet available" onClose={() => ui.set({ dialog: null })}>
      <p>This dialog arrives in a later build step.</p>
    </Modal>
  );
}
