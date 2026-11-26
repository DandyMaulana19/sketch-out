/** Tracks whether window closes are part of an app quit (⌘Q), so a cancelled close also cancels the quit. */
export class QuitState {
  private quitting = false;
  beforeQuit(): void {
    this.quitting = true;
  }
  /** The user backed out of closing a window (Batal, or cancelled the save dialog). */
  closeCancelled(): void {
    this.quitting = false;
  }
  /** After a window was force-closed: should the app keep quitting? */
  afterForcedClose(): boolean {
    return this.quitting;
  }
}
