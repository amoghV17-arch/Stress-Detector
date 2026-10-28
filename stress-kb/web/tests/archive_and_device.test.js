import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { saveSessionToArchive, getAllArchivedSessions, deleteArchivedSession, clearArchivedSessions } from '../../web-next/src/lib/sessionArchive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(filename) {
  const filePath = path.join(fixturesDir, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('U8 Archive, Device & Method Pages', () => {
  const normalSession = loadFixture('normal_session.json');
  const syntheticSession = loadFixture('synthetic_session.json');

  test('sessionArchive: saves, retrieves, and persists sessions in memory/IDB', async () => {
    await clearArchivedSessions();

    await saveSessionToArchive(normalSession);
    await saveSessionToArchive(syntheticSession);

    const list = await getAllArchivedSessions();
    assert.equal(list.length, 2);
    assert.ok(list.some(s => s.id === 's02'));
    assert.ok(list.some(s => s.id === 's05_synth'));

    // Delete one session
    await deleteArchivedSession(list[0].id);
    const updated = await getAllArchivedSessions();
    assert.equal(updated.length, 1);

    // Clear all
    await clearArchivedSessions();
    const emptyList = await getAllArchivedSessions();
    assert.equal(emptyList.length, 0);
  });

  test('method page: contains required ethical disclosures and honest limitations', () => {
    const methodPagePath = path.join(projectRoot, 'web-next', 'src', 'app', 'method', 'page.js');
    const methodCode = fs.readFileSync(methodPagePath, 'utf-8');

    assert.ok(methodCode.includes('How it works'));
    assert.ok(methodCode.includes('Zero-knowledge privacy architecture'));
    assert.ok(methodCode.includes('Latin-Square Counterbalancing'));
    assert.ok(methodCode.includes('CAL Baseline Pace Scaling'));
    assert.ok(methodCode.includes('Limitations stated honestly'));
    assert.ok(methodCode.includes('Subjective Ground Truth'));
    assert.ok(methodCode.includes('Pilot Sample Size'));
    assert.ok(methodCode.includes('Illumination') && methodCode.includes('Environmental Confounds'));
    assert.ok(methodCode.includes('Baseline Drift'));
    assert.ok(methodCode.includes('What this can\'t tell you') || methodCode.includes("What this can&apos;t tell you"));
  });

  test('device page: renders hardware connection, OLED mirror, and log tape', () => {
    const devicePagePath = path.join(projectRoot, 'web-next', 'src', 'app', 'device', 'page.js');
    const deviceCode = fs.readFileSync(devicePagePath, 'utf-8');

    assert.ok(deviceCode.includes('OledMirror'));
    assert.ok(deviceCode.includes('Device Log'));
    assert.ok(deviceCode.includes('Hardware Connection'));
    assert.ok(deviceCode.includes('Test Motor Buzz'));
  });
});
