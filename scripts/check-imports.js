const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// All tracked files under src/server
const tracked = new Set(execSync('git ls-files src/server', { encoding: 'utf8' }).trim().split('\n'));
let missing = [];
function resolve(rel, fromFile) {
  const base = path.posix.join(path.posix.dirname(fromFile), rel);
  const cands = [base, base.replace(/\.js$/, '.ts'), base + '/index.ts'];
  return cands.find((c) => tracked.has(c));
}
for (const f of tracked) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(f, 'utf8');
  const re = /from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2];
    const r = resolve(spec, f);
    if (!r) missing.push(f + ' -> ' + spec);
  }
}
console.log(missing.length ? missing.slice(0, 40).join('\n') : 'ALL_RELATIVE_IMPORTS_TRACKED');
console.log('TOTAL_MISSING:', missing.length);
