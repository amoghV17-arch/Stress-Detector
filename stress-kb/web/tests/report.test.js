import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAndAnalyzeSession, generateCSV, FEATURE_DEFINITIONS, PATTERN_FLAG_RULES } from '../js/core/report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('Report Generator — parseAndAnalyzeSession', () => {
  test('normal_session: parses all 11 sections completely', () => {
    const session = loadFixture('normal_session.json');
    const report = parseAndAnalyzeSession(session);

    // Section 1: Session summary
    assert.equal(report.summary.userId, 'u01');
    assert.equal(report.summary.sessionId, 's02');
    assert.equal(report.summary.totalWindows, 10);
    assert.equal(report.summary.validWindows, 10);
    assert.equal(report.summary.coveragePercent, 100);
    assert.equal(report.summary.hasPersonalBaseline, true);
    assert.equal(report.summary.isSynthetic, false);
    assert.equal(report.isInsufficientData, false);
    assert.equal(report.isCalibration, false);

    // Section 2: Overall stress
    assert.ok(report.overallStress);
    assert.ok(['Low', 'Medium', 'High'].includes(report.overallStress.level));
    assert.ok(report.overallStress.meanScore >= 0 && report.overallStress.meanScore <= 1);
    assert.ok(report.overallStress.meanConfidence > 0);
    const dist = report.overallStress.distribution;
    assert.equal(dist.lowPercent + dist.mediumPercent + dist.highPercent, 100);

    // Section 3: Timeline
    assert.equal(report.timeline.length, 10);
    const win7 = report.timeline.find(w => w.winId === 7);
    assert.ok(win7);
    assert.equal(win7.alert, true);

    // Section 4: Indicators table (18 features)
    assert.equal(report.indicators.length, 18);
    const topContributors = report.indicators.filter(i => i.isTopContributor);
    assert.equal(topContributors.length, 3);
    report.indicators.forEach(ind => {
      assert.ok(['↑', '↓', '→'].includes(ind.arrow));
      assert.ok(typeof ind.rawMean === 'number');
      assert.ok(typeof ind.zScore === 'number');
      assert.ok(ind.meaning.length > 0);
    });

    // Section 5: Behaviour patterns (6 flags)
    assert.ok(report.patterns);
    assert.equal(report.patterns.length, 6);
    const rushed = report.patterns.find(p => p.flag === 'RUSHED');
    assert.ok(rushed);
    assert.ok(rushed.activeCount > 0);

    // Section 6: Trends (first third vs last third)
    assert.ok(report.trends);
    assert.ok(['increasing', 'decreasing', 'stable'].includes(report.trends.speed.direction));
    assert.ok(['increasing', 'decreasing', 'stable'].includes(report.trends.errors.direction));

    // Section 7: Context
    assert.ok(report.context);
    assert.equal(report.context.hasSensor, true);
    assert.ok(report.context.meanLux > 0);
    assert.equal(report.context.lowLight, false);

    // Section 8: Reliability
    assert.ok(report.reliability);
    assert.equal(report.reliability.coveragePercent, 100);
    assert.equal(report.reliability.defaultBaselineWarning, false);

    // Section 9: Alerts
    assert.ok(report.alerts);
    assert.equal(report.alerts.count, 1);
    assert.equal(report.alerts.moments[0].winId, 7);

    // Section 10: Self-report comparison
    assert.ok(report.selfReportComparison);
    assert.equal(report.selfReportComparison.hasReport, true);
    assert.equal(report.selfReportComparison.reportedRating, 4);
    assert.equal(report.selfReportComparison.reportedLevel, 'High');

    // Section 11: Disclaimer & Break suggestions
    assert.ok(report.disclaimer.text.includes('Not a medical or psychological assessment'));
    if (report.overallStress.level === 'High') {
      assert.ok(report.disclaimer.suggestions.length > 0);
    }
  });

  test('low_coverage_session: triggers isInsufficientData and skips sections 2, 5, 6, 10', () => {
    const session = loadFixture('low_coverage_session.json');
    const report = parseAndAnalyzeSession(session);

    assert.equal(report.isInsufficientData, true);
    assert.equal(report.summary.validWindows, 2);
    assert.equal(report.summary.totalWindows, 10);
    assert.equal(report.summary.coveragePercent, 20);

    // Sections 2, 5, 6, 10 must be null per validity rules in REPORT_SPEC.md
    assert.equal(report.overallStress, null);
    assert.equal(report.patterns, null);
    assert.equal(report.trends, null);
    assert.equal(report.selfReportComparison, null);

    // Reliability contains warnings
    assert.equal(report.reliability.warnings.length, 1);
    assert.equal(report.reliability.warnings[0].code, 'GAP');
  });

  test('no_baseline_session: flags default baseline warning', () => {
    const session = loadFixture('no_baseline_session.json');
    const report = parseAndAnalyzeSession(session);

    assert.equal(report.summary.hasPersonalBaseline, false);
    assert.equal(report.summary.baselineSource, 'Default Population Baseline');
    assert.equal(report.reliability.defaultBaselineWarning, true);
    assert.equal(report.indicators.length, 18);
  });

  test('synthetic_session: flags isSynthetic as true', () => {
    const session = loadFixture('synthetic_session.json');
    const report = parseAndAnalyzeSession(session);

    assert.equal(report.isSynthetic, true);
    assert.equal(report.summary.isSynthetic, true);
  });

  test('cal_session: generates calibration baseline summary instead of stress report', () => {
    const session = loadFixture('cal_session.json');
    const report = parseAndAnalyzeSession(session);

    assert.equal(report.isCalibration, true);
    assert.ok(report.calibrationStats);
    assert.equal(report.calibrationStats.validWindowsCount, 12);
    assert.equal(report.calibrationStats.mu.length, 18);
    assert.equal(report.calibrationStats.sd.length, 18);
    assert.equal(report.calibrationStats.featureTable.length, 18);
  });

  test('generateCSV produces correct RFC-style CSV format', () => {
    const session = loadFixture('normal_session.json');
    const csv = generateCSV(session);

    assert.ok(typeof csv === 'string');
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, 11); // 1 header + 10 windows

    const header = lines[0].split(',');
    assert.equal(header[0], 'win_id');
    assert.equal(header[1], 't_end');
    assert.equal(header[2], 'valid');
    assert.equal(header[3], 'n_keys');
    assert.ok(header.includes('kpm'));
    assert.ok(header.includes('cls'));
    assert.ok(header.includes('alert'));

    // Check each data line has same number of fields as header
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      assert.equal(cols.length, header.length);
    }
  });
});
