'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => assert.ok(fs.existsSync(path.join(root, relative)), `Missing ${relative}`);

const required = [
  'index.html', 'manifest.webmanifest', 'service-worker.js', 'README.md', 'DEPLOY.md', '.nojekyll',
  'assets/css/app.css', 'assets/js/storage.js', 'assets/js/schedule.js', 'assets/js/calendar.js',
  'assets/js/backup.js', 'assets/js/ui.js', 'assets/js/app.js', 'assets/icons/icon-192.png',
  'assets/icons/icon-512.png', 'assets/icons/maskable-192.png', 'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon.png', 'sample/Plantation-朋友学期计划.json',
  'docs/Plantation-iPhone网页版使用说明.md'
];
required.forEach(exists);

const index = read('index.html');
const css = read('assets/css/app.css');
const appSource = read('assets/js/app.js');
const storageSource = read('assets/js/storage.js');
const uiSource = read('assets/js/ui.js');
const sw = read('service-worker.js');
const manifest = JSON.parse(read('manifest.webmanifest'));
const runtimeText = ['index.html', 'manifest.webmanifest', 'service-worker.js', 'assets/css/app.css', 'assets/js/storage.js', 'assets/js/schedule.js', 'assets/js/calendar.js', 'assets/js/backup.js', 'assets/js/ui.js', 'assets/js/app.js'].map(read).join('\n');

assert.ok(!/(?:src|href)=["']\/(?!\/)/.test(index), 'Root-absolute HTML asset path found');
assert.ok(!/register\(["']\//.test(appSource), 'Root-absolute service worker path found');
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
assert.ok(index.includes('apple-mobile-web-app-capable'));
assert.ok(index.includes('apple-mobile-web-app-status-bar-style'));
assert.ok(index.includes('apple-touch-icon'));
assert.ok(css.includes('env(safe-area-inset-top)') && css.includes('env(safe-area-inset-bottom)'));
assert.ok(css.includes('@media (prefers-color-scheme: dark)'));
assert.ok(css.includes('#eef6ff') && css.includes('#02060b') && css.includes('#0b2340'));
assert.ok(css.includes('overflow-x: hidden'));
assert.match(css, /\.check-button \{[^}]*width: 44px;[^}]*min-height: 44px;/);
assert.ok(!/@media \(max-width: 340px\)[\s\S]*?\.check-button \{[^}]*40px/.test(css));
assert.match(sw, /const CACHE_NAME = 'plantation-v\d+\.\d+\.\d+'/);
assert.ok(sw.includes("event.data.type === 'SKIP_WAITING'"));
assert.ok(sw.includes('self.registration.scope'));
assert.ok(appSource.includes("register('./service-worker.js', { scope: './', updateViaCache: 'none' })"));
assert.ok(appSource.includes('registration.waiting'));
assert.ok(appSource.includes("incoming.exportType !== 'complete-backup'"));
assert.ok((appSource.match(/effectiveFrom: next\.semester\.startDate/g) || []).length >= 2);
assert.ok(storageSource.includes('candidateTimestamp') && storageSource.includes('比 IndexedDB 更新的本地备用数据'));
assert.ok(uiSource.includes('input name="kind" list="kind-options"'), 'Plan type should be a free-text input with suggestions');
assert.ok(!uiSource.includes('<select name="kind">'), 'Plan type must not be limited to a fixed select');
assert.ok(!/<script[^>]+type=["']module/.test(index), 'Direct file mode should use classic scripts');
for (const forbidden of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs', 'unpkg', 'jsdelivr', 'firebase', 'googleapis']) {
  assert.ok(!runtimeText.toLowerCase().includes(forbidden), `Forbidden runtime dependency: ${forbidden}`);
}

function pngSize(relative) {
  const data = fs.readFileSync(path.join(root, relative));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
assert.deepEqual(pngSize('assets/icons/icon-192.png'), [192, 192]);
assert.deepEqual(pngSize('assets/icons/icon-512.png'), [512, 512]);
assert.deepEqual(pngSize('assets/icons/maskable-192.png'), [192, 192]);
assert.deepEqual(pngSize('assets/icons/maskable-512.png'), [512, 512]);
assert.deepEqual(pngSize('assets/icons/apple-touch-icon.png'), [180, 180]);

const sandbox = {
  window: {}, console, Date, Intl, JSON, Math, Number, String, Set, Map, Object, Array, RegExp, Error,
  TextEncoder, Blob, URL, setTimeout, clearTimeout,
  document: { createElement: () => ({ click() {}, remove() {} }), body: { append() {} } }
};
sandbox.window.window = sandbox.window;
sandbox.window.crypto = require('node:crypto').webcrypto;
sandbox.window.setTimeout = setTimeout;
vm.createContext(sandbox);
for (const file of ['assets/js/schedule.js', 'assets/js/calendar.js', 'assets/js/backup.js']) {
  vm.runInContext(read(file), sandbox, { filename: file });
}
const P = sandbox.window.Plantation;
const sampleText = read('sample/Plantation-朋友学期计划.json');
const sampleRaw = JSON.parse(sampleText);
const sample = P.Backup.normalize(sampleRaw);
assert.equal(sample.schemaVersion, 2);
assert.equal(sample.baseSchedule.length, 87);
assert.equal(sample.dateOverrides.length, 96);
assert.equal(P.Schedule.materializeRange(sample, sample.semester.startDate, sample.semester.endDate).length, 1296);
assert.equal(sample.meta.source, 'bundled-anonymous-demo');
const publicCourses = sample.baseSchedule.filter((rule) => rule.kind === '课程');
assert.ok(publicCourses.length && publicCourses.every((rule) => /^示例课程 \d+$/.test(rule.title) && /^anonymous-series-\d+$/.test(rule.originalSeries) && rule.note.includes('不含真实课表信息')));
for (const privateMarker of ['24工管', '24大数据', '黄辉', '范爽', '颜明健', '何娜', '文C#', '经管#']) assert.ok(!sampleText.includes(privateMarker), `Private marker leaked: ${privateMarker}`);
assert.equal(P.Schedule.teachingWeek('2026-09-07', sample.semester), 1);
assert.equal(P.Schedule.teachingWeek('2026-09-28', sample.semester), 0);
assert.equal(P.Schedule.teachingWeek('2026-10-05', sample.semester), 4);
assert.match(P.Schedule.weekLabel('2026-10-05', sample.semester), /双周/);

const repeated = sample.baseSchedule.find((rule) => rule.dates.length > 2);
assert.ok(repeated);
const firstDate = repeated.dates[0];
const secondDate = repeated.dates[1];
const firstKey = P.Schedule.occurrenceKey(repeated.id, firstDate);
const secondKey = P.Schedule.occurrenceKey(repeated.id, secondDate);
const layered = P.Backup.normalize(JSON.parse(JSON.stringify(sample)));
layered.permanentOverrides.push({ id: 'test-permanent', seriesId: repeated.id, effectiveFrom: firstDate, action: 'update', patch: { note: '永久备注' }, createdAt: '2026-09-13T00:00:01.000Z' });
layered.dateOverrides.push({ id: 'test-date', date: firstDate, action: 'update', targetId: firstKey, patch: { note: '临时备注' }, source: 'user', createdAt: '2026-09-13T00:00:02.000Z' });
const layeredClean = P.Backup.normalize(layered);
assert.equal(P.Schedule.materializeDay(layeredClean, firstDate).find((item) => item.id === firstKey).note, '临时备注');
layeredClean.dateOverrides.push({ id: 'test-delete-one', date: firstDate, action: 'delete', targetId: firstKey, source: 'user', createdAt: '2026-09-13T00:00:03.000Z' });
assert.ok(!P.Schedule.materializeDay(P.Backup.normalize(layeredClean), firstDate).some((item) => item.id === firstKey));

const deleteFuture = P.Backup.normalize(JSON.parse(JSON.stringify(sample)));
deleteFuture.checkins[firstKey] = { completedAt: null, snapshot: { date: firstDate, title: repeated.title, kind: repeated.kind } };
deleteFuture.permanentOverrides.push({ id: 'test-delete-future', seriesId: repeated.id, effectiveFrom: secondDate, action: 'delete', patch: {}, createdAt: '2026-09-13T00:00:04.000Z' });
const deletedClean = P.Backup.normalize(deleteFuture);
assert.ok(P.Schedule.materializeDay(deletedClean, firstDate).some((item) => item.id === firstKey));
assert.ok(!P.Schedule.materializeDay(deletedClean, secondDate).some((item) => item.id === secondKey));
assert.ok(deletedClean.checkins[firstKey], 'Historical check-in should survive schedule deletion');

const withAdd = P.Backup.normalize(JSON.parse(JSON.stringify(sample)));
withAdd.dateOverrides.push({ id: 'test-add', date: firstDate, action: 'add', plan: { title: '临时任务', kind: '自主学习', startTime: '06:00', endTime: '06:30', location: '', note: '' }, source: 'user', createdAt: '2026-09-13T00:00:05.000Z' });
assert.ok(P.Schedule.materializeDay(P.Backup.normalize(withAdd), firstDate).some((item) => item.title === '临时任务'));

const withCustomKind = P.Backup.normalize(JSON.parse(JSON.stringify(sample)));
withCustomKind.preferences.customKinds = ['社团'];
withCustomKind.dateOverrides.push({ id: 'test-custom-kind', date: firstDate, action: 'add', plan: { title: '志愿活动', kind: '公益志愿', startTime: '06:30', endTime: '07:00', location: '', note: '' }, source: 'user', createdAt: '2026-09-13T00:00:05.500Z' });
const customKindClean = P.Backup.normalize(withCustomKind);
assert.ok(P.Schedule.materializeDay(customKindClean, firstDate).some((item) => item.kind === '公益志愿'));
assert.ok(P.Schedule.allKinds(customKindClean).includes('社团'));
assert.ok(P.Schedule.allKinds(customKindClean).includes('公益志愿'));

const partialTimePatch = JSON.parse(JSON.stringify(sample));
partialTimePatch.permanentOverrides.push({ id: 'partial-time', seriesId: repeated.id, effectiveFrom: firstDate, action: 'update', patch: { startTime: '23:00' }, createdAt: '2026-09-13T00:00:06.000Z' });
assert.throws(() => P.Backup.normalize(partialTimePatch), /同时提供开始和结束时间/);

const legacy = {
  version: 1, termStart: '2026-09-07', termEnd: '2026-09-14', alarms: false,
  events: [{ id: 'old-1', series: 'old-series', day: '2026-09-07', start: '2026-09-07T08:00:00+08:00', end: '2026-09-07T09:00:00+08:00', title: '旧计划', kind: '课程', location: 'A101', notes: '保留备注' }],
  done: { 'old-1': true }
};
const migrated = P.Backup.normalize(legacy);
assert.equal(migrated.baseSchedule.length, 1);
assert.equal(Object.keys(migrated.checkins).length, 1);
assert.equal(migrated.reminderSettings.enabled, false);
assert.equal(P.Schedule.materializeDay(migrated, '2026-09-07')[0].note, '保留备注');
assert.throws(() => P.Backup.normalize({ schemaVersion: 2, semester: sample.semester, baseSchedule: [sample.baseSchedule[0], sample.baseSchedule[0]], permanentOverrides: [], dateOverrides: [], checkins: {} }), /重复/);

const firstTen = P.Schedule.materializeRange(sample, sample.semester.startDate, sample.semester.endDate).slice(0, 10);
const icsOn = P.Calendar.generateICS(firstTen, { enabled: true, minutesBefore: 10 });
const icsOff = P.Calendar.generateICS(firstTen, { enabled: false, minutesBefore: 10 });
assert.equal((icsOn.match(/BEGIN:VEVENT/g) || []).length, 10);
assert.equal((icsOn.match(/BEGIN:VALARM/g) || []).length, 10);
assert.ok(!icsOff.includes('BEGIN:VALARM'));
assert.ok(icsOn.includes('TRIGGER:-PT10M'));
assert.ok(icsOn.includes('LOCATION:') && icsOn.includes('DESCRIPTION:'));
assert.ok(!/(?<!\r)\n/.test(icsOn), 'ICS must use CRLF');
for (const line of icsOn.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `ICS line exceeds 75 octets: ${line}`);
assert.equal(P.Calendar.stableHash(firstTen[0].id), P.Calendar.stableHash(firstTen[0].id));

const cached = [...sw.matchAll(/'\.\/([^']*)'/g)].map((match) => match[1]);
for (const file of ['index.html', 'manifest.webmanifest', 'assets/css/app.css', 'assets/js/app.js', 'assets/icons/icon-192.png', 'sample/Plantation-朋友学期计划.json']) {
  assert.ok(cached.includes(file), `Service Worker does not cache ${file}`);
}

console.log(JSON.stringify({
  result: 'PASS', files: required.length, baseSeries: sample.baseSchedule.length,
  importedDateOverrides: sample.dateOverrides.length, materializedPlans: 1296,
  theme: 'white+blue / near-black+deep-blue', subpathSafe: true, icons: true,
  legacyMigration: true, layeredOverrides: true, historicalCheckins: true, customKinds: true,
  ics: 'UTF-8 CRLF, 75-octet folding, alarm toggle', forbiddenRuntimeCDNs: 'none'
}, null, 2));
