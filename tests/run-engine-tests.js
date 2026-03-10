ObjC.import('Foundation');

function readText(path) {
  var contents = $.NSString.stringWithContentsOfFileEncodingError(
    $(path),
    $.NSUTF8StringEncoding,
    null
  );
  return ObjC.unwrap(contents);
}

var engineSource = readText('./engine.js');
var testsSource = readText('./tests/tests.js');

eval(engineSource);
eval(testsSource);

var report = runEngineTests();

report.results.forEach(function (result) {
  if (result.passed) {
    console.log('PASS: ' + result.name);
  } else {
    console.log('FAIL: ' + result.name + ' -> ' + result.error);
  }
});

console.log('');
console.log(report.passed + ' / ' + report.total + ' tests passed');

if (report.failed > 0) {
  throw new Error('Engine tests failed');
}
