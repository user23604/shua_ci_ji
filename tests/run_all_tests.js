const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const node = process.execPath;
const jsFiles = fs.readdirSync(path.join(root, 'assets/js'))
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => path.join('assets/js', name));

const commands = [
  ...jsFiles.map((file) => [node, ['--check', file]]),
  [node, ['--check', 'app.js']],
  [node, ['--check', 'sw.js']],
  [node, ['--check', 'assets/rescue/rescue.js']],
  [node, ['tests/loader_smoke_test.js']],
  [node, ['tests/sync_core_test.js']],
  [node, ['tests/final_network_fallback_test.js']],
  [node, ['tests/final_transport_efficiency_test.js']],
  [node, ['tests/final_static_quality_test.js']],
  [node, ['tests/ux_v4_regression_test.js']],
  [node, ['tests/audio_v5_regression_test.js']],
  [node, ['tests/rescue_recovery_test.js']],
  [node, ['tests/data_integrity_test.js']]
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('All release tests passed');
