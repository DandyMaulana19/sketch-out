import { randomBytes } from "node:crypto";
import { rename as fsRename, unlink, writeFile } from "node:fs/promises";

interface Io {
  rename: (from: string, to: string) => Promise<void>;
}

/** Write to `<path>.tmp-<rand>` then rename over the target, so a crash never leaves a half-written file. */
export async function atomicWriteFile(path: string, data: string, io: Io = { rename: fsRename }): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(tmp, data, "utf8");
    await io.rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
