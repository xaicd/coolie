#!/usr/bin/env node
// scripts/lib/ios-version-json.test.mjs
// COOA-470: version.json iOS 契约唯一真源单测。
// 覆盖 merge/extract 全部边界, 并断言契约字段与 App 端 AppVersion.ts 不漂移。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  IOS_APP_FIELDS,
  mergeIosVersionJson,
  extractIosDistributionLinks,
} from "./ios-version-json.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION_TS = path.resolve(HERE, "../../clients/expo/src/AppVersion.ts");

test("mergeIosVersionJson: 写入顶层扁平 ios* 字段 (App 契约), 保留 android + TestFlight", () => {
  const existing = {
    version: "0.6.61",
    versionCode: 661,
    downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.6.61/coolie-release.apk",
    iosBundleId: "cn.xrobinai.app",
    iosTestFlightUrl: "https://testflight.apple.com/join/abc",
  };
  const merged = mergeIosVersionJson(existing, {
    downloadUrl: "https://dls.xrobinai.cn/coolie/app/0.6.62/coolie-release-ios.ipa",
    sha256: "a".repeat(64),
    bundleId: "cn.xrobinai.app",
    manifestUrl: "https://dls.xrobinai.cn/coolie/app/0.6.62/manifest.plist",
    installUrl: "itms-services://?action=download-manifest&url=https://x/manifest.plist",
    qrUrl: "https://dls.xrobinai.cn/coolie/app/0.6.62/install-qr-ios.png",
    sizeBytes: "12345678",
  });

  assert.equal(merged.iosDownloadUrl, "https://dls.xrobinai.cn/coolie/app/0.6.62/coolie-release-ios.ipa");
  assert.equal(merged.iosSha256, "a".repeat(64));
  assert.equal(merged.iosBundleId, "cn.xrobinai.app");
  assert.equal(merged.iosSizeBytes, 12345678);
  // 既有 android 字段与手工维护的 TestFlight 链接必须原样保留
  assert.equal(merged.version, "0.6.61");
  assert.equal(merged.downloadUrl, "https://dls.xrobinai.cn/coolie/app/0.6.61/coolie-release.apk");
  assert.equal(merged.iosTestFlightUrl, "https://testflight.apple.com/join/abc");
  assert.ok(!("ios" in merged), "不得残留嵌套 ios 对象");
});

test("mergeIosVersionJson: 清除历史遗留的嵌套 ios 对象", () => {
  const merged = mergeIosVersionJson(
    { version: "0.5.0", ios: { downloadUrl: "https://old/dead.ipa" } },
    { downloadUrl: "https://new/live.ipa" },
  );
  assert.ok(!("ios" in merged));
  assert.equal(merged.iosDownloadUrl, "https://new/live.ipa");
});

test("extractIosDistributionLinks: 扁平字段被识别为已声明", () => {
  const r = extractIosDistributionLinks({
    iosDownloadUrl: "https://dls.xrobinai.cn/x.ipa",
    iosTestFlightUrl: null,
  });
  assert.equal(r.declared, true);
  assert.equal(r.nestedIos, false);
  assert.deepEqual(r.links, [{ key: "iosDownloadUrl", url: "https://dls.xrobinai.cn/x.ipa" }]);
});

test("extractIosDistributionLinks: 嵌套 ios 对象判定为契约错位", () => {
  const r = extractIosDistributionLinks({
    version: "0.6.61",
    ios: { downloadUrl: "https://dls.xrobinai.cn/x.ipa", sha256: "deadbeef" },
  });
  assert.equal(r.nestedIos, true);
  assert.equal(r.declared, false);
  assert.match(r.warnings.join("\n"), /嵌套/);
});

test("extractIosDistributionLinks: 空 / null 视为诚实空态", () => {
  const r = extractIosDistributionLinks({ version: "0.6.61", iosTestFlightUrl: null });
  assert.equal(r.declared, false);
  assert.equal(r.nestedIos, false);
  assert.equal(r.links.length, 0);
});

test("extractIosDistributionLinks: 非 http(s) 字段跳过探测并警告", () => {
  const r = extractIosDistributionLinks({
    iosManifestUrl: "itms-services://?action=download-manifest&url=https://x",
  });
  assert.equal(r.declared, false);
  assert.match(r.warnings.join("\n"), /非 http\(s\)/);
});

test("契约不漂移: IOS_APP_FIELDS 必须逐字段声明在 clients/expo/src/AppVersion.ts", () => {
  const src = fs.readFileSync(APP_VERSION_TS, "utf8");
  for (const field of IOS_APP_FIELDS) {
    assert.ok(
      new RegExp(`${field}\\??:`).test(src),
      `AppVersion.ts 未声明契约字段 ${field} (脚本与 App 契约已漂移)`,
    );
  }
});
