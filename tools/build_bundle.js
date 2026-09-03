const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'app.js');
const appSource = fs.readFileSync(appPath, 'utf8');
const match = appSource.match(/var scripts = \[([\s\S]*?)\];/);
if (!match) throw new Error('app.js 中没有找到源码模块顺序');
const modules = [...match[1].matchAll(/"([^"]+\.js)"/g)].map((item) => item[1]);
if (!modules.length) throw new Error('源码模块列表为空');

const banner = [
  '/*',
  ' * AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
  ' * Source order: app.js -> scripts[].',
  ' * Rebuild: npm run build',
  ' */',
  ''
].join('\n');

const output = banner + modules.map((name) => {
  const file = path.join(root, 'assets/js', name);
  if (!fs.existsSync(file)) throw new Error(`缺少模块：${name}`);
  const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trimEnd();
  return `/* ===== ${name} ===== */\n${source}\n`;
}).join('\n');

const bundlePath = path.join(root, 'assets/js/app.bundle.js');
if (process.argv.includes('--check')) {
  const current = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath, 'utf8') : '';
  if (current !== output) {
    console.error('assets/js/app.bundle.js 已过期，请运行 npm run build');
    process.exit(1);
  }
  console.log(`Bundle is current (${modules.length} modules, ${Buffer.byteLength(output)} bytes)`);
} else {
  fs.writeFileSync(bundlePath, output);
  console.log(`Built assets/js/app.bundle.js (${modules.length} modules, ${Buffer.byteLength(output)} bytes)`);
}
