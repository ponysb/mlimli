# LSP language services

MLI Agent uses a shared LSP runtime and language-pack plugins. The runtime starts a language server only when a matching file is opened or changed, keeps the process scoped to the detected project root, synchronizes file contents over JSON-RPC, and returns diagnostics to the Agent after edits.

The built-in `lsp` plugin currently supports TypeScript/JavaScript and Python. It first looks for a project-local or system-installed server. If none is available, the Agent asks whether it may install the server into the user data cache. The project `package.json` and lockfiles are not modified by this installation.

Set `MLI_LSP_AUTO_INSTALL=1` to allow trusted built-in language packs to install without asking. Leave it unset for the default confirmation flow. The plugin also exposes an `lsp` tool for definition, reference, hover, implementation, symbol, and call-hierarchy queries, plus `lsp_status` for diagnostics.

Third-party language packs can register a definition through the plugin setup context:

```js
ctx.registerLanguageServer({
  id: 'rust',
  name: 'Rust Analyzer',
  extensions: ['.rs'],
  root: ({ file, workspaceRoot }) => findProjectRoot(file, workspaceRoot),
  resolve: ({ root, cacheDir }) => findRustAnalyzer(root, cacheDir),
  install: ({ cacheDir, signal }) => installRustAnalyzer(cacheDir, signal),
});
```

Language servers run locally in the same runtime that owns the workspace. The model can be remote, but source analysis stays with the project files unless a plugin explicitly implements a remote server.
