// Run: node tests/selftest.test.mjs  (same suite as the in-app Tests page)
import { runAll } from '../js/selftest.js';
const res = runAll();
for (const r of res) console.log(`  ${r.pass ? 'ok' : 'FAIL'} - ${r.n}. ${r.name}${r.pass ? '' : ' → ' + r.error}`);
const failed = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - failed}/${res.length} tests passed`);
if (failed) process.exit(1);
