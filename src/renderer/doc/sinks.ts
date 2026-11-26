import type { SketchOutApi } from "../../preload/api";
import type { DocSink } from "./documentSession";

function hasVisibleElements(json: string): boolean {
  try {
    const els = (JSON.parse(json) as { elements?: { isDeleted?: boolean }[] }).elements ?? [];
    return els.some((e) => !e.isDeleted);
  } catch {
    return true;
  }
}

export function makeLocalSink(
  api: { files: Pick<SketchOutApi["files"], "write" | "writeRecovery" | "clearRecovery"> },
  target: { path: string | null; recoveryId: string | null },
  onMtime: (mtimeMs: number) => void,
): DocSink {
  return {
    async save(json) {
      if (target.path) {
        const { mtimeMs } = await api.files.write({ path: target.path, json });
        onMtime(mtimeMs);
      } else if (target.recoveryId) {
        if (hasVisibleElements(json)) await api.files.writeRecovery({ recoveryId: target.recoveryId, json });
        else await api.files.clearRecovery({ recoveryId: target.recoveryId });
      }
    },
  };
}

/** Drive documents are saved to the local offline cache; the main-process SyncEngine uploads them. */
export function makeDriveSink(api: Pick<SketchOutApi, "sync">, localId: string): DocSink {
  return { save: (json) => api.sync.save({ localId, json }) };
}
