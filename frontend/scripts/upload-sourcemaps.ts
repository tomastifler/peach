import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const artifacts = fileURLToPath(new URL('../../build/sentry/browser', import.meta.url));
const publicDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
/* Production JavaScript: two fixed-name entries plus the chunks the main bundle splits out per page (ADR-0118). */
const shippedScript = /^(?:peach-pages\.js|peach-app(?:\.[A-Za-z0-9_-]+)?\.js)$/;

/** Verify that the files to upload and the distributed files are byte-for-byte identical and one-to-one; the CLI is not started when configuration is missing. */
export function prepareBrowserUpload(env: Record<string, string | undefined>, directory = artifacts, shipped = publicDist): string[] {
  for (const name of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    if (!env[name]?.trim()) throw new Error(`Uploading source maps requires ${name}`);
  }
  const scripts = (folder: string) => readdirSync(folder).filter(name => shippedScript.test(name)).sort();
  const names = scripts(shipped);
  if (!names.includes('peach-app.js') || !names.includes('peach-pages.js')) throw new Error('The distributed artifacts are missing the fixed-name entries');
  const built = scripts(directory);
  if (built.join('\n') !== names.join('\n')) throw new Error(`The files of the private build and the distributed artifacts do not match: ${built.join(', ')} ≠ ${names.join(', ')}`);
  for (const name of names) {
    const javascript = readFileSync(resolve(directory, name));
    if (!javascript.equals(readFileSync(resolve(shipped, name)))) throw new Error(`${name} does not match the distributed artifacts`);
    const debugId = javascript.toString('utf8').match(/\/\/# debugId=([a-f0-9-]+)\s*$/i)?.[1];
    const map = JSON.parse(readFileSync(resolve(directory, `${name}.map`), 'utf8'));
    if (!debugId || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(debugId) || map.debug_id !== debugId || !map.sourcesContent?.length) {
      throw new Error(`${name} is missing a matching source map and Debug ID`);
    }
  }
  return ['sourcemaps', 'upload', '--validate', '--strict', '--wait', '--url-prefix', 'app:///', directory];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = prepareBrowserUpload(process.env);
    const { SentryCli } = await import('@sentry/cli');
    await new SentryCli(null, {}).execute(args, true);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Source map upload failed');
    process.exitCode = 1;
  }
}
