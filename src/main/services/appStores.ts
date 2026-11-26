import { join } from "node:path";
import { app } from "electron";
import type { DriveFileInfo } from "@shared/types";
import { createJsonStore, type JsonStore } from "./store";

export interface AppState {
  recent: string[];
  theme: "light" | "dark";
  langCode: string;
  driveFolderId: string | null;
  driveListCache: DriveFileInfo[];
}

let appStore: JsonStore<AppState> | null = null;
let libraryStore: JsonStore<{ items: unknown[] }> | null = null;

export function getAppStore(): JsonStore<AppState> {
  appStore ??= createJsonStore<AppState>(join(app.getPath("userData"), "settings.json"), {
    recent: [],
    theme: "light",
    langCode: "id-ID",
    driveFolderId: null,
    driveListCache: [],
  });
  return appStore;
}

export function getLibraryStore(): JsonStore<{ items: unknown[] }> {
  libraryStore ??= createJsonStore(join(app.getPath("userData"), "library.json"), { items: [] as unknown[] });
  return libraryStore;
}
