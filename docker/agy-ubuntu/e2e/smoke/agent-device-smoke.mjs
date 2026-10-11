// agent-device-smoke.mjs — 连 emulator-5554,拉 device info,做一次轻交互,记录到 recordings/
//
// 假定:start-emulator.sh 已经完成(adb-status.sh 显示 sys.boot_completed=1)。
// 若 emulator 未启动,会打印明确错误并以非零退出。

// agy-e2e-bridge 已全局装进镜像(/usr/local/lib/node_modules/agy-e2e-bridge,CJS)。
// ESM 里用绝对路径动态 import + default interop;宿主调试可用 AGY_E2E_BRIDGE 覆盖。
const BRIDGE_URL = new URL(
  process.env.AGY_E2E_BRIDGE || '/usr/local/lib/node_modules/agy-e2e-bridge/index.js',
  'file:///'
).href;
const bridgeMod = await import(BRIDGE_URL);
const { AgentDevice } = bridgeMod.AgentDevice ? bridgeMod : bridgeMod.default;

import fs from 'node:fs/promises';
import path from 'node:path';

const RECORDINGS = '/root/workspace/e2e/recordings';
await fs.mkdir(RECORDINGS, { recursive: true });

const ad = new AgentDevice({
  deviceId: process.env.AGY_E2E_DEVICE || 'emulator-5554',
  recordingDir: RECORDINGS,
});

let info;
try {
  info = await ad.info();
} catch (err) {
  console.error('[smoke] agent-device info failed:', err.message);
  console.error('        提示: 跑 start-emulator.sh 启动模拟器,等 boot 完成');
  process.exit(1);
}

const infoPath = path.join(RECORDINGS, 'device-info.json');
await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
console.log(`[smoke] device info → ${infoPath}`);

const recDir = await ad.startRecording('smoke');
console.log(`[smoke] recording → ${recDir}`);

try {
  await ad.shell('input keyevent KEYCODE_HOME');
  await ad.shell('am start -a android.intent.action.VIEW -d https://example.com');
  await new Promise((r) => setTimeout(r, 4000));
  await ad.screenshot('smoke');
} finally {
  const stopped = await ad.stopRecording();
  console.log(`[smoke] recording stopped → ${stopped}`);
}

console.log('[smoke] ✅ agent-device smoke 完成');