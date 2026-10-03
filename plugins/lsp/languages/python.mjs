import { nodePackageCommand, installNpmPackages, nearestRoot } from '../../../core/lsp.mjs';

export const pythonLanguageServer = {
  id: 'python',
  name: 'Python (Pyright)',
  extensions: ['.py', '.pyi'],
  root: ({ file, workspaceRoot }) => nearestRoot(file, ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'pyrightconfig.json'], workspaceRoot),
  resolve: ({ root, workspaceRoot, cacheDir }) => {
    const command = nodePackageCommand('pyright', 'pyright-langserver', { roots: [root, workspaceRoot], cacheDir });
    return command ? { ...command, args: [...command.args, '--stdio'], cwd: root } : undefined;
  },
  install: ({ cacheDir, signal }) => installNpmPackages({
    cacheDir,
    packages: ['pyright'],
    signal,
  }),
};
