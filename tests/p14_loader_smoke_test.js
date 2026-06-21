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
const scripts = [
  'assets/js/00-env.js','assets/js/01-utils-basic.js','assets/js/02-storage-basic.js','assets/js/03-domain-defaults.js','assets/js/04-state.js','assets/js/05-storage-domain.js','assets/js/06-sync-runtime.js','assets/js/07-sync-diagnostics-ui.js','assets/js/08-sync-hash-state.js','assets/js/09-sync-backup-recovery.js','assets/js/10-version-service.js','assets/js/11-word-data.js','assets/js/12-formatting.js','assets/js/13-activity.js','assets/js/14-auth-setup-render.js','assets/js/15-setup-events.js','assets/js/16-study-start.js','assets/js/17-flashcard-render.js','assets/js/18-speech.js','assets/js/19-gesture.js','assets/js/20-study-flow.js','assets/js/21-archive-stats.js','assets/js/22-sync-payload.js','assets/js/23-sync-v2-ops.js','assets/js/24-sync-remote-api.js','assets/js/25-sync-status-config.js','assets/js/25a-sync-status-core.js','assets/js/26-sync-apply.js','assets/js/27a-sync-active-study-guard.js','assets/js/27b-sync-decision.js','assets/js/27-sync-tick.js','assets/js/28-sync-push-patch.js','assets/js/29-sync-merge.js','assets/js/30-sync-legacy-compat.js','assets/js/31-wake-lock.js'
];
for (const file of scripts) vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), context, { filename:file });
console.log('P14 loader smoke passed');
