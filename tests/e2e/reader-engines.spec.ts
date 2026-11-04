import { test, expect } from "@playwright/test";
import { authenticator, register, api } from "../helpers/account-browser";
import { RULE_QUESTIONS } from "../../src/content/quiz";

const origin=process.env.WG_CONTENT_TEST_URL;
test.skip(!origin||origin!==process.env.WG_UI_UX_TEST_URL||process.env.WG_CONTENT_NATIVE_CAS!=="1","仅在本任务隔离预览进行真实引擎补验");
for(const [engine,path] of [["Artemis","/27448/1/"],["RenPy","/1286/1/"],["Tyrano","/36554/1/"],["WebGAL","/22880/1/"]] as const){
  test(`${engine} 代表版本真实启动、保留本机副本并结束`,async({page,context},info)=>{
    test.setTimeout(240_000);await context.grantPermissions(["local-network-access"]);
    const objects:string[]=[],mainBodies:string[]=[];
    page.on("request",request=>{const url=new URL(request.url());if(url.hostname==="wvn-s3-zi0.saop.cc")objects.push(url.pathname)});
    page.on("response",response=>{const url=new URL(response.url());const trustedEntry=/^\/__player\/resource\/[^/]+\/index\.html$/.test(url.pathname)&&response.headers()["content-type"]?.includes("text/html");if(!trustedEntry&&url.origin===origin&&[200,206].includes(response.status())&&/^\/__(?:ons\/(?:data|engine)|player\/resource|engines\/resource)\//.test(url.pathname))mainBodies.push(url.pathname)});
    await page.goto("/health");await authenticator(page);expect((await register(page,`${engine} 界面验收`)).status).toBe(200);
    const attempt=(await api(page,"/api/me/content/attempts",{})).data;
    const answers=Object.fromEntries(attempt.questions.map((question:any)=>[question.id,RULE_QUESTIONS.find(row=>row.id===question.id)!.correctChoiceId]));
    expect((await api(page,`/api/me/content/attempts/${attempt.id}/submit`,{answers})).status).toBe(200);
    expect((await api(page,"/api/me/content/mode",{mode:"restricted"},"PATCH")).status).toBe(200);
    await page.goto(path);await page.getByRole("button",{name:"开始阅读",exact:true}).click();
    await expect(page.getByRole("button",{name:"游戏菜单",exact:true})).toBeEnabled({timeout:180_000});
    if(engine==="Artemis"){
      await page.getByRole("button",{name:"全屏",exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains("reader-surface"))).toBe(true);
      await expect(page.getByRole("button",{name:"结束阅读",exact:true})).toBeVisible();
      await page.getByRole("button",{name:"存档与备份",exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
      await expect(page.getByRole("region",{name:"存档管理面板"})).toBeVisible();
    }
    expect(objects.length).toBeGreaterThan(0);expect(objects.every(path=>/^\/[a-f0-9]{64}\.bin$/.test(path))).toBe(true);expect(mainBodies).toEqual([]);
    await page.screenshot({path:info.outputPath(`${engine}.png`)});
    await page.getByRole("button",{name:"结束阅读",exact:true}).click();
    await expect(page.locator(".reader-save-status")).toContainText("阅读已结束，本机副本已保留",{timeout:35000});
    await expect(page.locator(".reader-surface iframe")).toHaveCount(0);
  });
}
