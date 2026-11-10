import { test, expect, type Page } from "@playwright/test";
import { authenticator, register, api } from "../helpers/account-browser";
import { RULE_QUESTIONS } from "../../src/content/quiz";
test.afterEach(async({page},info)=>{await page.screenshot({path:info.outputPath("screen.png"),fullPage:false});});

async function qualifiedShelf(page: Page) {
  await page.goto("/health");await authenticator(page);expect((await register(page,"草稿保护读者")).status).toBe(200);
  const attempt=(await api(page,"/api/me/content/attempts",{})).data;
  const answers=Object.fromEntries(attempt.questions.map((question:any)=>[question.id,RULE_QUESTIONS.find(rule=>rule.id===question.id)!.correctChoiceId]));
  expect((await api(page,`/api/me/content/attempts/${attempt.id}/submit`,{answers})).status).toBe(200);
  expect((await api(page,"/api/me/content/mode",{mode:"restricted"},"PATCH")).status).toBe(200);
  expect((await api(page,"/api/me/library/v27448",{revision:0,status:"wanted",note:"原笔记"},"PATCH")).status).toBe(200);
  await page.goto("/account?tab=library");
  const row=page.locator('[data-shelf-work="v27448"]');await row.getByRole("button",{name:"编辑阅读记录"}).click();
  await row.getByLabel("私人笔记").fill("仍需保存的草稿");return row;
}

test("独立请求降为公共投影时只改状态不会清空原笔记",async({page})=>{
  const row=await qualifiedShelf(page);await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();
  await expect(row.getByRole("status")).toContainText("阅读记录已保存");
  await page.route("**/api/me/library",async route=>{
    const response=await route.fetch(),entries=await response.json();await route.fulfill({response,json:entries.map((entry:any)=>({...entry,note:"",noteHidden:true}))});
  });
  await page.goto("/account?tab=library");await row.getByRole("button",{name:"编辑阅读记录"}).click();
  await expect(row.getByLabel("私人笔记")).toBeDisabled();
  await row.getByRole("combobox",{name:"阅读状态",exact:true}).selectOption("paused");
  const updated=page.waitForRequest(request=>request.url().endsWith("/api/me/library/v27448")&&request.method()==="PATCH");
  await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();
  expect((await updated).postDataJSON()).toEqual({revision:2,status:"paused"});
  await expect(row.getByRole("status")).toContainText("阅读记录已保存");
  await page.unroute("**/api/me/library");
  expect((await api(page,"/api/me/library")).data.find((entry:any)=>entry.workId==="v27448").note).toBe("仍需保存的草稿");
});

test("窗口复查资格后保留同账号书架草稿",async({page})=>{
  const row=await qualifiedShelf(page);
  const response=page.waitForResponse(response=>response.url().endsWith("/api/me/content")&&response.status()===200);
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await response;
  await expect(row.getByLabel("私人笔记")).toHaveValue("仍需保存的草稿");
});

test("取消阅读离开确认不会推进服务端记录",async({page})=>{
  const row=await qualifiedShelf(page),before=(await api(page,"/api/me/library")).data;
  await row.getByRole("button",{name:"开始阅读",exact:true}).click();
  const dialog=page.getByRole("alertdialog",{name:"有尚未保存的阅读记录"});await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"返回编辑",exact:true}).click();
  expect((await api(page,"/api/me/library")).data).toEqual(before);
  await expect(row.getByLabel("私人笔记")).toHaveValue("仍需保存的草稿");
  await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();
  await expect(row.getByRole("status")).toContainText("阅读记录已保存");
});

test("公共备份清除选中文件名并以中性名称下载",async({page})=>{
  const row=await qualifiedShelf(page);await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();
  await expect(row.getByRole("status")).toContainText("阅读记录已保存");
  await page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"存档",exact:true}).click();
  const select=page.getByRole("combobox",{name:"存档所属版本"}),version=await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(version!);await page.locator(".backup-upload > summary").click();
  const file=page.getByLabel("游戏导出的存档文件");await file.setInputFiles({name:"私人章节.dat",mimeType:"application/octet-stream",buffer:Buffer.from("safe-fixture")});
  await page.getByRole("button",{name:"上传为新的云端备份"}).click();await expect(page.getByRole("link",{name:"下载 私人章节.dat",exact:true})).toBeVisible();
  await file.setInputFiles({name:"未上传私密名称.dat",mimeType:"application/octet-stream",buffer:Buffer.from("not-uploaded")});
  expect((await api(page,"/api/me/content/mode",{mode:"public"},"PATCH")).status).toBe(200);
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent("storage",{key:"wg-content-change",newValue:"public-test"})));
  await expect.poll(()=>file.evaluate((input:HTMLInputElement)=>input.files?.length)).toBe(0);
  const downloaded=page.waitForEvent("download");await page.getByRole("link",{name:"下载 文件 1",exact:true}).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^backup-file-1(?:\.[a-z0-9]+)?$/);
});

test("资源加载失败在阅读主区提供恢复入口",async({page})=>{
  const row=await qualifiedShelf(page);await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();await expect(row.getByRole("status")).toContainText("阅读记录已保存");
  await page.route("**/api/player/*/resources",route=>route.fulfill({status:503,json:{code:"CONTENT_UNAVAILABLE"}}));
  await page.goto("/27448/1/");await page.getByRole("button",{name:"开始阅读",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("加载未完成");
  await page.getByRole("button",{name:"返回阅读准备",exact:true}).click();
  await expect(page.getByRole("button",{name:"开始阅读",exact:true})).toBeEnabled();
});

test("统一确认支持键盘取消并返回触发控件",async({page})=>{
  const row=await qualifiedShelf(page);await row.getByRole("button",{name:"保存阅读记录",exact:true}).click();await expect(row.getByRole("status")).toContainText("阅读记录已保存");
  await page.goto("/27448/1/");await page.getByRole("button",{name:"存档与备份",exact:true}).click();
  const trigger=page.getByRole("button",{name:"备份到云端",exact:true});await expect(trigger).toBeEnabled();await trigger.focus();await page.keyboard.press("Enter");
  const dialog=page.getByRole("alertdialog",{name:"备份到当前账号？"});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button",{name:"取消",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button",{name:"取消",exact:true}).click();await expect(trigger).toBeFocused();
});

test("四个任务导航与分享页共用一个页头", async ({ page }) => {
  await page.goto("/s/ui-ux-missing");
  await expect(page.locator("header.site-header")).toHaveCount(1);
  const navigation = page.getByRole("navigation", { name: "主要导航" });
  for (const name of ["发现", "书架", "存档", "设置"]) await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "存档", exact: true })).toHaveAttribute("aria-current", "page");
});

test("手机作品首屏不重叠，主操作与互动占完整内容宽度", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/27448/");
  const title = await page.locator(".work-heading h1").boundingBox();
  const identity = await page.locator(".work-heading .eyebrow").first().boundingBox();
  expect(title).not.toBeNull(); expect(identity).not.toBeNull();
  expect(title!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height - 1);
  expect((await page.locator("[data-work-stats]").boundingBox())!.width).toBeGreaterThan(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("阅读主操作在手机初始布局和缩放时保持横排",async({page},info)=>{
  await page.setViewportSize({width:1440,height:900});await page.goto('/27448/');
  const primary=page.locator('.work-read-actions > a').first();await expect(primary).toBeVisible();
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    const rect=await primary.boundingBox();expect(rect!.width).toBeGreaterThanOrEqual(120);expect(rect!.height).toBeLessThanOrEqual(56);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`reading-action-${width}.png`)});
  }
});

test("浏览设置首屏呈现下一步，完整规则仍可阅读", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/content");
  const action = page.getByRole("button", { name: "使用通行密钥登录", exact: true });
  await expect(action).toBeVisible();
  expect((await action.boundingBox())!.y).toBeLessThan(700);
  await expect(page.getByRole("button", { name: "查看完整浏览规则" })).toBeVisible();
  await page.getByRole("button", { name: "查看完整浏览规则" }).click();
  await expect(page.getByRole("heading", { name: "先了解本站规则" })).toBeVisible();
});

test("书架以阅读列表呈现，编辑收起不丢草稿", async ({ page }) => {
  await page.goto("/health"); await authenticator(page);
  expect((await register(page, "界面验收读者")).status).toBe(200);
  const attempt=(await api(page,"/api/me/content/attempts",{})).data;
  const answers=Object.fromEntries(attempt.questions.map((question:any)=>[question.id,RULE_QUESTIONS.find(rule=>rule.id===question.id)!.correctChoiceId]));
  expect((await api(page,`/api/me/content/attempts/${attempt.id}/submit`,{answers})).status).toBe(200);
  expect((await api(page,"/api/me/content/mode",{mode:"restricted"},"PATCH")).status).toBe(200);
  expect((await api(page, "/api/me/library/v27448", { revision: 0, status: "wanted", note: "初始笔记" }, "PATCH")).status).toBe(200);
  await page.goto("/account?tab=library");
  const row = page.locator('[data-shelf-work="v27448"]');
  await expect(row).toBeVisible();
  await expect(row.getByLabel("私人笔记")).not.toBeVisible();
  await row.getByRole("button", { name: "编辑阅读记录" }).click();
  await row.getByLabel("私人笔记").fill("未保存的草稿");
  await page.getByLabel("搜索我的书架").fill("没有匹配的标题");
  await expect(row).not.toBeVisible();
  await page.getByLabel("搜索我的书架").fill("");
  await row.getByRole("button", { name: "收起编辑" }).click();
  await row.getByRole("button", { name: "编辑阅读记录" }).click();
  await expect(row.getByLabel("私人笔记")).toHaveValue("未保存的草稿");
  expect((await api(page, "/api/me/library")).data.find((x: any) => x.workId === "v27448").note).toBe("初始笔记");
  await page.getByRole("navigation",{name:"主要导航"}).getByRole("link",{name:"存档",exact:true}).click();
  const dialog=page.getByRole("alertdialog",{name:"有尚未保存的阅读记录"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"返回编辑"}).click();
  await expect(row.getByLabel("私人笔记")).toHaveValue("未保存的草稿");
});

test("收藏单独进入聚合书架，打开列表不新增阅读记录",async({page})=>{
  await page.goto("/health");await authenticator(page);expect((await register(page,"收藏验收读者")).status).toBe(200);
  expect((await api(page,"/api/me/work-stats/v27448/favorite",{enabled:true},"PUT")).status).toBe(200);
  await page.goto("/account?tab=library");
  await expect(page.locator('[data-shelf-work="v27448"]')).toContainText("已收藏");
  expect((await api(page,"/api/me/library")).data).toEqual([]);
});

test("已有云档案可从目录直接选择，查看不会创建新备份",async({page})=>{
  await page.goto("/health");await authenticator(page);expect((await register(page,"备份验收读者")).status).toBe(200);
  const catalog=(await api(page,"/api/account-catalog")).data;
  const version=catalog[0].versions[0].id;
  const profile=await api(page,"/api/me/save-profiles",{versionId:version});expect(profile.status).toBe(201);
  await page.goto("/account?tab=saves");
  const choice=page.getByRole("region",{name:"已有备份档案"}).getByRole("button").first();
  await expect(choice).toBeVisible();await choice.click();await expect(choice).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("combobox",{name:"存档所属版本"})).toHaveValue(version);
  await expect(page.getByLabel("游戏导出的存档文件")).not.toBeVisible();
  await page.locator(".backup-upload > summary").click();
  await expect(page.getByLabel("游戏导出的存档文件")).toBeVisible();
  expect((await api(page,"/api/me/save-profiles")).data).toHaveLength(1);
});

test("目录在各断点保持自适应布局、触控尺寸和完整搜索条件",async({page},info)=>{
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});await page.goto("/?q=ATRI&engine=Artemis");
    await expect(page.getByRole("searchbox")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    for(const box of await page.getByRole("navigation",{name:"主要导航"}).getByRole("link").evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height}}))) {expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
    await page.screenshot({path:info.outputPath(`catalog-${width}.png`)});
  }
  await page.getByRole("link",{name:"移除引擎筛选：Artemis"}).click();
  await expect(page).toHaveURL(/q=ATRI/);await expect.poll(()=>new URL(page.url()).searchParams.has("engine")).toBe(false);
});

test("普通文字、主要操作和导航达到文字对比度目标",async({page})=>{
  await page.goto("/");
  const contrasts=await page.evaluate(()=>{
    function rgba(value:string){const values=value.match(/[\d.]+/g)?.map(Number)??[];return [values[0]??0,values[1]??0,values[2]??0,values[3]??1];}
    function over(fg:number[],bg:number[]){return [0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3])).concat(1);}
    function luminance(rgb:number[]){const v=rgb.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722;}
    return [...document.querySelectorAll('.catalog-description,.primary-navigation a,.search-row button,.content-mode-entry')].map(element=>{
      const layers:number[][]=[];for(let node:Element|null=element;node;node=node.parentElement)layers.push(rgba(getComputedStyle(node).backgroundColor));
      const bg=layers.reverse().reduce((bg,layer)=>over(layer,bg),[255,255,255,1]);
      const text=over(rgba(getComputedStyle(element).color),bg),a=luminance(text),b=luminance(bg);
      return {label:element.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
  });
  expect(contrasts.length).toBeGreaterThan(5);for(const item of contrasts)expect(item.ratio,item.label??"").toBeGreaterThanOrEqual(4.5);
});

test("登录后回到原作品，加入书架仍由用户主动执行",async({page})=>{
  await page.goto("/27448/");await authenticator(page);
  await page.getByRole("link",{name:"加入书架",exact:true}).click();
  await expect(page.getByRole("heading",{name:"登录后回到刚才的作品"})).toBeVisible();
  await page.getByRole("tab",{name:"创建账号",exact:true}).click();await page.getByLabel("昵称").fill("返回路径读者");
  await page.getByRole("button",{name:"创建通行密钥并注册"}).click();await expect(page).toHaveURL(/\/27448\/$/);
  expect((await api(page,"/api/me/library")).data).toEqual([]);
  await page.getByRole("button",{name:"加入书架",exact:true}).click();
  await expect(page.getByRole("button",{name:"已加入书架",exact:true})).toBeDisabled();
  expect((await api(page,"/api/me/library")).data).toHaveLength(1);
});

test("关闭JavaScript仍可展开筛选并提交搜索",async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false});
  try{
    const page=await context.newPage();await page.goto((process.env.WG_TEST_URL??"")+"/");
    await page.getByRole("searchbox").fill("ATRI");await page.locator(".advanced-filters > summary").click();
    await page.getByRole("combobox",{name:"引擎",exact:true}).selectOption("Artemis");
    await page.getByRole("button",{name:"查找",exact:true}).click();
    await expect(page.locator(".story-card")).toHaveCount(1);await expect(page.locator(".story-card")).toContainText("ATRI");
    await expect(page.getByRole("link",{name:"移除引擎筛选：Artemis"})).toBeVisible();
  }finally{await context.close()}
});
