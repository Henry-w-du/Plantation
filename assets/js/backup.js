(function (P) {
  'use strict';
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const MAX_RULES = 10000;
  const MAX_OVERRIDES = 30000;
  const MAX_CHECKINS = 50000;

  function text(value, label, max, required = false) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}格式不正确。`);
    return value;
  }

  function date(value, label) {
    if (!P.Schedule.validDate(value)) throw new Error(`${label}不是有效日期。`);
    return value;
  }

  function time(value, label) {
    if (!P.Schedule.validTime(value)) throw new Error(`${label}不是有效时间。`);
    return value;
  }

  function defaultSemester() {
    return {
      id: 'semester-2026-autumn', name: '2026 秋季学期', startDate: '2026-09-07',
      weekOneStart: '2026-09-07', endDate: '2027-01-17', timeZone: 'Asia/Shanghai',
      breaks: [{ name: '秋假', startDate: '2026-09-28', endDate: '2026-10-04', countsAsTeachingWeek: false }]
    };
  }

  function emptyState() {
    const now = new Date().toISOString();
    return {
      schemaVersion: 2, app: 'Plantation', exportType: 'complete-backup',
      semester: defaultSemester(), baseSchedule: [], permanentOverrides: [], dateOverrides: [], checkins: {},
      reminderSettings: { enabled: true, minutesBefore: 10 }, preferences: {},
      meta: { createdAt: now, updatedAt: now, source: 'empty' }
    };
  }

  function cleanSemester(input) {
    const fallback = defaultSemester();
    const source = input || {};
    const startDate = date(source.startDate || source.weekOneStart || fallback.startDate, '学期开始日期');
    const weekOneStart = date(source.weekOneStart || startDate, '第 1 周开始日期');
    const endDate = date(source.endDate || fallback.endDate, '学期结束日期');
    if (endDate < startDate || P.Schedule.daysBetween(startDate, endDate) > 370) throw new Error('学期日期范围不正确。');
    const breaks = Array.isArray(source.breaks) ? source.breaks.map((item, index) => {
      const start = date(item.startDate, `第 ${index + 1} 个假期开始日期`);
      const end = date(item.endDate, `第 ${index + 1} 个假期结束日期`);
      if (end < start) throw new Error('假期结束日期不能早于开始日期。');
      return { name: text(item.name || '停课', '假期名称', 100, true), startDate: start, endDate: end, countsAsTeachingWeek: false };
    }) : [];
    return {
      id: text(source.id || `semester-${startDate}`, '学期 ID', 200, true),
      name: text(source.name || fallback.name, '学期名称', 200, true), startDate, weekOneStart, endDate,
      timeZone: 'Asia/Shanghai', breaks
    };
  }

  function cleanPlanFields(input, label) {
    const startTime = time(input.startTime, `${label}开始时间`);
    const endTime = time(input.endTime, `${label}结束时间`);
    if (endTime <= startTime) throw new Error(`${label}的结束时间必须晚于开始时间。`);
    const kind = text(input.kind || '自主学习', `${label}类型`, 30, true);
    if (!P.Schedule.KINDS.includes(kind)) throw new Error(`${label}类型不受支持。`);
    return {
      title: text(input.title, `${label}名称`, 300, true).trim(), kind, startTime, endTime,
      location: text(input.location || '', `${label}地点`, 1000), note: text(input.note ?? input.notes ?? '', `${label}备注`, 15000)
    };
  }

  function cleanRule(input, index, seen) {
    const label = `第 ${index + 1} 项计划`;
    const id = text(input.id || input.seriesId, `${label} ID`, 300, true);
    if (seen.has(id)) throw new Error(`计划 ID 重复：${id}`);
    seen.add(id);
    const rule = { id, ...cleanPlanFields(input, label), source: input.source === 'user' ? 'user' : 'imported' };
    if (Array.isArray(input.dates)) {
      if (!input.dates.length || input.dates.length > 550) throw new Error(`${label}日期列表为空或过长。`);
      rule.dates = [...new Set(input.dates.map((value) => date(value, `${label}日期`)))].sort();
    } else {
      const weekday = Number(input.weekday);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error(`${label}星期必须是 1 至 7。`);
      if (!Array.isArray(input.weeks) || !input.weeks.length || input.weeks.length > 80) throw new Error(`${label}周次列表不正确。`);
      rule.weekday = weekday;
      rule.weeks = [...new Set(input.weeks.map(Number))].sort((a, b) => a - b);
      if (rule.weeks.some((week) => !Number.isInteger(week) || week < 1 || week > 80)) throw new Error(`${label}周次不正确。`);
    }
    if (input.originalSeries) rule.originalSeries = text(input.originalSeries, `${label}原系列`, 500);
    return rule;
  }

  function cleanPatch(input, label) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label}修改内容不正确。`);
    const patch = {};
    const hasStartTime = Object.prototype.hasOwnProperty.call(input, 'startTime');
    const hasEndTime = Object.prototype.hasOwnProperty.call(input, 'endTime');
    if (hasStartTime !== hasEndTime) throw new Error(`${label}修改时间时必须同时提供开始和结束时间。`);
    if ('title' in input) patch.title = text(input.title, `${label}名称`, 300, true).trim();
    if ('kind' in input) {
      patch.kind = text(input.kind, `${label}类型`, 30, true);
      if (!P.Schedule.KINDS.includes(patch.kind)) throw new Error(`${label}类型不受支持。`);
    }
    if (hasStartTime) patch.startTime = time(input.startTime, `${label}开始时间`);
    if (hasEndTime) patch.endTime = time(input.endTime, `${label}结束时间`);
    if (patch.startTime && patch.endTime && patch.endTime <= patch.startTime) throw new Error(`${label}时间范围不正确。`);
    if ('location' in input) patch.location = text(input.location, `${label}地点`, 1000);
    if ('note' in input || 'notes' in input) patch.note = text(input.note ?? input.notes, `${label}备注`, 15000);
    return patch;
  }

  function normalizeV2(raw) {
    const state = emptyState();
    state.exportType = raw.exportType === 'semester-plan' ? 'semester-plan' : 'complete-backup';
    state.semester = cleanSemester(raw.semester);
    if (!Array.isArray(raw.baseSchedule) || raw.baseSchedule.length > MAX_RULES) throw new Error('原始学期计划数量不正确。');
    const seenRules = new Set();
    state.baseSchedule = raw.baseSchedule.map((item, index) => cleanRule(item, index, seenRules));
    if (!Array.isArray(raw.permanentOverrides || []) || raw.permanentOverrides.length > MAX_OVERRIDES) throw new Error('永久修改数量不正确。');
    const seenChanges = new Set();
    state.permanentOverrides = (raw.permanentOverrides || []).map((item, index) => {
      const id = text(item.id, `第 ${index + 1} 项永久修改 ID`, 300, true);
      if (seenChanges.has(id)) throw new Error(`修改 ID 重复：${id}`);
      seenChanges.add(id);
      const seriesId = text(item.seriesId, '永久修改系列 ID', 300, true);
      if (!seenRules.has(seriesId)) throw new Error(`永久修改引用了不存在的系列：${seriesId}`);
      const action = item.action === 'delete' ? 'delete' : item.action === 'update' ? 'update' : '';
      if (!action) throw new Error('永久修改操作不正确。');
      return { id, seriesId, effectiveFrom: date(item.effectiveFrom, '永久修改生效日期'), action, patch: action === 'update' ? cleanPatch(item.patch, '永久修改') : {}, createdAt: text(item.createdAt || new Date().toISOString(), '永久修改时间', 100, true) };
    });
    if (!Array.isArray(raw.dateOverrides || []) || raw.dateOverrides.length > MAX_OVERRIDES) throw new Error('单日修改数量不正确。');
    state.dateOverrides = (raw.dateOverrides || []).map((item, index) => {
      const id = text(item.id, `第 ${index + 1} 项单日修改 ID`, 300, true);
      if (seenChanges.has(id)) throw new Error(`修改 ID 重复：${id}`);
      seenChanges.add(id);
      const action = ['add', 'update', 'delete'].includes(item.action) ? item.action : '';
      if (!action) throw new Error('单日修改操作不正确。');
      const output = { id, date: date(item.date, '单日修改日期'), action, createdAt: text(item.createdAt || new Date().toISOString(), '单日修改时间', 100, true), source: item.source === 'imported' ? 'imported' : 'user' };
      if (action === 'add') output.plan = cleanPlanFields(item.plan || {}, '单日新增计划');
      else output.targetId = text(item.targetId || item.occurrenceId, '单日修改目标 ID', 700, true);
      if (action === 'update') output.patch = cleanPatch(item.patch, '单日修改');
      return output;
    });
    const checkins = raw.checkins || {};
    if (!checkins || typeof checkins !== 'object' || Array.isArray(checkins) || Object.keys(checkins).length > MAX_CHECKINS) throw new Error('打卡记录格式不正确。');
    state.checkins = {};
    for (const [key, value] of Object.entries(checkins)) {
      text(key, '打卡 ID', 700, true);
      if (value !== true && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('打卡记录内容不正确。');
      const record = value === true ? {} : value;
      state.checkins[key] = {
        completedAt: record.completedAt === null ? null : text(record.completedAt || new Date().toISOString(), '打卡时间', 100, true),
        snapshot: {
          date: P.Schedule.validDate(record.snapshot?.date) ? record.snapshot.date : '',
          title: text(record.snapshot?.title || '', '打卡名称快照', 300),
          kind: text(record.snapshot?.kind || '', '打卡类型快照', 30)
        }
      };
    }
    const settings = raw.reminderSettings || {};
    const minutes = Number(settings.minutesBefore ?? 10);
    state.reminderSettings = { enabled: settings.enabled !== false, minutesBefore: Number.isInteger(minutes) && minutes >= 0 && minutes <= 10080 ? minutes : 10 };
    state.preferences = raw.preferences && typeof raw.preferences === 'object' && !Array.isArray(raw.preferences) ? JSON.parse(JSON.stringify(raw.preferences)) : {};
    state.meta = {
      createdAt: text(raw.meta?.createdAt || new Date().toISOString(), '创建时间', 100, true),
      updatedAt: text(raw.meta?.updatedAt || new Date().toISOString(), '更新时间', 100, true),
      source: text(raw.meta?.source || 'imported-v2', '数据来源', 100, true)
    };
    return state;
  }

  function fnv(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }

  function legacyToV2(raw) {
    if (!Array.isArray(raw.events) || raw.events.length > 20000) throw new Error('旧版计划数量不正确。');
    const state = emptyState();
    const first = raw.events.map((item) => item.day).filter(P.Schedule.validDate).sort()[0];
    const orderedDays = raw.events.map((item) => item.day).filter(P.Schedule.validDate).sort();
    const last = orderedDays[orderedDays.length - 1];
    state.semester = cleanSemester({
      name: raw.semester?.name || '导入的学期计划', startDate: raw.termStart || first || state.semester.startDate,
      weekOneStart: raw.termStart || first || state.semester.weekOneStart, endDate: raw.termEnd || last || state.semester.endDate,
      breaks: raw.semester?.breaks || (raw.termStart === '2026-09-07' ? defaultSemester().breaks : [])
    });
    const groups = new Map();
    for (let index = 0; index < raw.events.length; index += 1) {
      const item = raw.events[index];
      const day = date(item.day, `旧版第 ${index + 1} 项日期`);
      const startTime = time(item.startTime || String(item.start || '').slice(11, 16), `旧版第 ${index + 1} 项开始时间`);
      const endTime = time(item.endTime || String(item.end || '').slice(11, 16), `旧版第 ${index + 1} 项结束时间`);
      const fields = cleanPlanFields({ ...item, startTime, endTime, note: item.note ?? item.notes }, `旧版第 ${index + 1} 项`);
      const series = text(item.series || item.seriesId || item.id, '旧版系列 ID', 500, true);
      if (!groups.has(series)) groups.set(series, []);
      groups.get(series).push({ ...fields, day, oldId: text(item.id || `${series}-${day}`, '旧版计划 ID', 700, true) });
    }
    const usedIds = new Set();
    const legacyMap = new Map();
    for (const [series, events] of groups) {
      let id = `base-${fnv(series)}`;
      let suffix = 2;
      while (usedIds.has(id)) id = `base-${fnv(series)}-${suffix++}`;
      usedIds.add(id);
      const signatures = new Map();
      for (const event of events) {
        const signature = JSON.stringify([event.title, event.kind, event.startTime, event.endTime, event.location, event.note]);
        signatures.set(signature, (signatures.get(signature) || 0) + 1);
      }
      const dominant = [...signatures.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      const [title, kind, startTime, endTime, location, note] = JSON.parse(dominant);
      const rule = { id, title, kind, startTime, endTime, location, note, dates: [...new Set(events.map((event) => event.day))].sort(), source: 'imported', originalSeries: series };
      state.baseSchedule.push(rule);
      for (const event of events) {
        const key = P.Schedule.occurrenceKey(id, event.day);
        legacyMap.set(event.oldId, { key, event });
        const patch = {};
        for (const field of ['title', 'kind', 'startTime', 'endTime', 'location', 'note']) if (event[field] !== rule[field]) patch[field] = event[field];
        if (Object.keys(patch).length) state.dateOverrides.push({ id: `import-${fnv(`${event.oldId}|${event.day}`)}`, date: event.day, action: 'update', targetId: key, patch, source: 'imported', createdAt: '2026-09-13T00:00:00.000Z' });
      }
    }
    for (const [oldId, value] of Object.entries(raw.done || {})) {
      if (value !== true || !legacyMap.has(oldId)) continue;
      const mapped = legacyMap.get(oldId);
      state.checkins[mapped.key] = { completedAt: null, snapshot: { date: mapped.event.day, title: mapped.event.title, kind: mapped.event.kind } };
    }
    state.reminderSettings.enabled = raw.alarms !== false;
    state.meta.source = 'migrated-v1';
    return normalizeV2(state);
  }

  function plansToV2(raw) {
    const state = emptyState();
    state.semester = cleanSemester(raw.semester);
    const plans = raw.plans;
    if (!Array.isArray(plans) || plans.length > MAX_RULES) throw new Error('学期计划列表不正确。');
    state.baseSchedule = plans.map((item, index) => ({
      id: item.id || item.seriesId || `plan-${index + 1}`, title: item.title, kind: item.kind || '课程',
      weekday: item.weekday, weeks: item.weeks, dates: item.dates, startTime: item.startTime,
      endTime: item.endTime, location: item.location || '', note: item.note || '', source: item.source || 'imported'
    }));
    state.exportType = 'semester-plan';
    state.meta.source = 'readable-plans-import';
    return normalizeV2(state);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('请选择有效的 Plantation JSON 文件。');
    if (Number(raw.schemaVersion) === 2 && Array.isArray(raw.baseSchedule)) return normalizeV2(raw);
    if (Array.isArray(raw.events)) return legacyToV2(raw);
    if (Array.isArray(raw.plans)) return plansToV2(raw);
    throw new Error('无法识别此 JSON 的 Plantation 数据结构。');
  }

  function downloadJson(state, filename = `Plantation-完整备份-${P.Schedule.today()}.json`) {
    const output = JSON.parse(JSON.stringify(state));
    output.schemaVersion = 2;
    output.app = 'Plantation';
    output.exportType = 'complete-backup';
    output.meta.updatedAt = new Date().toISOString();
    P.Calendar.downloadBlob(JSON.stringify(output, null, 2), filename, 'application/json;charset=utf-8');
  }

  async function readJsonFile(file) {
    if (!file || file.size > MAX_FILE_SIZE) throw new Error('请选择 20 MB 以内的 JSON 文件。');
    let parsed;
    try { parsed = JSON.parse(await file.text()); } catch (error) { throw new Error('JSON 无法解析，请检查文件是否完整。'); }
    return normalize(parsed);
  }

  P.Backup = { emptyState, normalize, legacyToV2, downloadJson, readJsonFile, maxFileSize: MAX_FILE_SIZE };
})(window.Plantation = window.Plantation || {});
