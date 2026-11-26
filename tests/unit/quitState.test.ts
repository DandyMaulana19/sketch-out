import { describe, it, expect } from "vitest";
import { QuitState } from "../../src/main/quitState";

describe("QuitState", () => {
  it("continues quitting after a window closes during a quit", () => {
    const q = new QuitState();
    q.beforeQuit();
    expect(q.afterForcedClose()).toBe(true);
  });
  it("cancelling the save dialog from the close prompt cancels the whole quit", () => {
    const q = new QuitState();
    q.beforeQuit();
    q.closeCancelled();
    expect(q.afterForcedClose()).toBe(false);
  });
  it("a normal window close does not quit the app", () => {
    expect(new QuitState().afterForcedClose()).toBe(false);
  });
});
