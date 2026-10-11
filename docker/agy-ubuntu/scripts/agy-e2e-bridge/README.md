# agy-e2e-bridge

Thin Node wrapper around the `agent-device` CLI. agent-device ships CLI-first
(no separate SDK); this bridge turns its subcommands into `await`-able
operations and pins recording/screenshot output to `/root/workspace/e2e/`.

## As a Node module

```js
import { AgentDevice } from 'agy-e2e-bridge';

const ad = new AgentDevice({ deviceId: 'emulator-5554' });
await ad.waitForBoot();
await ad.shell('am start -a android.intent.action.MAIN -c android.intent.category.HOME');
await ad.screenshot('home');

const out = await ad.startRecording('demo');
// ... interact ...
await ad.stopRecording();
```

## As a CLI

```sh
agy-e2e devices
agy-e2e info
agy-e2e tap 540 1200
agy-e2e swipe 100 200 500 600 300
agy-e2e type "hello world"
agy-e2e screenshot home
agy-e2e record start demo
agy-e2e record stop
agy-e2e replay /root/workspace/e2e/recordings/demo-<ts>
agy-e2e wait-boot
```

All commands accept `--device <serial>` (default: `emulator-5554`).