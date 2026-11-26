import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConnectivity } from "../../src/main/services/connectivity";

describe("connectivity", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls the OS every 15 s and reports only changes", () => {
    let os = true;
    const onChange = vi.fn();
    const c = createConnectivity({ isOnline: () => os, onChange, pollMs: 15000 });
    vi.advanceTimersByTime(15000);
    expect(onChange).not.toHaveBeenCalled();
    os = false;
    vi.advanceTimersByTime(15000);
    expect(onChange).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(15000);
    expect(onChange).toHaveBeenCalledTimes(1);
    c.stop();
  });

  it("accepts reports from renderer windows", () => {
    const onChange = vi.fn();
    const c = createConnectivity({ isOnline: () => true, onChange, pollMs: 15000 });
    c.report(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    c.report(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(c.current()).toBe(true);
    c.stop();
  });
});
