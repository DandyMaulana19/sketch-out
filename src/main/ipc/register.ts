import { ipcMain, type IpcMain, type IpcMainInvokeEvent, type WebFrameMain } from "electron";
import type { z } from "zod";
import { isAppUrl } from "../security";

export function isTrustedSender(frame: Pick<WebFrameMain, "url"> | null | undefined): boolean {
  return !!frame && isAppUrl(frame.url);
}

export type Handle = <S extends z.ZodType, R>(
  channel: string,
  schema: S,
  fn: (input: z.infer<S>, e: IpcMainInvokeEvent) => Promise<R> | R,
) => void;

export function makeHandle(ipc: Pick<IpcMain, "handle">): Handle {
  return (channel, schema, fn) => {
    ipc.handle(channel, async (e, raw) => {
      if (!isTrustedSender(e.senderFrame)) throw new Error("Untrusted sender");
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`Invalid input for ${channel}`);
      return fn(parsed.data, e);
    });
  };
}

export const handle: Handle = makeHandle(ipcMain);
