import type { Platform } from "./types";
import { webPlatform } from "./web";

export type * from "./types";

const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let cached: Promise<Platform> | null = null;

/** The platform for the current runtime. The Tauri module is loaded lazily so the web build never calls into it. */
export function getPlatform(): Promise<Platform> {
  cached ??= isTauri() ? import("./tauri").then((m) => m.tauriPlatform) : Promise.resolve(webPlatform);
  return cached;
}
