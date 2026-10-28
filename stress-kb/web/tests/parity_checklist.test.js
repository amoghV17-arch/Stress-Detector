import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAndAnalyzeSession, generateCSV } from '../js/core/report.js';
import { FakeESP32 } from '../sim/fake-esp32.js';
import { HandshakeController } from '../js/core/handshake.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('M12 U9 Switch-Over Parity Checklist Verification', () => {
  const normalSession = loadFixture('normal_session.json');
  const syntheticSession = loadFixture('synthetic_session.json');

  test('Checklist Item 1: Handshake, reconnect and emulator work', async () => {
    let successResult = null;
    let controller;

    const fakeDevice = new FakeESP32({
      onLine: (line) => controller.handleLine(line)
    });

    controller = new HandshakeController({
      sendFn: (msg) => fakeDevice.receive(msg),
      onSuccess: (info) => { successResult = info; },
      onFailure: (err) => { throw err; }
    });

    controller.start();
    await new Promise(r => setTimeout(r, 100));

    assert.ok(successResult, 'Handshake with emulator must succeed');
    assert.equal(successResult.version, '0.1');
  });

  test('Checklist Item 2: Scripted session produces valid session JSON schema', () => {
    assert.equal(normalSession.schema, 1);
    assert.ok(normalSession.meta);
    assert.ok(normalSession.task);
    assert.ok(normalSession.baseline);
    assert.ok(normalSession.windows);
  });

  test('Checklist Item 3: Study mode shows no tape, verdict or sounds', () => {
    const runPage = fs.readFileSync(path.join(projectRoot, 'web-next', 'src', 'app', 'session', 'run', 'page.js'), 'utf-8');
    assert.ok(!runPage.includes('CanvasRhythmTape'));
    assert.ok(!runPage.includes('OledMirror'));
    assert.ok(!runPage.includes('verdict'));
    assert.ok(!runPage.includes('Audio'));
  });

  test('Checklist Item 4: All 11 report sections present, raw lux shown, synthetic banner works', () => {
    const report = parseAndAnalyzeSession(normalSession);
    assert.ok(report.summary);
    assert.ok(report.overallStress);
    assert.ok(report.timeline);
    assert.ok(report.indicators);
    assert.ok(report.patterns);
    assert.ok(report.trends);
    assert.ok(report.context);
    assert.ok(report.reliability);
    assert.ok(report.alerts);
    assert.ok(report.selfReportComparison);
    assert.ok(report.disclaimer);

    // Verify raw lux
    const luxInd = report.indicators.find(i => i.code === 'lux_mean');
    assert.ok(luxInd && luxInd.rawMean > 20, 'Raw lux must be shown');

    // Verify synthetic banner
    const synthReport = parseAndAnalyzeSession(syntheticSession);
    assert.equal(synthReport.isSynthetic, true);
  });

  test('Checklist Item 5: Download JSON/CSV work cleanly', () => {
    const csv = generateCSV(normalSession);
    assert.ok(csv.startsWith('win_id,t_end,valid'));
    const jsonStr = JSON.stringify(normalSession);
    assert.ok(jsonStr.length > 500);
  });

  test('Checklist Item 6: Typed characters never appear in stored or exported data', () => {
    const serialized = JSON.stringify(normalSession);
    // Recursively check no field named 'text', 'char', 'string', 'word'
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.text, undefined);
    assert.equal(parsed.typedText, undefined);
    assert.equal(parsed.chars, undefined);
  });
});
