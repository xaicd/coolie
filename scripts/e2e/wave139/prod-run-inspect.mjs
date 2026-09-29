#!/usr/bin/env node
import { session } from "./prod-wbs.mjs";
const BASE = "https://www.xrobinai.cn/XROA";
const ORIGIN = new URL(BASE).origin;
const H = { Origin: ORIGIN, Referer: `${ORIGIN}/` };
const RUN = process.env.RUN;
const { browser, page } = await session();
const J = async (u) => { const r = await page.request.get(`${ORIGIN}${u}`, { headers: H }); return r.ok() ? r.json() : { __error: r.status() }; };
const run = await J(`/api/heartbeat-runs/${RUN}`);
console.log("run:", JSON.stringify({ id: run.id, status: run.status, agentId: run.agentId, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error ?? run.lastError, issueId: run.issueId, context: run.contextSnapshot }).slice(0, 800));
const ev = await J(`/api/heartbeat-runs/${RUN}/events`);
const arr = Array.isArray(ev) ? ev : ev.events ?? [];
console.log("events:", arr.length);
for (const e of arr.slice(-18)) console.log(` ${String(e.createdAt).slice(11, 19)} [${e.eventType}/${e.level}] ${String(e.message).slice(0, 150)}`);
await browser.close();
