#!/usr/bin/env node
/**
 * verify_deck.mjs — 逐页检查 slide deck 有没有被静默裁掉的内容
 *
 * 为什么需要：.stage 是固定 1920×1080 + overflow:hidden。内容一旦超出，
 * 浏览器不会报错、不会滚动、截图也看不出——超出部分就那么没了。
 * 静态截图验收发现不了这一类错误，必须程序量坐标。
 *
 * 做法：用 1600px 高（比 1080 高得多）的视口渲染每一页，
 * 然后量所有可见元素的 bottom，凡是越过 1080 的就是被裁的。
 *
 * 用法：
 *   node verify_deck.mjs --slides slides [--height 1080] [--width 1920] [--json]
 *
 * 退出码：全部通过 0，有溢出 1。
 *
 * 依赖：playwright
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

function parseArgs() {
  const a = process.argv.slice(2);
  const args = { width: 1920, height: 1080, json: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (k === 'json') { args.json = true; continue; }
    args[k] = a[i + 1]; i++;
  }
  if (!args.slides) {
    console.error('用法: node verify_deck.mjs --slides <dir> [--width 1920] [--height 1080] [--json]');
    process.exit(2);
  }
  args.width = parseInt(args.width, 10);
  args.height = parseInt(args.height, 10);
  return args;
}

// 在页面里跑：找出所有越过画布底边的可见元素
const PROBE = (H) => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    if (r.bottom > H + 1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50),
      });
    }
  }
  // 只留"最深"的几个 —— 父容器和子元素会一起越界，子元素信息更有用
  out.sort((a, b) => b.bottom - a.bottom);
  return out.slice(0, 5);
};

async function main() {
  const { slides, out, width, height, json } = parseArgs();
  const dir = path.resolve(slides);

  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.html')).sort();
  if (!files.length) {
    console.error(`No .html files in ${dir}`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  // 视口比画布高，让真实溢出"掉出来"而不是被裁掉
  const ctx = await browser.newContext({ viewport: { width, height: height + 600 } });

  const results = [];
  let failed = 0;

  for (const f of files) {
    const page = await ctx.newPage();
    const url = 'file://' + path.join(dir, f);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => page.goto(url));
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(PROBE, height);
    results.push({ file: f, overflow });
    if (overflow.length) failed++;

    if (!json) {
      if (overflow.length) {
        console.log(`  ✗ ${f}`);
        for (const o of overflow) {
          console.log(`      <${o.tag}${o.cls ? ' class="' + o.cls + '"' : ''}> `
            + `底边 ${o.bottom}px（超出 ${o.bottom - height}px）  "${o.text}"`);
        }
      } else {
        console.log(`  ✓ ${f}`);
      }
    }
    await page.close();
  }

  await browser.close();

  if (json) {
    console.log(JSON.stringify({ width, height, results }, null, 2));
  } else {
    console.log(`\n${failed === 0 ? '✓ 全部通过' : '✗ ' + failed + '/' + files.length + ' 页有内容被裁'}`);
  }

  if (out) await fs.writeFile(out, JSON.stringify({ width, height, results }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
