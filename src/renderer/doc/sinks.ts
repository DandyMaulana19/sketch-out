import type { SketchOutApi } from "../../preload/api";
import type { DocSink } from "./documentSession";

export function makeLocalSink(
  api: Pick<SketchOutApi, "files">,
  target: { path: string | null; recoveryId: string | null },
  onMtime: (mtimeMs: number) => void,
): DocSink {
  return {
    async save(json) {
      if (target.path) {
        const { mtimeMs } = await api.files.write({ path: target.path, json });
        onMtime(mtimeMs);
      } else if (target.recoveryId) {
        await api.files.writeRecovery({ recoveryId: target.recoveryId, json });
      }
    },
  };
}
