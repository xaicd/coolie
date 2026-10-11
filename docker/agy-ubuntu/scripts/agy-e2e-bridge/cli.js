#!/usr/bin/env node
// agy-e2e — CLI wrapper around the agent-device bridge.
// Usage:
//   agy-e2e devices
//   agy-e2e info [--device emulator-5554]
//   agy-e2e tap 540 1200 [--device emulator-5554]
//   agy-e2e swipe 100 200 500 600 [300]
//   agy-e2e type "hello world"
//   agy-e2e screenshot [name]
//   agy-e2e record start <name> | record stop
//   agy-e2e replay <recordingPath>

'use strict';

const { AgentDevice } = require('./index.js');

function parseDeviceFlag(argv) {
  let device = process.env.AGY_E2E_DEVICE || 'emulator-5554';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--device' && argv[i + 1]) {
      device = argv[i + 1];
      argv.splice(i, 2);
      break;
    }
  }
  return device;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error('Usage: agy-e2e <command> [args]');
    console.error('Commands: devices | info | tap | swipe | type | screenshot | record | replay | wait-boot');
    process.exit(2);
  }
  const cmd = argv.shift();
  const device = parseDeviceFlag(argv);
  const ad = new AgentDevice({ deviceId: device });

  try {
    switch (cmd) {
      case 'devices': {
        const r = await ad.devices();
        console.log(JSON.stringify(r, null, 2));
        return;
      }
      case 'info': {
        const r = await ad.info();
        console.log(JSON.stringify(r, null, 2));
        return;
      }
      case 'tap': {
        const [x, y] = argv.map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error('tap requires two numeric args: <x> <y>');
        }
        await ad.tap(x, y);
        console.log(`tapped (${x}, ${y})`);
        return;
      }
      case 'swipe': {
        const [x1, y1, x2, y2, dur] = argv.map(Number);
        if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) {
          throw new Error('swipe requires: <x1> <y1> <x2> <y2> [durationMs]');
        }
        await ad.swipe(x1, y1, x2, y2, Number.isFinite(dur) ? dur : 300);
        console.log(`swiped (${x1},${y1}) → (${x2},${y2})`);
        return;
      }
      case 'type': {
        const text = argv.join(' ');
        await ad.type(text);
        console.log(`typed: ${text}`);
        return;
      }
      case 'screenshot': {
        const name = argv[0] || 'shot';
        const out = await ad.screenshot(name);
        console.log(out);
        return;
      }
      case 'record': {
        const sub = argv.shift();
        if (sub === 'start') {
          const out = await ad.startRecording(argv[0] || 'session');
          console.log(out);
        } else if (sub === 'stop') {
          const out = await ad.stopRecording();
          console.log(out || '(no active recording)');
        } else {
          throw new Error('record subcommand: start <name> | stop');
        }
        return;
      }
      case 'replay': {
        const p = argv[0];
        if (!p) throw new Error('replay requires: <recordingPath>');
        const r = await ad.replay(p);
        console.log(typeof r === 'string' ? r : JSON.stringify(r));
        return;
      }
      case 'wait-boot': {
        await ad.waitForBoot();
        console.log('boot completed');
        return;
      }
      default:
        throw new Error(`unknown command: ${cmd}`);
    }
  } catch (err) {
    console.error(`[agy-e2e] ${err.message}`);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

main();