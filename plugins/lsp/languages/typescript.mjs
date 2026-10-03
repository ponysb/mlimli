import { nodePackageCommand, installNpmPackages, nearestRoot } from '../../../core/lsp.mjs';

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];

export const typescriptLanguageServer = {
  id: 'typescript',
  name: 'TypeScript / JavaScript',
  extensions,
  root: ({ file, workspaceRoot }) => nearestRoot(file, ['package.json', 'tsconfig.json', 'jsconfig.json'], workspaceRoot),
  resolve: ({ root, workspaceRoot, cacheDir }) => {
    const command = nodePackageCommand('typescript-language-server', 'typescript-language-server', { roots: [root, workspaceRoot], cacheDir });
    return command ? { ...command, args: [...command.args, '--stdio'], cwd: root } : undefined;
  },
  install: ({ cacheDir, signal }) => installNpmPackages({
    cacheDir,
    packages: ['typescript-language-server', 'typescript'],
    signal,
  }),
};
