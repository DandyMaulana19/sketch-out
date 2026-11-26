import type { DocRef } from "../../shared/types";

export type Doc =
  | { kind: "local"; path: string | null; recoveryId: string | null; json: string | null; mtimeMs: number | null; recovered: boolean; reloaded?: boolean }
  | { kind: "drive"; localId: string; fileId: string | null; name: string; json: string };

export function refOf(doc: Doc, path: string | null): DocRef {
  return doc.kind === "local" ? { kind: "local", path } : { kind: "drive", localId: doc.localId, fileId: doc.fileId };
}
