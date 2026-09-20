import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2];
const files = (await readdir(directory)).filter(file => file.endsWith('.sarif'));
if (!files.length) throw new Error('CodeQL produced no SARIF evidence.');
let high = 0;
for (const file of files) {
  const report = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
  if (!Array.isArray(report.runs) || !report.runs.length) throw new Error('Missing CodeQL run.');
  for (const run of report.runs) {
    if (run.invocations?.some(invocation => invocation.executionSuccessful === false)) throw new Error('CodeQL analysis failed.');
    const rules = run.tool?.driver?.rules || [];
    for (const result of run.results || []) {
      const rule = rules.find(rule => rule.id === result.ruleId) || rules[result.ruleIndex];
      const severity = Number(rule?.properties?.['security-severity'] || 0);
      if (severity >= 7 || result.level === 'error') {
        high++;
        console.error(`Blocking CodeQL finding: ${result.ruleId || 'unknown rule'}`);
      }
    }
  }
}
if (high) throw new Error(`${high} blocking CodeQL finding(s).`);
console.log('No high/critical CodeQL findings.');
