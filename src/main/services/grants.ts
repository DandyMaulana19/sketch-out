import { resolve } from "node:path";

/** Paths the user explicitly chose (dialogs, Finder, recent list). The renderer may only touch these. */
const granted = new Set<string>();
export function grantPath(p: string): string {
  const abs = resolve(p);
  granted.add(abs);
  return abs;
}
export function assertGranted(p: string): string {
  const abs = resolve(p);
  if (!granted.has(abs)) throw new Error("Path not permitted");
  return abs;
}
