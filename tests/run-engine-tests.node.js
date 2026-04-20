// Node-compatible test runner. The existing macOS runner (run-engine-tests.js
// using osascript) is still the supported way to run tests on macOS. This file
// exists so the tests can also be run with `node tests/run-engine-tests.node.js`.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(repoRoot, 'engine.js'), 'utf8');
const testsSource = fs.readFileSync(path.join(repoRoot, 'tests', 'tests.js'), 'utf8');

// Use an indirect eval so the engine.js IIFE attaches to globalThis.
(0, eval)(engineSource);
(0, eval)(testsSource);

const report = globalThis.runEngineTests();

report.results.forEach((result) => {
  if (result.passed) {
    console.log('PASS: ' + result.name);
  } else {
    console.log('FAIL: ' + result.name + ' -> ' + result.error);
  }
});

console.log('');
console.log(report.passed + ' / ' + report.total + ' tests passed');

if (report.failed > 0) {
  process.exit(1);
}
