// npm runs workspace scripts one after another. The API dev server never exits,
// so `npm run dev --workspaces` never reaches the Next.js app.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const scripts = ['dev:api', 'dev:web'];
const children = scripts.map((script) =>
  spawn(npm, ['run', script], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
);

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (stopping || signal) return;
    if (code && code !== 0) {
      stop();
      process.exit(code);
    }
  });
}
