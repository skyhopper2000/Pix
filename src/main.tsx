import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as actions from "./state/actions";
import { history, ui } from "./state/app";
import { App } from "./ui/App";

// Dev-only handle for inspecting state from the browser console / automated checks.
if (import.meta.env.DEV) Object.assign(window, { __pix: { history, ui, actions } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
