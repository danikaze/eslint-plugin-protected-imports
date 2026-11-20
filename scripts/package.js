import { zipSync } from 'fflate';
import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist');
mkdirSync(output, { recursive: true });

const npm = process.env.npm_execpath;
if (!npm) {
  throw new Error('Run this script with npm run build.');
}

const packOutput = execFileSync(
  process.execPath,
  [npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', output],
  { cwd: root, encoding: 'utf8' }
);
const [pack] = JSON.parse(packOutput);
const files = {};
for (const { path: filename } of pack.files) {
  files['package/' + filename] = readFileSync(path.join(root, filename));
}

const zipName = pack.filename.replace(/\.tgz$/, '.zip');
writeFileSync(path.join(output, zipName), zipSync(files));
console.log('Created dist/' + pack.filename + ' and dist/' + zipName);
