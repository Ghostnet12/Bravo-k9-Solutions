import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = new URL('../media/website-guide/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', source), 'utf8'));
const video = Buffer.concat(await Promise.all(manifest.parts.map(part => readFile(new URL(part, source)))));
if (video.length !== manifest.size || createHash('sha256').update(video).digest('hex') !== manifest.sha256) {
  throw new Error('The public website tutorial is incomplete or has changed. Restore its verified media parts before building.');
}
const destination = new URL('../client/public/assets/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL(manifest.file, destination), video);
console.log('Prepared the verified public website tutorial.');
