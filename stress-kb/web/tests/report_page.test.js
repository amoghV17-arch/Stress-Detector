import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAndAnalyzeSession, generateCSV } from '../js/core/report.js';
import { generateVerdictSentence } from '../js/core/verdict.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('U5 Report Body, Copy & Data Pipeline', () => {
  const normalSession = loadFixture('normal_session.json');
  const lowCoverageSession = loadFixture('low_coverage_session.json');
  const noBaselineSession = loadFixture('no_baseline_session.json');
  const syntheticSession = loadFixture('synthetic_session.json');
  const calSession = loadFixture('cal_session.json');

  test('normal_session: parses all 11 REPORT_SPEC sections completely', () => {
    const report = parseAndAnalyzeSession(normalSession);

    // Section 1: Session summary
    assert.ok(report.summary);
    assert.equal(report.summary.userId, 'u01');
    assert.equal(report.summary.coveragePercent, 100);

    // Section 2: Overall stress
    assert.ok(report.overallStress);
    assert.ok(['Low', 'Medium', 'High'].includes(report.overallStress.level));
    assert.ok(report.overallStress.meanConfidence > 0);

    // Section 3: Timeline
    assert.ok(report.timeline);
    assert.equal(report.timeline.length, 10);

    // Section 4: Indicators (18 features)
    assert.ok(report.indicators);
    assert.equal(report.indicators.length, 18);
    // VERIFY RAW LUX FIX: lux_mean (#17) and lux_std (#18) must show raw lux values (> 20), NOT log(lux) (< 8)
    const luxMeanInd = report.indicators.find(i => i.code === 'lux_mean');
    assert.ok(luxMeanInd);
    assert.ok(luxMeanInd.rawMean > 20, `lux_mean must be raw lux (>20 lx), got ${luxMeanInd.rawMean}`);

    // Section 5: Behaviour patterns (6 flags)
    assert.ok(report.patterns);
    assert.equal(report.patterns.length, 6);

    // Section 6: Trends (first third vs last third)
    assert.ok(report.trends);
    assert.ok(report.trends.speed);
    assert.ok(report.trends.errors);

    // Section 7: Context (Ambient light)
    assert.ok(report.context);
    assert.equal(report.context.hasSensor, true);
    assert.ok(report.context.meanLux > 0);

    // Section 8: Reliability
    assert.ok(report.reliability);
    assert.equal(report.reliability.coveragePercent, 100);

    // Section 9: Alerts
    assert.ok(report.alerts);
    assert.equal(report.alerts.count, 1);

    // Section 10: Self-report comparison
    assert.ok(report.selfReportComparison);
    assert.equal(report.selfReportComparison.hasReport, true);
    assert.equal(report.selfReportComparison.reportedLevel, 'High');

    // Section 11: Disclaimer
    assert.ok(report.disclaimer);
    assert.ok(report.disclaimer.text.includes('Behavioural estimate'));
  });

  test('verdict sentence is deterministic, human-readable, and confidence-gated', () => {
    const verdict = generateVerdictSentence(normalSession);
    assert.ok(typeof verdict === 'string');
    assert.ok(verdict.length > 15);
    assert.ok(verdict.includes('sure.'));
  });

  test('insufficient data skips sections 2, 5, 6, and 10', () => {
    const report = parseAndAnalyzeSession(lowCoverageSession);
    assert.equal(report.isInsufficientData, true);
    assert.equal(report.overallStress, null);
    assert.equal(report.patterns, null);
    assert.equal(report.trends, null);
    assert.equal(report.selfReportComparison, null);
  });

  test('calibration session creates baseline summary instead of stress report', () => {
    const report = parseAndAnalyzeSession(calSession);
    assert.equal(report.isCalibration, true);
    assert.ok(report.calibrationStats);
    assert.ok(report.calibrationStats.featureTable.length >= 18);
  });

  test('CSV generator exports valid RFC-style format with headers', () => {
    const csv = generateCSV(normalSession);
    assert.ok(csv.startsWith('win_id,t_end,valid,n_keys,kpm'));
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, 11); // header + 10 windows
  });
});
