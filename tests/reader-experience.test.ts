import test from "node:test";
import assert from "node:assert/strict";
import { sectionFor, accountReturnPath, withoutFilter, splitSynopsis, claimStartIntent, shelfWorkIds } from "../src/lib/reader-experience.ts";

test("任务导航识别直接链接、分享和旧账号分区", () => {
  assert.equal(sectionFor("/account", "library"), "library");
  assert.equal(sectionFor("/account", "shares"), "saves");
  assert.equal(sectionFor("/s/example"), "saves");
  assert.equal(sectionFor("/account", "security"), "settings");
  assert.equal(sectionFor("/content"), "settings");
  assert.equal(sectionFor("/27448/"), "discover");
});
test("认证返回路径不传递链接分享密钥", () => {
  assert.equal(accountReturnPath("/s/example", "?view=1", "#private-key"), "/s/example?view=1");
  assert.equal(accountReturnPath("/27448/", "?saveVersion=v1", "#player-saves"), "/27448/?saveVersion=v1#player-saves");
});
test("移除一项筛选保留其他条件并重置分页", () => {
  const result = new URL(withoutFilter("?q=ATRI&engine=Artemis&tag=romance&cursor=old&offset=24", "engine"), "https://example.invalid");
  assert.equal(result.pathname, "/");
  assert.equal(result.searchParams.get("q"), "ATRI");
  assert.equal(result.searchParams.get("tag"), "romance");
  assert.equal(result.searchParams.has("engine"), false);
  assert.equal(result.searchParams.has("cursor"), false);
  assert.equal(result.searchParams.has("offset"), false);
});
test("已有中文整理优先展示，未知格式保留全文", () => {
  assert.deepEqual(splitSynopsis("原文\n\n[中文简介]\n中文整理"), { primary: "中文整理", original: "原文" });
  assert.deepEqual(splitSynopsis("未标注语言的原始介绍"), { primary: "未标注语言的原始介绍", original: null });
  assert.deepEqual(splitSynopsis("原文[中文简介]  "), { primary: "原文[中文简介]", original: null });
});
test("单次启动意图不能在刷新、后退或不匹配版本上重复使用", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
  assert.equal(claimStartIntent("nav1", "v1", "v2", storage), false);
  assert.equal(claimStartIntent("nav1", "v1", "v1", storage), true);
  assert.equal(claimStartIntent("nav1", "v1", "v1", storage), false);
  assert.equal(claimStartIntent("nav2", "v1", undefined, storage), false);
  assert.equal(claimStartIntent("nav3", "v1", "v1", { ...storage, setItem() { throw Error("blocked"); } }), false);
});
test("收藏与阅读记录只聚合展示，不修改各自含义", () => {
  const entries = [{ workId: "v1" }, { workId: "v2" }];
  const favorites = ["v2", "v3"];
  assert.deepEqual(shelfWorkIds(entries, favorites), ["v1", "v2", "v3"]);
  assert.deepEqual(entries, [{ workId: "v1" }, { workId: "v2" }]);
  assert.deepEqual(favorites, ["v2", "v3"]);
});
