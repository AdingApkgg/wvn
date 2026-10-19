import { z } from "zod";
export const provider = z.enum(["vndb", "bgm"]);
export function trustedImageUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ((u.hostname === "t.vndb.org" &&
        /^\/(?:cv|sf)(?:\.t)?\/\d+\/\d+\.(?:jpg|png|webp)$/.test(u.pathname)) ||
        (u.hostname === "lain.bgm.tv" &&
          /^\/(?:r\/\d+\/)?pic\/cover\//.test(u.pathname)))
    );
  } catch {
    return false;
  }
}
const image = z
  .object({
    url: z.string().regex(/^\/media\/[a-f0-9]{64}\.(jpg|png|webp)$/),
    sourceUrl: z.string().refine(trustedImageUrl, "不可信图片来源"),
    source: provider,
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();
const source = z
  .object({ provider, id: z.string().max(20), url: z.string().url() })
  .strict()
  .superRefine((s, ctx) => {
    const expected =
      s.provider === "vndb" && /^v[1-9]\d{0,8}$/.test(s.id)
        ? "https://vndb.org/" + s.id
        : s.provider === "bgm" && /^[1-9]\d{0,8}$/.test(s.id)
          ? "https://bgm.tv/subject/" + s.id
          : "";
    if (!expected || s.url !== expected)
      ctx.addIssue({ code: "custom", message: "来源编号与链接不符" });
  });
export const metadataSchema = z
  .object({
    workId: z.string().regex(/^[vb][1-9]\d{0,8}$/),
    fetchedAt: z.iso.datetime(),
    titles: z
      .array(
        z
          .object({
            title: z.string().min(1).max(300),
            lang: z.string().max(20),
            source: provider,
          })
          .strict(),
      )
      .max(100),
    description: z.string().max(12000),
    descriptionSource: provider.nullable(),
    cover: image.nullable(),
    screenshots: z.array(image).max(6),
    tags: z
      .array(
        z
          .object({ name: z.string().min(1).max(100), source: provider })
          .strict(),
      )
      .max(30),
    released: z.string().max(30).nullable(),
    developers: z.array(z.string().max(300)).max(30),
    languages: z.array(z.string().max(30)).max(40),
    platforms: z.array(z.string().max(40)).max(40),
    ratings: z
      .array(
        z
          .object({
            source: provider,
            score: z.number().min(0).max(10),
            votes: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(2),
    sources: z.array(source).min(1).max(2),
    warnings: z.array(z.string().max(400)).max(10),
  })
  .strict()
  .superRefine((m, ctx) => {
    const match = m.sources.some((s) =>
      m.workId.startsWith("v")
        ? s.provider === "vndb" && s.id === m.workId
        : s.provider === "bgm" && "b" + s.id === m.workId,
    );
    if (!match)
      ctx.addIssue({ code: "custom", message: "元数据来源与作品编号不符" });
  });
export const metadataDocument = z
  .object({
    schemaVersion: z.literal(1),
    fetchedAt: z.iso.datetime(),
    works: z.array(metadataSchema).max(1000),
  })
  .strict();
export type WorkMetadata = z.infer<typeof metadataSchema>;
export type MetadataImage = z.infer<typeof image>;
export function sourceText(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, "")
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?(?:b|i|u|s|url|quote|raw|code)(?:=[^\]]*)?\]/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, 12000);
}
