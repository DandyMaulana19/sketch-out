import { describe, it, expect } from "vitest";
import { createPkcePair, challengeFor } from "../../src/main/services/auth/pkce";

describe("PKCE", () => {
  it("matches the RFC 7636 test vector", () => {
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("creates a valid verifier with its matching challenge", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(challengeFor(verifier));
    expect(createPkcePair().verifier).not.toBe(verifier);
  });
});
