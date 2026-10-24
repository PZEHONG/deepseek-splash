// Local validation only: substitute a readable test copy of zod when the
// upstream checkout has an inaccessible dependency. Never used by the plugin.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export function resolve(specifier, context, nextResolve) {
  if (specifier === 'zod' || specifier.startsWith('zod/')) {
    return { url: pathToFileURL(require.resolve(specifier)).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
