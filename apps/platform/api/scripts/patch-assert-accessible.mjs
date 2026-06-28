import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src', 'project-types');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (name.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

let count = 0;
for (const file of walk(root)) {
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('assertAccessible(ctx.organizationId, projectId)')) continue;
  const next = content.replace(
    /assertAccessible\(ctx\.organizationId, projectId\)/g,
    'assertAccessible(ctx.organizationId, projectId, ctx)',
  );
  fs.writeFileSync(file, next, 'utf8');
  count += 1;
}
console.log(`patched ${count} files`);
