import { createHash, randomBytes } from "node:crypto";

export const challengeFor = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url");

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url"); // 64 chars
  return { verifier, challenge: challengeFor(verifier) };
}
