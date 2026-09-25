/**
 * runtime-version.mjs aapt2 解析回归测试 (wave82)。
 *
 * 背景：expo-updates 把 EXPO_RUNTIME_VERSION 编译成 Android string resource，
 * meta-data 里写成资源引用（`@0x7f120082`），不是字面值。xmltree 路径看不到引用
 * 解析后的值，旧脚本静默回落 app.json → publish-ota.sh 用错值。
 *
 * 这个测试覆盖三件事：
 *   1. parseApkXmltree 在「只有资源引用、没有字面值」的 meta-data 上必须返回 null
 *   2. parseApkResources 必须能从 `aapt2 dump resources` 输出里取到 string/expo_runtime_version
 *      的 default-config 值；多 config 时 default 优先，其它 fallback
 *   3. readApkRuntimeVersion 端到端能拿到真值（execFileSync mock 出 aapt2 dump resources 输出）
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APP_JSON,
  EXPO_DIR,
  parseApkResources,
  parseApkXmltree,
  readApkRuntimeVersion,
} from "../../clients/expo/scripts/runtime-version.mjs";

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

const mockedExecFileSync = vi.mocked(execFileSync);

// 这是从真实 0.5.56 release APK 上 `aapt2 dump resources` 的节选。
// line 12299 = resource 0x7f120082 string/expo_runtime_version，紧随其后是
//   () "0.5.56"  -- default config
const REAL_AAPT2_RESOURCES = `
      (en-rAU) "Unknown"
      (zh-rTW) "不明"
    resource 0x7f120082 string/expo_runtime_version
      () "0.5.56"
    resource 0x7f120083 string/expo_splash_screen_resize_mode
      () "contain"
    resource 0x7f120084 string/expo_splash_screen_resize_status_bar_translucent
      () "false"
`;

const REAL_AAPT2_XMLTREE = `
          E: meta-data (line=94)
            A: http://schemas.android.com/apk/res/android:name(0x01010003)="expo.modules.updates.EXPO_RUNTIME_VERSION" (Raw: "expo.modules.updates.EXPO_RUNTIME_VERSION")
            A: http://schemas.android.com/apk/res/android:value(0x01010024)=@0x7f120082
          E: meta-data (line=97)
`;

describe("parseApkXmltree (debug-only, 不能信)", () => {
  it("在资源引用场景下返回 null（这是 bug 的来源）", () => {
    expect(parseApkXmltree(REAL_AAPT2_XMLTREE)).toBeNull();
  });
});

describe("parseApkResources (主路径)", () => {
  it("从默认 config 取到 string/expo_runtime_version 的真值", () => {
    expect(parseApkResources(REAL_AAPT2_RESOURCES, "expo_runtime_version")).toBe("0.5.56");
  });

  it("default config 缺失时回落到第一个非空 locale 值", () => {
    const resources = `
    resource 0x7f120082 string/expo_runtime_version
      (en) "0.5.56"
      (zh) "0.5.56-zh"
`;
    expect(parseApkResources(resources, "expo_runtime_version")).toBe("0.5.56");
  });

  it("资源名不存在时返回 null（不抛错、不乱猜）", () => {
    expect(parseApkResources(REAL_AAPT2_RESOURCES, "nope")).toBeNull();
  });

  it("空输入 / 空 name 返回 null", () => {
    expect(parseApkResources("", "expo_runtime_version")).toBeNull();
    expect(parseApkResources(REAL_AAPT2_RESOURCES, "")).toBeNull();
  });

  it("空字符串占位（aapt2 会打印 `() \"\"`）不污染结果", () => {
    const resources = `
    resource 0x7f120082 string/expo_runtime_version
      () ""
      (en) "0.5.56"
`;
    expect(parseApkResources(resources, "expo_runtime_version")).toBe("0.5.56");
  });
});

describe("readApkRuntimeVersion (end-to-end)", () => {
  let tmp: string;
  let fakeApk: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "runtime-version-test-"));
    fakeApk = join(tmp, "fake.apk");
    writeFileSync(fakeApk, "");
    mockedExecFileSync.mockReset();
    // 让 aapt2 find 走显式 env.AAPT2，绕开 PATH 上的 command -v。
    process.env.AAPT2 = "/usr/bin/true";
  });

  afterEach(() => {
    delete process.env.AAPT2;
    vi.restoreAllMocks();
  });

  it("读到 APK 真值 0.5.56（不回落 intent）", () => {
    // findAapt2 看 env.AAPT2 直接返回；execFileSync 那一次调用是 aapt2 dump resources
    mockedExecFileSync.mockReturnValueOnce(REAL_AAPT2_RESOURCES);
    const value = readApkRuntimeVersion(fakeApk);
    expect(value).toBe("0.5.56");
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      "/usr/bin/true",
      ["dump", "resources", fakeApk],
      expect.objectContaining({ encoding: "utf8" }),
    );
  });

  it("找不到 APK 时返回 null", () => {
    expect(readApkRuntimeVersion(join(tmp, "missing.apk"))).toBeNull();
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });
});

// 仅 sanity check：模块导出的 EXPO_DIR / APP_JSON 不为空（防止导入崩）。
describe("module exports sanity", () => {
  it("EXPO_DIR 是 clients/expo", () => {
    expect(EXPO_DIR.endsWith("clients/expo")).toBe(true);
  });
  it("APP_JSON 指向 app.json", () => {
    expect(APP_JSON.endsWith("app.json")).toBe(true);
  });
});
