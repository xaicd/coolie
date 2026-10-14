import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectDefinedI18nKeys,
  collectStaticI18nRefs,
  collectUndefinedI18nRefs,
  extractI18nKeysFromSource,
  partitionI18nRefs,
} from "./check-ui-i18n-refs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("extractI18nKeysFromSource captures static t()/translate() literal keys", () => {
  const src = [
    'const a = t("routines.subtitle");',
    "const b = t('routines.createRoutine', { defaultValue: 'x' });",
    "const c = translate(`agents.detail.title`);",
    'const d = t("app.save"), e = t("nav.dashboard");',
  ].join("\n");
  assert.deepEqual([...extractI18nKeysFromSource(src)].sort(), [
    "agents.detail.title",
    "app.save",
    "nav.dashboard",
    "routines.createRoutine",
    "routines.subtitle",
  ]);
});

test("extractI18nKeysFromSource skips interpolated templates and dynamic keys", () => {
  const src = [
    "const a = t(`routines.${kind}`);",
    "const b = t(key);",
    'const c = t("nodot");',
  ].join("\n");
  assert.deepEqual([...extractI18nKeysFromSource(src)], []);
});

test("extractI18nKeysFromSource ignores createElement-style identifiers ending in t", () => {
  const src = 'return createElement("div", { className: "x" }, children);';
  assert.deepEqual([...extractI18nKeysFromSource(src)], []);
});

test("partitionI18nRefs separates new missings from baseline debt and stale entries", () => {
  const referenced = ["app.save", "routines.subtitle", "routines.newMissing", "agents.count"];
  const defined = ["app.save", "nav.dashboard"];
  const baseline = ["routines.subtitle", "agents.count", "app.removed"];
  const { missing, newMissings, stale } = partitionI18nRefs(referenced, defined, baseline);
  assert.deepEqual(missing, ["agents.count", "routines.newMissing", "routines.subtitle"]);
  assert.deepEqual(newMissings, ["routines.newMissing"]);
  assert.deepEqual(stale, ["app.removed"]);
});

test("partitionI18nRefs reports nothing when all references resolve", () => {
  const { newMissings, stale } = partitionI18nRefs(["app.save"], ["app.save"], []);
  assert.deepEqual(newMissings, []);
  assert.deepEqual(stale, []);
});

test("real repository: every routines.* key referenced by the web UI is defined", () => {
  const defined = collectDefinedI18nKeys();
  const routinesRefs = [...collectStaticI18nRefs().keys()].filter((key) => key.startsWith("routines."));
  assert.ok(routinesRefs.length > 0, "expected Routines.tsx to reference routines.* keys");
  const undefinedRoutines = routinesRefs.filter((key) => !defined.has(key));
  assert.deepEqual(undefinedRoutines, [], `undefined routines.* keys leaked to UI: ${undefinedRoutines.join(", ")}`);
});

test("real repository: baseline covers all currently-undefined static refs (no new debt)", () => {
  const baseline = JSON.parse(readFileSync(path.join(__dirname, "i18n-refs-baseline.json"), "utf8")).keys;
  const { newMissings } = partitionI18nRefs(collectUndefinedI18nRefs(), [], baseline);
  assert.deepEqual(newMissings, [], `new undefined i18n refs not in baseline: ${newMissings.join(", ")}`);
});
