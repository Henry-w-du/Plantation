(function (P) {
  'use strict';
  const DAY_MS = 86400000;
  const KINDS = ['课程', '六级', '计算机', '课程复习', '自主学习', '休息'];
  const EDITABLE = ['title', 'kind', 'startTime', 'endTime', 'location', 'note'];

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validTime(value) {
    return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function addDays(day, amount) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(amount));
    return date.toISOString().slice(0, 10);
  }

  function daysBetween(first, second) {
    return Math.round((Date.parse(`${second}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY_MS);
  }

  function isoWeekday(day) {
    const value = new Date(`${day}T00:00:00Z`).getUTCDay();
    return value === 0 ? 7 : value;
  }

  function today() {
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function inBreak(day, semester) {
    return (semester.breaks || []).find((entry) => day >= entry.startDate && day <= entry.endDate) || null;
  }

  function teachingWeek(day, semester) {
    const first = semester.weekOneStart || semester.startDate;
    if (!validDate(day) || day < first || day > semester.endDate) return null;
    if (inBreak(day, semester)) return 0;
    let countedDays = 0;
    for (let cursor = first; cursor <= day; cursor = addDays(cursor, 1)) {
      if (!inBreak(cursor, semester)) countedDays += 1;
    }
    return Math.floor((countedDays - 1) / 7) + 1;
  }

  function weekLabel(day, semester) {
    const week = teachingWeek(day, semester);
    if (week === null) return '学期外';
    if (week === 0) {
      const pause = inBreak(day, semester);
      return pause ? `${pause.name || '停课'} · 不计教学周` : '不计教学周';
    }
    return `第 ${week} 周 · ${week % 2 ? '单' : '双'}周`;
  }

  function occurrenceKey(seriesId, date) {
    return `${seriesId}@${date}`;
  }

  function ruleMatchesDate(rule, date, semester) {
    if (Array.isArray(rule.dates)) return rule.dates.includes(date);
    const week = teachingWeek(date, semester);
    return week > 0 && Number(rule.weekday) === isoWeekday(date) && Array.isArray(rule.weeks) && rule.weeks.includes(week);
  }

  function applyPatch(target, patch) {
    const next = { ...target };
    for (const field of EDITABLE) if (Object.prototype.hasOwnProperty.call(patch || {}, field)) next[field] = patch[field];
    return next;
  }

  function baseOccurrence(rule, date) {
    return {
      id: occurrenceKey(rule.id, date), seriesId: rule.id, date,
      title: rule.title, kind: rule.kind, startTime: rule.startTime, endTime: rule.endTime,
      location: rule.location || '', note: rule.note || '', source: rule.source || 'imported', origin: 'base'
    };
  }

  function materializeDay(state, date) {
    const permanent = [...state.permanentOverrides].sort((a, b) => `${a.effectiveFrom}|${a.createdAt}|${a.id}`.localeCompare(`${b.effectiveFrom}|${b.createdAt}|${b.id}`));
    const dateChanges = state.dateOverrides.filter((item) => item.date === date);
    const items = [];
    for (const rule of state.baseSchedule) {
      if (!ruleMatchesDate(rule, date, state.semester)) continue;
      let item = baseOccurrence(rule, date);
      let deleted = false;
      for (const override of permanent) {
        if (override.seriesId !== rule.id || date < override.effectiveFrom) continue;
        if (override.action === 'delete') deleted = true;
        if (override.action === 'update' && !deleted) item = applyPatch(item, override.patch);
      }
      if (deleted) continue;
      for (const override of dateChanges) {
        if (override.targetId !== item.id) continue;
        if (override.action === 'delete') deleted = true;
        if (override.action === 'update' && !deleted) item = applyPatch(item, override.patch);
      }
      if (!deleted) items.push(item);
    }
    for (const override of dateChanges) {
      if (override.action !== 'add' || !override.plan) continue;
      items.push({
        id: `date:${override.id}`, seriesId: `date:${override.id}`, overrideId: override.id, date,
        title: override.plan.title, kind: override.plan.kind, startTime: override.plan.startTime,
        endTime: override.plan.endTime, location: override.plan.location || '', note: override.plan.note || '',
        source: 'user', origin: 'date-add'
      });
    }
    return items.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime) || a.title.localeCompare(b.title));
  }

  function materializeRange(state, startDate, endDate, limit = 20000) {
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate || daysBetween(startDate, endDate) > 370) throw new Error('日期范围无效或超过一年。');
    const output = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      output.push(...materializeDay(state, date));
      if (output.length > limit) throw new Error('计划数量过多，请缩小导出范围。');
    }
    return output;
  }

  function recurringWeeks(startDate, endDate, pattern, semester) {
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate || daysBetween(startDate, endDate) > 370) throw new Error('重复截止日期必须在开始日期后一年内。');
    const weekday = isoWeekday(startDate);
    const weeks = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 7)) {
      const week = teachingWeek(date, semester);
      if (!week) continue;
      if (pattern === 'odd' && week % 2 === 0) continue;
      if (pattern === 'even' && week % 2 === 1) continue;
      if (!weeks.includes(week)) weeks.push(week);
    }
    return { weekday, weeks };
  }

  function conflictsForDay(items, ignoredId = '') {
    const relevant = items.filter((item) => item.id !== ignoredId).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const pairs = [];
    for (let i = 0; i < relevant.length; i += 1) {
      for (let j = i + 1; j < relevant.length && relevant[j].startTime < relevant[i].endTime; j += 1) {
        if (relevant[i].startTime < relevant[j].endTime) pairs.push([relevant[i], relevant[j]]);
      }
    }
    return pairs;
  }

  function dateLabel(day) {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${day}T12:00:00Z`));
  }

  function allKinds(state) {
    const output = [];
    const seen = new Set();
    const add = (value) => {
      const kind = typeof value === 'string' ? value.trim() : '';
      if (!kind || kind.length > 30 || seen.has(kind)) return;
      seen.add(kind);
      output.push(kind);
    };
    KINDS.forEach(add);
    (state?.preferences?.customKinds || []).forEach(add);
    (state?.baseSchedule || []).forEach((item) => add(item.kind));
    (state?.permanentOverrides || []).forEach((item) => add(item.patch?.kind));
    (state?.dateOverrides || []).forEach((item) => {
      add(item.plan?.kind);
      add(item.patch?.kind);
    });
    Object.values(state?.checkins || {}).forEach((item) => add(item?.snapshot?.kind));
    return output;
  }

  function makeId(prefix = 'id') {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return `${prefix}-${window.crypto.randomUUID()}`;
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return `${prefix}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  P.Schedule = {
    KINDS, validDate, validTime, addDays, daysBetween, isoWeekday, today, teachingWeek, weekLabel,
    occurrenceKey, materializeDay, materializeRange, recurringWeeks, conflictsForDay, dateLabel, allKinds, makeId
  };
})(window.Plantation = window.Plantation || {});
