#!/usr/bin/env node
import { openAuthed, ORIGIN } from "./lib.mjs";
const main = async () => {
  const { browser, page } = await openAuthed();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "新建任务", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Project$/ }).first().click();
  await page.waitForTimeout(1200);
  const html = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => /wave129/.test(b.innerText || ""));
    return btns.map((b) => ({
      outer: b.outerHTML.slice(0, 400),
      rect: (() => { const r = b.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })(),
      visible: b.offsetParent !== null,
    }));
  });
  console.log(JSON.stringify(html, null, 1));
  // what is the popover container?
  const pop = await page.evaluate(() => {
    const el = [...document.querySelectorAll("*")].find((e) => /wave129/.test(e.innerText || "") && e.tagName !== "SPAN");
    let p = el; const chain = [];
    for (let i = 0; i < 6 && p; i++) { chain.push(`${p.tagName}.${(p.className || "").toString().slice(0, 45)}[role=${p.getAttribute("role")}]`); p = p.parentElement; }
    return chain;
  });
  console.log("CHAIN:", JSON.stringify(pop, null, 1));
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
