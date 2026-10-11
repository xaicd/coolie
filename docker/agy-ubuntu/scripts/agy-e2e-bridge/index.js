// agy-e2e-bridge — Node API bridge around the agent-device CLI.
//
// Why a bridge? agent-device ships as an npm package with a CLI-first design —
// no formal SDK. To call it programmatically from Node, we spawn the CLI and
// consume stdout (mostly JSON when invoked with `--json`). This module wraps
// those child-process calls in promises so app code can `await` them.
//
// Usage:
//   import { AgentDevice } from 'agy-e2e-bridge';
//   const ad = new AgentDevice({ deviceId: 'emulator-5554' });
//   await ad.shell('input keyevent KEYCODE_HOME');
//   await ad.tap(540, 1200);
//
// All recorded artifacts (recordings, traces, screenshots) land in
// /root/workspace/e2e/recordings/ by default, bind-mounted to the host.

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_RECORDING_DIR = process.env.AGY_E2E_RECORDINGS
  || '/root/workspace/e2e/recordings';

class AgentDeviceError extends Error {
  constructor(message, { stderr, code, args } = {}) {
    super(message);
    this.stderr = stderr;
    this.exitCode = code;
    this.args = args;
  }
}

function runAgentDevice(args, { cwd, env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('agent-device', args, {
      cwd: cwd || DEFAULT_RECORDING_DIR,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (d) => stdoutChunks.push(d));
    child.stderr.on('data', (d) => stderrChunks.push(d));

    if (input !== undefined) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new AgentDeviceError(
          'agent-device CLI not found on PATH. Did you install agent-device globally?',
          { args, code: -1 },
        ));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (code !== 0) {
        reject(new AgentDeviceError(
          `agent-device ${args.join(' ')} failed (exit ${code})`,
          { stderr, code, args },
        ));
        return;
      }

      // 尝试解析 JSON;若 stdout 不是 JSON 则原样返回
      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve(null);
        return;
      }
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          resolve(JSON.parse(trimmed));
        } catch {
          resolve(stdout);
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

class AgentDevice {
  constructor(opts = {}) {
    this.deviceId = opts.deviceId || process.env.AGY_E2E_DEVICE || 'emulator-5554';
    this.recordingDir = opts.recordingDir || DEFAULT_RECORDING_DIR;
    this.timeoutMs = opts.timeoutMs || 30_000;
    fs.mkdirSync(this.recordingDir, { recursive: true });
  }

  // 列出当前 adb 可见的所有设备
  async devices() {
    return runAgentDevice(['devices', '--json']);
  }

  // 拉取设备信息(API level / OS version / model / serial)
  async info() {
    return runAgentDevice(['info', '--device', this.deviceId, '--json']);
  }

  // 任意 adb shell 命令
  async shell(command) {
    return runAgentDevice([
      'shell', '--device', this.deviceId, '--', command,
    ]);
  }

  // 模拟 tap(x, y)
  async tap(x, y) {
    return this.shell(`input tap ${x} ${y}`);
  }

  // 模拟 swipe(x1, y1, x2, y2, [durationMs])
  async swipe(x1, y1, x2, y2, duration = 300) {
    return this.shell(
      `input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`,
    );
  }

  // 模拟文本输入(空格需转义为 %s)
  async type(text) {
    const escaped = text.replace(/ /g, '%s');
    return this.shell(`input text "${escaped}"`);
  }

  // 截屏 → /root/workspace/e2e/screenshots/<name>.png
  async screenshot(name = 'screenshot') {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${ts}.png`;
    const dest = path.join('/root/workspace/e2e/screenshots', filename);
    await this.shell(`screencap -p /sdcard/${filename}`);
    await runAgentDevice(['pull', '--device', this.deviceId, '/sdcard/' + filename, dest]);
    return dest;
  }

  // 开始录制
  async startRecording(name = 'session') {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const out = path.join(this.recordingDir, `${name}-${ts}`);
    fs.mkdirSync(out, { recursive: true });
    this._currentRecording = out;
    await runAgentDevice([
      'record', 'start',
      '--device', this.deviceId,
      '--output', out,
    ]);
    return out;
  }

  // 停止录制
  async stopRecording() {
    if (!this._currentRecording) return null;
    const out = this._currentRecording;
    this._currentRecording = null;
    await runAgentDevice(['record', 'stop']);
    return out;
  }

  // 回放一个录制产物
  async replay(recordingPath) {
    return runAgentDevice([
      'replay',
      '--device', this.deviceId,
      '--input', recordingPath,
    ]);
  }

  // 等待指定 prop 取到预期值(默认 sys.boot_completed=1)
  async waitForBoot(timeoutMs = 600_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await this.shell('getprop sys.boot_completed');
        if (String(r).trim() === '1') return true;
      } catch (_) { /* keep polling */ }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`waitForBoot timed out after ${timeoutMs}ms`);
  }
}

module.exports = { AgentDevice, AgentDeviceError, runAgentDevice };