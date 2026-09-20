import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('CodeQL gate denies missing evidence, failed analysis and high-severity findings', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bravo-codeql-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, ['scripts/check-codeql.mjs', directory], { encoding: 'utf8' }).status;
  assert.notEqual(run(), 0);
  const report = { runs: [{ tool: { driver: { rules: [{ id: 'test/security', properties: { 'security-severity': '8.0' } }] } }, results: [] }] };
  const save = () => writeFile(path.join(directory, 'test.sarif'), JSON.stringify(report));
  await save(); assert.equal(run(), 0);
  report.runs[0].results = [{ ruleId: 'test/security', level: 'warning' }];
  await save(); assert.notEqual(run(), 0);
  report.runs[0].tool.driver.rules[0].properties['security-severity'] = '5.0';
  await save(); assert.equal(run(), 0);
  report.runs[0].invocations = [{ executionSuccessful: false }];
  await save(); assert.notEqual(run(), 0);
});
