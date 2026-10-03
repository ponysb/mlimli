import solidPlugin from '@opentui/solid/bun-plugin';

const result = await Bun.build({
  entrypoints: ['cli/modern/entry.tsx'],
  target: 'bun',
  conditions: ['bun', 'node'],
  plugins: [solidPlugin],
  minify: true,
  // Native libraries are staged beside the executable and selected by setRenderLibPath.
  external: ['@opentui/core-win32-*', '@opentui/core-linux-*', '@opentui/core-darwin-*'],
  compile: { target: process.argv[2] as any, outfile: process.argv[3], autoloadDotenv: false, autoloadBunfig: false },
});
if (!result.success) throw new AggregateError(result.logs, 'TUI compilation failed');
