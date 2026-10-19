// Provider namespaces remain distinct even when their numeric IDs match.
export const workIdPattern = /^[vb][1-9]\d{0,8}$/;
export function parseWorkSlug(slug: string): string | undefined {
  if (!/^(?:b)?[1-9]\d{0,8}$/.test(slug)) return;
  return slug.startsWith("b") ? slug : "v" + slug;
}
export function workSlug(id: string): string {
  if (!workIdPattern.test(id)) throw Error("无效作品编号");
  return id.startsWith("v") ? id.slice(1) : id;
}
export function providerLink(id: string): string {
  const slug = workSlug(id);
  return id.startsWith("v")
    ? "https://vndb.org/" + id
    : "https://bgm.tv/subject/" + slug.slice(1);
}
export function providerName(id: string): string {
  workSlug(id);
  return id.startsWith("v") ? "VNDB" : "BGM";
}
