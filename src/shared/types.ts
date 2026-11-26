export type SceneJSON = string;
export type DocRef =
  | { kind: "local"; path: string | null }
  | { kind: "drive"; localId: string; fileId: string | null };
