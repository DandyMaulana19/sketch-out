import { contextBridge } from "electron";
contextBridge.exposeInMainWorld("sketchOut", { version: 1 });
