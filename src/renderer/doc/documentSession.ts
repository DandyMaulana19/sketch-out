export interface DocSink {
  save(json: string): Promise<void>;
}

export type SaveStatus = "saved" | "saving" | "pending" | "error";
export interface SessionStatus {
  status: SaveStatus;
  error: string | null;
}

type Files = Record<string, unknown>;

export interface SessionOptions<E> {
  sink: DocSink;
  delayMs: number;
  fingerprint: (elements: readonly E[]) => string;
  serialize: (elements: readonly E[], appState: object, files: Files) => string;
  onStatus: (s: SessionStatus) => void;
}

const KNOWN_ERRORS = ["File tidak ditemukan", "Perlu login ulang"];

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return KNOWN_ERRORS.find((k) => msg.includes(k)) ?? "Gagal menyimpan";
}

/** Debounced, change-detecting saver for one open document. Storage is delegated to a DocSink. */
export class DocumentSession<E> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedKey: string | null = null;
  private latest: { elements: readonly E[]; appState: object; files: Files; key: string } | null = null;
  private inFlight: Promise<void> | null = null;
  private disposed = false;

  constructor(private opts: SessionOptions<E>) {}

  setSink(sink: DocSink): void {
    this.opts.sink = sink;
  }

  /** Record the content that is already persisted (e.g. just loaded) so it is not re-saved. */
  markSaved(elements: readonly E[], files: Files): void {
    this.lastSavedKey = this.key(elements, files);
  }

  get hasUnsavedChanges(): boolean {
    return !!this.latest && this.latest.key !== this.lastSavedKey;
  }

  onChange(elements: readonly E[], appState: object, files: Files): void {
    const key = this.key(elements, files);
    if (key === this.lastSavedKey && !this.timer) return;
    if (this.latest && key === this.latest.key && this.timer) return;
    this.latest = { elements, appState, files, key };
    if (key === this.lastSavedKey) return;
    this.emit("pending");
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.opts.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.run();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async run(): Promise<void> {
    if (this.inFlight) {
      await this.inFlight;
      return this.run();
    }
    const snap = this.latest;
    if (!snap || snap.key === this.lastSavedKey) return;
    this.emit("saving");
    this.inFlight = (async () => {
      try {
        await this.opts.sink.save(this.opts.serialize(snap.elements, snap.appState, snap.files));
        this.lastSavedKey = snap.key;
        if (this.latest?.key === snap.key) this.emit("saved");
      } catch (err) {
        this.emit("error", friendlyError(err));
      } finally {
        this.inFlight = null;
      }
    })();
    await this.inFlight;
    // Re-run only for changes that arrived during the save; a failed save waits for the next edit or flush.
    if (this.latest && this.latest.key !== snap.key && !this.timer && !this.disposed) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.run();
      }, this.opts.delayMs);
    }
  }

  private key(elements: readonly E[], files: Files): string {
    return `${this.opts.fingerprint(elements)}|${Object.keys(files).sort().join(",")}`;
  }

  private emit(status: SaveStatus, error: string | null = null): void {
    if (!this.disposed) this.opts.onStatus({ status, error });
  }
}
