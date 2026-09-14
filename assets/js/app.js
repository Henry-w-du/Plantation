(function (P) {
  'use strict';
  let state = P.Backup.emptyState();
  let selectedDate = P.Schedule.today();
  let tab = 'day';
  let storageMode = 'indexedDB';
  let warning = '';

  const clone = (value) => JSON.parse(JSON.stringify(value));

  function render() {
    P.UI.mount({ state, selectedDate, tab, storageMode, warning, actions });
  }

  async function commit(next, message) {
    try {
      state = await P.Storage.save(next);
      storageMode = P.Storage.mode();
      warning = '';
      render();
      if (message) P.UI.toast(message);
      return true;
    } catch (error) {
      P.UI.toast(error.message || '保存失败，当前操作未生效。');
      return false;
    }
  }

  function findOccurrence(id) {
    const selected = P.Schedule.materializeDay(state, selectedDate).find((item) => item.id === id);
    if (selected) return selected;
    const rangeStart = state.semester.startDate;
    const rangeEnd = state.semester.endDate;
    return P.Schedule.materializeRange(state, rangeStart, rangeEnd).find((item) => item.id === id) || null;
  }

  function countConflicts(candidate, startDate, endDate) {
    let count = 0;
    for (let date = startDate; date <= endDate; date = P.Schedule.addDays(date, 1)) {
      count += P.Schedule.conflictsForDay(P.Schedule.materializeDay(candidate, date)).length;
    }
    return count;
  }

  function cleanEditorValues(values) {
    const output = {
      title: String(values.title || '').trim(), kind: String(values.kind || '').trim(),
      date: String(values.date || ''), startTime: String(values.startTime || ''), endTime: String(values.endTime || ''),
      location: String(values.location || '').trim(), note: String(values.note || ''), scope: values.scope === 'future' ? 'future' : 'once',
      pattern: ['odd', 'even'].includes(values.pattern) ? values.pattern : 'all', until: String(values.until || '')
    };
    if (!output.title) throw new Error('请填写项目名称。');
    if (!output.kind) throw new Error('请填写类型，例如“社团”或“值班”。');
    if (!P.Schedule.validDate(output.date)) throw new Error('请选择有效日期。');
    if (!P.Schedule.validTime(output.startTime) || !P.Schedule.validTime(output.endTime) || output.endTime <= output.startTime) throw new Error('结束时间需要晚于开始时间；跨午夜请拆成两项。');
    if (output.title.length > 300 || output.kind.length > 30 || output.location.length > 1000 || output.note.length > 15000) throw new Error('名称、类型、地点或备注过长。');
    return output;
  }

  function putTemporaryUpdate(next, item, patch) {
    next.dateOverrides = next.dateOverrides.filter((change) => !(change.source === 'user' && change.date === item.date && change.targetId === item.id && change.action === 'update'));
    next.dateOverrides.push({ id: P.Schedule.makeId('day-update'), date: item.date, action: 'update', targetId: item.id, patch, source: 'user', createdAt: new Date().toISOString() });
  }

  async function savePlan(rawValues, item) {
    let values;
    try { values = cleanEditorValues(rawValues); } catch (error) { return { ok: false, message: error.message }; }
    if (item?.origin === 'date-add') values.scope = 'once';
    const next = clone(state);
    const fields = { title: values.title, kind: values.kind, startTime: values.startTime, endTime: values.endTime, location: values.location, note: values.note };
    next.preferences = next.preferences || {};
    next.preferences.customKinds = Array.isArray(next.preferences.customKinds) ? next.preferences.customKinds : [];
    if (!P.Schedule.KINDS.includes(values.kind) && !next.preferences.customKinds.includes(values.kind)) next.preferences.customKinds.push(values.kind);
    let startForCheck = values.date;
    let endForCheck = values.date;

    try {
      if (!item && values.scope === 'once') {
        next.dateOverrides.push({ id: P.Schedule.makeId('day-add'), date: values.date, action: 'add', plan: fields, source: 'user', createdAt: new Date().toISOString() });
      } else if (!item) {
        if (!P.Schedule.validDate(values.until) || values.until < values.date || P.Schedule.daysBetween(values.date, values.until) > 370) throw new Error('重复截止日期需要在开始日期之后一年内。');
        const dates = [];
        for (let date = values.date; date <= values.until; date = P.Schedule.addDays(date, 7)) {
          const week = P.Schedule.teachingWeek(date, next.semester);
          if (values.pattern === 'odd' && (!week || week % 2 === 0)) continue;
          if (values.pattern === 'even' && (!week || week % 2 === 1)) continue;
          dates.push(date);
        }
        if (!dates.length) throw new Error('这个范围没有符合单双周条件的日期。');
        next.baseSchedule.push({ id: P.Schedule.makeId('user-series'), ...fields, dates, source: 'user' });
        endForCheck = values.until;
      } else if (item.origin === 'date-add') {
        const target = next.dateOverrides.find((change) => change.id === item.overrideId && change.action === 'add');
        if (!target) throw new Error('临时计划已不存在。');
        target.plan = fields;
      } else if (values.scope === 'once') {
        putTemporaryUpdate(next, item, fields);
      } else {
        next.permanentOverrides.push({ id: P.Schedule.makeId('series-update'), seriesId: item.seriesId, effectiveFrom: next.semester.startDate, action: 'update', patch: fields, createdAt: new Date().toISOString() });
        startForCheck = next.semester.startDate;
        endForCheck = next.semester.endDate;
      }

      const validated = P.Backup.normalize(next);
      const beforeCount = countConflicts(state, startForCheck, endForCheck);
      const afterCount = countConflicts(validated, startForCheck, endForCheck);
      if (afterCount > beforeCount && !window.confirm(`这次修改会新增 ${afterCount - beforeCount} 处时间重叠。仍然保存吗？`)) return { ok: false, message: '已取消，原计划未改变。' };
      const newestSeries = validated.baseSchedule[validated.baseSchedule.length - 1];
      const amount = !item && values.scope === 'future' ? newestSeries.dates.length : 1;
      const ok = await commit(validated, `已保存${amount > 1 ? ` ${amount} 次` : ''}计划。已导入的系统日历不会自动改变。`);
      return ok ? { ok: true } : { ok: false, message: '保存失败，原计划未改变。' };
    } catch (error) {
      return { ok: false, message: error.message || '计划格式不正确。' };
    }
  }

  async function deletePlan(item, scope) {
    if (!item) return false;
    const permanent = scope === 'future' && item.origin !== 'date-add';
    const wording = permanent ? '整个重复系列' : '仅这一次';
    if (!window.confirm(`确定删除${wording}的计划吗？历史打卡会保留，系统日历不会自动删除。`)) return false;
    const next = clone(state);
    if (item.origin === 'date-add') {
      next.dateOverrides = next.dateOverrides.filter((change) => change.id !== item.overrideId);
    } else if (permanent) {
      next.permanentOverrides.push({ id: P.Schedule.makeId('series-delete'), seriesId: item.seriesId, effectiveFrom: next.semester.startDate, action: 'delete', patch: {}, createdAt: new Date().toISOString() });
    } else {
      next.dateOverrides = next.dateOverrides.filter((change) => !(change.source === 'user' && change.date === item.date && change.targetId === item.id));
      next.dateOverrides.push({ id: P.Schedule.makeId('day-delete'), date: item.date, action: 'delete', targetId: item.id, source: 'user', createdAt: new Date().toISOString() });
    }
    return commit(next, '计划已删除；历史打卡仍保留。');
  }

  async function toggleCheckin(id) {
    const item = findOccurrence(id);
    if (!item || item.kind === '休息') return P.UI.toast('这项计划不存在或不需要打卡。');
    if (item.date > P.Schedule.today()) return P.UI.toast('这项计划还没到当天，先留给未来的自己。');
    const next = clone(state);
    if (next.checkins[id]) delete next.checkins[id];
    else next.checkins[id] = { completedAt: new Date().toISOString(), snapshot: { date: item.date, title: item.title, kind: item.kind } };
    await commit(next, next.checkins[id] ? '完成一项，为自己记一笔。' : '已取消打卡。');
  }

  async function setAlarms(enabled) {
    const next = clone(state);
    next.reminderSettings.enabled = Boolean(enabled);
    await commit(next, enabled ? '下一次导出的日历将携带提醒。' : '下一次导出不带提醒；已经导入的日历不变。');
  }

  async function importFile(file, mode) {
    try {
      const incoming = await P.Backup.readJsonFile(file);
      if (mode === 'restore' && incoming.exportType !== 'complete-backup') {
        throw new Error('这是一份学期计划，不是完整备份。请改用“导入学期计划”。');
      }
      const hasCurrent = state.baseSchedule.length || state.dateOverrides.length || Object.keys(state.checkins).length;
      const message = mode === 'restore'
        ? '完整恢复会替换当前计划、所有修改、打卡和提醒设置。建议先导出备份。继续吗？'
        : '导入学期计划会替换当前计划结构，但保留现有历史打卡和提醒设置。继续吗？';
      if (hasCurrent && !window.confirm(message)) return;
      let next;
      if (mode === 'restore') next = incoming;
      else {
        next = clone(state);
        next.semester = incoming.semester;
        next.baseSchedule = incoming.baseSchedule;
        next.permanentOverrides = incoming.permanentOverrides;
        next.dateOverrides = incoming.dateOverrides;
        next.meta.source = 'schedule-import';
      }
      if (await commit(next, `已导入 ${incoming.baseSchedule.length} 个计划系列，数据只保存在本机。`)) {
        selectedDate = incoming.semester.startDate <= P.Schedule.today() && P.Schedule.today() <= incoming.semester.endDate ? P.Schedule.today() : incoming.semester.startDate;
        tab = 'day';
        render();
      }
    } catch (error) {
      P.UI.toast(`${mode === 'restore' ? '恢复' : '导入'}失败：${error.message}`);
    }
  }

  async function loadSample() {
    try {
      const response = await fetch('./sample/Plantation-朋友学期计划.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`示例文件读取失败（${response.status}）`);
      const incoming = P.Backup.normalize(await response.json());
      const hasCurrent = state.baseSchedule.length || state.dateOverrides.length || Object.keys(state.checkins).length;
      if (hasCurrent && !window.confirm('载入匿名示例会替换当前计划结构，但保留已有历史打卡与提醒设置。继续吗？')) return;
      const next = clone(state);
      next.semester = incoming.semester;
      next.baseSchedule = incoming.baseSchedule;
      next.permanentOverrides = incoming.permanentOverrides;
      next.dateOverrides = incoming.dateOverrides;
      next.meta.source = 'bundled-sample';
      if (await commit(next, `匿名示例已载入：${incoming.baseSchedule.length} 个计划系列。`)) {
        selectedDate = incoming.semester.startDate <= P.Schedule.today() && P.Schedule.today() <= incoming.semester.endDate ? P.Schedule.today() : incoming.semester.startDate;
        tab = 'day'; render();
      }
    } catch (error) {
      P.UI.toast(`无法载入示例：${error.message}。本地直接打开时请使用“导入学期计划”。`);
    }
  }

  function backup() {
    try { P.Backup.downloadJson(state); P.UI.toast('完整备份已生成，请保存到“文件”或自己的云盘。'); }
    catch (error) { P.UI.toast(`备份失败：${error.message}`); }
  }

  function exportCalendar(range, kinds) {
    try {
      const end = range === 'term' ? state.semester.endDate : P.Schedule.addDays(selectedDate, Number(range) - 1);
      const boundedEnd = end > state.semester.endDate ? state.semester.endDate : end;
      const items = boundedEnd >= selectedDate ? P.Schedule.materializeRange(state, selectedDate, boundedEnd).filter((item) => kinds.includes(item.kind)) : [];
      const label = state.reminderSettings.enabled ? '含提醒' : '无提醒';
      const count = P.Calendar.exportICS(items, state.reminderSettings, `Plantation-${selectedDate}-${label}.ics`);
      P.UI.toast(`已生成 ${count} 项日历事件。导出不会自动修改以前导入的日历。`);
    } catch (error) { P.UI.toast(error.message || '日历导出失败。'); }
  }

  function openDate(date) {
    if (!P.Schedule.validDate(date)) return;
    selectedDate = date; tab = 'day'; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const actions = {
    setTab(nextTab) { tab = nextTab; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    openDate,
    moveWeek(amount) { selectedDate = P.Schedule.addDays(selectedDate, amount); render(); },
    toggleCheckin, setAlarms, importFile, loadSample, backup, exportCalendar, savePlan, deletePlan
  };

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    });
    navigator.serviceWorker.register('./service-worker.js', { scope: './', updateViaCache: 'none' }).then((registration) => {
      const offer = (worker) => P.UI.showUpdate(() => worker.postMessage({ type: 'SKIP_WAITING' }));
      if (registration.waiting) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
    }).catch(() => { warning = '离线缓存未能启用；计划仍保存在本机，请定期导出备份。'; render(); });
  }

  function registerWebMCP() {
    const modelContext = document.modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
    try {
      Promise.resolve(modelContext.registerTool({
        name: 'list_day_plans', title: '查看一天的计划',
        description: '读取这台设备上指定日期的 Plantation 计划，不改变状态。',
        inputSchema: { type: 'object', properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['date'], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || !P.Schedule.validDate(input.date)) throw new Error('需要 YYYY-MM-DD 日期。');
          return P.Schedule.materializeDay(state, input.date).map((item) => ({ id: item.id, title: item.title, startTime: item.startTime, endTime: item.endTime, location: item.location, note: item.note, done: Boolean(state.checkins[item.id]) }));
        }
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch (error) { /* Optional browser capability. */ }
  }

  async function init() {
    const loaded = await P.Storage.load();
    state = loaded.state;
    storageMode = loaded.storageMode;
    warning = loaded.warning || (loaded.migrated ? '已将旧版 Plantation 数据升级到 v2；旧数据仍保留，可随时导出完整备份。' : '');
    const today = P.Schedule.today();
    selectedDate = today >= state.semester.startDate && today <= state.semester.endDate ? today : state.semester.startDate;
    render();
    setupServiceWorker();
    registerWebMCP();
    window.setInterval(() => {
      const layer = document.querySelector('#modal-layer');
      if (tab === 'day' && (!layer || layer.hidden)) render();
    }, 60000);
  }

  P.App = { init, actions, getState: () => state };
  init().catch((error) => {
    warning = `Plantation 启动失败：${error.message}`;
    render();
  });
})(window.Plantation = window.Plantation || {});
