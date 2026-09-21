// Source-only test loader. No React/SDK implementation is replaced by this
// loader. The api/client barrel is narrowed to its real error classes because
// tested transfer functions use only those runtime exports (other imports are types).
const fs = require('node:fs');
const path = require('node:path');
function createLoader(root) {
  const ts = require(process.env.TYPESCRIPT_PATH || require.resolve('typescript', { paths: [path.join(root, 'frontend')] }));
  const cache = new Map();
  function load(relative) {
    let file = path.resolve(root, relative);
    file = [file, file + '.ts', file + '.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!file) throw new Error('Missing source ' + relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
      fileName: file, reportDiagnostics: true,
    });
    if (compiled.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(compiled.diagnostics, {
      getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n',
    }));
    const requireLocal = spec => {
      if (!spec.startsWith('.')) throw new Error('Unexpected external runtime dependency ' + spec);
      const target = path.resolve(path.dirname(file), spec);
      if (target === path.join(root, 'frontend/src/api/client')) return load('frontend/src/api/errors.ts');
      return load(target);
    };
    new Function('require', 'module', 'exports', compiled.outputText)(requireLocal, module, module.exports);
    return module.exports;
  }
  return load;
}
module.exports = { createLoader };
