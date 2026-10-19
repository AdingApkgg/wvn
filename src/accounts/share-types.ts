import type { SaveFile } from "./saves.server";
export type ShareText = {
  title: string;
  description: string;
  progress: "chapter" | "route" | "complete" | "unlock" | "other";
  spoiler: boolean;
};
export type ShareInput = ShareText & {
  profileId: string;
  generation: number;
  revisionId: string;
  mode: "public" | "link";
  days?: number;
  requestId: string;
};
export type ShareView = ShareText & {
  id: string;
  mode: "public" | "link";
  work: { id: string; title: string; url: string };
  version: {
    id: string;
    title: string;
    number: number;
    engine: string;
    url: string;
  };
  author: string;
  createdAt: number;
  expiresAt: number | null;
  files: SaveFile[];
  bytes: number;
  claims: number;
  integrity: "sha256";
  compatibility: "author-declared";
};
export type OwnShare = ShareView & {
  state: string;
  metadataRevision: number;
  pending: ShareText | null;
};
export type SharePage<T = ShareView> = { items: T[]; next: string | null };
