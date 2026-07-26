const fs = require('fs');
const path = require('path');
const vm = require('vm');
function makeStorage(){ const m=new Map(); return { get length(){return m.size;}, key(i){return Array.from(m.keys())[i]||null;}, getItem(k){return m.has(String(k))?m.get(String(k)):null;}, setItem(k,v){m.set(String(k),String(v));}, removeItem(k){m.delete(String(k));}, clear(){m.clear();} }; }
const context = {
  console, Date, Math, JSON, Map, Set, Array, Object, String, Number, Boolean, RegExp, Promise, URL,
  localStorage: makeStorage(), sessionStorage: makeStorage(),
  navigator: { userAgent:'loader-smoke', clipboard:{ writeText:()=>Promise.resolve() } },
  location: { href:'http://localhost/', origin:'http://localhost', pathname:'/' },
  document: {
    hidden:false, visibilityState:'visible', currentScript:{ src:'http://localhost/app.js' }, head:{ appendChild(){} }, body:{ appendChild(){} }, documentElement:{ appendChild(){} },
    getElementById:()=>null, querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){},
    createElement:()=>({ style:{}, classList:{add(){},remove(){},toggle(){}}, appendChild(){}, remove(){}, setAttribute(){}, getAttribute(){return null;}, querySelector(){return null;}, querySelectorAll(){return[];}, addEventListener(){}, innerHTML:'', textContent:'' })
  },
  crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
  addEventListener(){}, removeEventListener(){},
  setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){}, requestAnimationFrame:(fn)=>{ if(fn) fn(); },
  alert(){}, confirm(){return false;}, prompt(){return '';}
};
context.window=context; context.globalThis=context;
vm.createContext(context);
const appLoader = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const scripts = Array.from(appLoader.matchAll(/"([0-9A-Za-z_-]+\.js)"/g))
  .map((match) => 'assets/js/' + match[1])
  .filter((file) => !file.endsWith('/99-bootstrap.js'));
if (!scripts.length) throw new Error('No scripts found in app.js');
for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), context, { filename:file });
console.log('Loader smoke tests passed');
