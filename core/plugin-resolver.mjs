import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = process.env.MLI_AGENT_DATA_DIR ? path.resolve(process.env.MLI_AGENT_DATA_DIR) : appRoot;
let roots = { appRoot, dataRoot, pluginsRoot: path.join(dataRoot, 'plugins') };
export function initialize(data) { roots = data; }

function inside(file, directory) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parent = fileURLToPath(context.parentURL);
    if (inside(parent, roots.pluginsRoot)) {
      const target = new URL(specifier, context.parentURL);
      const targetPath = fileURLToPath(target);
      const oldCoreRoot = path.join(roots.dataRoot, 'core');
      if (inside(targetPath, oldCoreRoot)) {
        const destination = pathToFileURL(path.join(roots.appRoot, 'core', path.relative(oldCoreRoot, targetPath)));
        destination.search = target.search;
        destination.hash = target.hash;
        return nextResolve(destination.href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
