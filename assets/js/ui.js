(function (P) {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let context = null;
  let toastTimer = null;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function statsFor(date) {
    const items = P.Schedule.materializeDay(context.state, date).filter((item) => item.kind !== '休息');
    const done = items.filter((item) => context.state.checkins[item.id]).length;
    return { total: items.length, done, percent: items.length ? Math.round(done / items.length * 100) : 0 };
  }

  function header(subtitle) {
    return `<header class="topbar"><div><h1>Plantation<span class="brand-dot"></span></h1><p>${escapeHTML(subtitle)}</p></div><button class="soft-button" type="button" data-action="today">今天</button></header>`;
  }

  function progressCard(date) {
    const stats = statsFor(date);
    const complete = stats.total > 0 && stats.done === stats.total;
    return `<section class="progress-card">
      <div class="progress-ring" style="--progress:${stats.percent}%"><div><strong>${stats.percent}<span>%</span></strong><small>今日完成</small></div></div>
      <div><span class="eyebrow">${complete ? '今天，做得很好' : '一点一点，向前走'}</span>
        <h2>${stats.done} <span class="muted">/ ${stats.total} 项</span></h2>
        <p>${stats.total === 0 ? '今天没有待打卡计划。' : stats.done === 0 ? '从一项小事开始。' : complete ? '留点时间，好好休息。' : '每一次行动，都算数。'}</p>
      </div></section>`;
  }

  function isAttention(item) {
    if (!context.state.reminderSettings.enabled || context.state.checkins[item.id] || item.kind === '休息') return false;
    const now = Date.now();
    const start = Date.parse(`${item.date}T${item.startTime}:00+08:00`);
    const end = Date.parse(`${item.date}T${item.endTime}:00+08:00`);
    return start - now <= context.state.reminderSettings.minutesBefore * 60000 && end > now;
  }

  function eventCard(item) {
    const done = Boolean(context.state.checkins[item.id]);
    const attention = isAttention(item);
    return `<article class="event-card ${done ? 'completed' : ''} ${attention ? 'attention' : ''}">
      <div class="event-time"><strong>${item.startTime}</strong><span>${item.endTime}</span></div>
      <button class="event-info" type="button" data-action="details" data-id="${escapeHTML(item.id)}">
        <span class="event-kind">${escapeHTML(item.kind)}${attention ? ' · 即将 / 正在进行' : ''}</span>
        <h3>${escapeHTML(item.title)}</h3>${item.location ? `<p>${escapeHTML(item.location)}</p>` : ''}
      </button>
      ${item.kind === '休息' ? '<span class="rest-mark" aria-label="休息">—</span>' : `<button class="check-button ${done ? 'checked' : ''}" type="button" data-action="check" data-id="${escapeHTML(item.id)}" aria-label="${done ? '取消完成' : '完成'}：${escapeHTML(item.title)}" aria-pressed="${done}">${done ? '✓' : '+'}</button>`}
    </article>`;
  }

  function emptyWelcome() {
    return `<section class="welcome-card"><span class="eyebrow">准备好新的一天</span><h2>把你的计划带进来</h2>
      <p>导入学期计划或完整备份。计划、备注与打卡只保存在这台设备。</p>
      <div class="stack-actions"><label class="primary-button file-button">导入学期计划<input type="file" accept=".json,application/json" data-file="schedule" hidden></label><button class="soft-button" type="button" data-action="sample">载入匿名示例计划</button><button class="text-button" type="button" data-action="add">自己添加计划</button></div>
      <small class="fine-print">首次使用建议从“提醒”页导出一次完整备份。</small></section>`;
  }

  function dayView() {
    const date = context.selectedDate;
    const items = P.Schedule.materializeDay(context.state, date);
    const hasSchedule = context.state.baseSchedule.length || context.state.dateOverrides.length;
    return `${header('白与蓝，留出清醒的空间。')}
      <section class="datebar"><button type="button" data-action="move-day" data-value="-1" aria-label="前一天">‹</button>
        <label class="date-label"><strong>${escapeHTML(P.Schedule.dateLabel(date))}</strong><span>${escapeHTML(P.Schedule.weekLabel(date, context.state.semester))}</span><input type="date" value="${date}" data-action="pick-date" aria-label="选择日期"></label>
        <button type="button" data-action="move-day" data-value="1" aria-label="后一天">›</button></section>
      ${progressCard(date)}
      ${!hasSchedule ? emptyWelcome() : `<div class="section-heading"><div><span class="eyebrow">今天的节奏</span><h2>${items.length ? `${items.length} 个安排` : '今天留白'}</h2></div><button class="soft-button" type="button" data-action="add">＋ 添加</button></div>
        <section class="event-list">${items.map(eventCard).join('') || '<div class="empty-state">没有安排。休息一下，或添加一项临时计划。</div>'}</section>
        <p class="fine-print centered">点击项目查看老师、教室、准备事项和备注。休息不计入完成率。</p>`}`;
  }

  function weekView() {
    const monday = P.Schedule.addDays(context.selectedDate, 1 - P.Schedule.isoWeekday(context.selectedDate));
    const days = Array.from({ length: 7 }, (_, index) => P.Schedule.addDays(monday, index));
    return `${header('一周有节奏，也有留白。')}<div class="section-heading"><div><span class="eyebrow">${escapeHTML(P.Schedule.weekLabel(context.selectedDate, context.state.semester))}</span><h2>这一周，有条不紊</h2></div><button class="soft-button" type="button" data-action="add">＋ 添加</button></div>
      <div class="week-controls"><button type="button" data-action="move-week" data-value="-7">‹ 上周</button><span>${monday.slice(5).replace('-', '/')} — ${days[6].slice(5).replace('-', '/')}</span><button type="button" data-action="move-week" data-value="7">下周 ›</button></div>
      <div class="week-grid">${days.map((date) => {
        const items = P.Schedule.materializeDay(context.state, date);
        const stats = statsFor(date);
        return `<section class="week-day ${date === P.Schedule.today() ? 'is-today' : ''}"><button class="week-title" type="button" data-action="open-day" data-date="${date}"><strong>${escapeHTML(P.Schedule.dateLabel(date))}</strong><span>${stats.done}/${stats.total}</span></button>
          ${items.map((item) => `<button class="week-event ${context.state.checkins[item.id] ? 'completed' : ''}" type="button" data-action="details" data-id="${escapeHTML(item.id)}"><time>${item.startTime}–${item.endTime}</time><span>${escapeHTML(item.title)}</span><small>${escapeHTML(item.kind)}</small></button>`).join('') || '<p class="week-empty">自由安排</p>'}</section>`;
      }).join('')}</div>`;
  }

  function checkinDates() {
    const output = new Map();
    for (const record of Object.values(context.state.checkins)) {
      const date = record?.snapshot?.date;
      if (P.Schedule.validDate(date)) output.set(date, (output.get(date) || 0) + 1);
    }
    return output;
  }

  function currentStreak(byDate) {
    let date = P.Schedule.today();
    let count = 0;
    if (!byDate.has(date)) date = P.Schedule.addDays(date, -1);
    while (byDate.has(date) && count < 550) { count += 1; date = P.Schedule.addDays(date, -1); }
    return count;
  }

  function checkView() {
    const byDate = checkinDates();
    const total = Object.keys(context.state.checkins).length;
    const streak = currentStreak(byDate);
    const message = total >= 30 ? '积累正在发生' : total >= 7 ? '节奏，慢慢建立起来了' : total ? '第一步，已经迈出' : '从一次完成开始';
    return `${header('深蓝与黑，安静地积累。')}<span class="eyebrow">行动留下的痕迹</span><h2>每一点进步，都看得见</h2>
      <div class="score-grid"><section><strong>${streak}</strong><p>连续行动 / 天</p></section><section><strong>${total}</strong><p>累计完成 / 项</p></section></div>
      <p class="fine-print">当天完成至少一项非休息计划，即记一次行动。过去可以补记，未来不能提前打卡。</p>
      <section class="panel"><h3>最近 28 天</h3><div class="heatmap">${Array.from({ length: 28 }, (_, index) => {
        const date = P.Schedule.addDays(P.Schedule.today(), index - 27);
        const amount = byDate.get(date) || 0;
        return `<button class="heat ${amount ? 'lit' : ''}" type="button" data-action="open-day" data-date="${date}" aria-label="${date}，完成 ${amount} 项"><span>${Number(date.slice(8))}</span>${amount ? `<small>${amount}</small>` : ''}</button>`;
      }).join('')}</div></section>
      <section class="panel"><h3>${message}</h3><p class="muted">${total >= 30 ? '已经完成至少 30 项。持续前进，也记得把休息放在计划里。' : total >= 7 ? '不用每天满分，愿意回来就很好。' : total ? '今天的一小步，也是认真生活的证据。' : '选一项现在能做的事情，完成它。'}</p></section>
      <details class="panel history-panel"><summary>查看保留的历史打卡</summary><div class="history-list">${Object.entries(context.state.checkins).sort((a, b) => String(b[1].completedAt || b[1].snapshot.date).localeCompare(String(a[1].completedAt || a[1].snapshot.date))).slice(0, 100).map(([id, record]) => `<div><span>${escapeHTML(record.snapshot.date || '日期未知')}</span><strong>${escapeHTML(record.snapshot.title || id)}</strong></div>`).join('') || '<p class="muted">还没有历史记录。</p>'}</div></details>`;
  }

  function reminderView() {
    const settings = context.state.reminderSettings;
    const directFile = location.protocol === 'file:';
    const kinds = P.Schedule.allKinds(context.state);
    return `${header('提醒有边界，安排有余地。')}<span class="eyebrow">交给系统日历提醒</span><h2>安排好，也记得去做</h2>
      ${directFile ? '<p class="notice">当前通过本地文件打开：计划功能可用，但安装、Service Worker 和离线缓存需要 HTTPS 或 localhost。</p>' : ''}
      <section class="panel"><label class="toggle-row"><div><h3>导出时携带提醒</h3><p class="muted">每项开始前 ${settings.minutesBefore} 分钟</p></div><input type="checkbox" role="switch" data-action="alarms" ${settings.enabled ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
        <p class="fine-print">Plantation 内的提醒开关仅控制后续导出的日历内容，不会自动修改已经导入到 iPhone 系统日历中的事件，也不等于系统闹钟。</p>
        <label class="field">导出范围<select id="calendar-range"><option value="7">所选日期起 7 天</option><option value="30">所选日期起 30 天</option><option value="term">所选日期起至学期末</option></select></label>
        <fieldset><legend>包含的项目</legend><div class="chips">${kinds.map((kind) => `<label><input name="calendar-kind" type="checkbox" value="${escapeHTML(kind)}" ${kind !== '休息' ? 'checked' : ''}>${escapeHTML(kind)}</label>`).join('')}</div></fieldset>
        <button class="primary-button wide-button" type="button" data-action="calendar" ${context.state.baseSchedule.length || context.state.dateOverrides.some((item) => item.action === 'add') ? '' : 'disabled'}>导出 iPhone 日历 .ics</button>
        <p class="fine-print">建议导入单独的 Plantation 日历。计划变更后请重新导出，或在系统日历里手动修改；避免重复导入造成重复提醒。</p></section>
      <section class="panel"><h3>计划与备份</h3><p class="muted">学期计划导入会替换计划结构，但保留现有历史打卡和提醒设置；完整恢复会替换全部本机数据。</p>
        <div class="button-grid"><label class="soft-button file-button">导入学期计划<input type="file" accept=".json,application/json" data-file="schedule" hidden></label><label class="soft-button file-button">恢复完整备份<input type="file" accept=".json,application/json" data-file="restore" hidden></label><button class="soft-button" type="button" data-action="backup">导出完整备份</button><button class="soft-button" type="button" data-action="sample">载入匿名示例</button></div>
        <p class="fine-print">匿名示例：<a href="./sample/Plantation-朋友学期计划.json" download>下载示例学期计划 JSON</a>。它不含真实老师、班级或教室。备份包含学期计划、永久修改、单日修改、打卡、提醒和备注，请妥善保存。</p></section>
      <details class="panel guide-panel"><summary>iPhone 添加主屏幕与日历说明</summary><ol><li>用 Safari 打开 Plantation。</li><li>点“分享” → “添加到主屏幕”。</li><li>开启“作为网页 App 打开”，再点“添加”。</li><li>从主屏幕打开 Plantation，导入计划。</li><li>导出 ICS 后按系统提示添加；若手机不显示“添加全部”，可在 Mac“日历”中导入到单独的 iCloud 日历。</li></ol><p class="fine-print">系统通知受静音、专注模式和“日历”通知权限影响。清除 Safari 网站数据或删除网页 App 可能清空本机记录，换机前务必导出完整备份。</p></details>
      <details class="panel guide-panel"><summary>数据结构与当前状态</summary><p class="fine-print">原始计划 ${context.state.baseSchedule.length} 个系列 · 永久修改 ${context.state.permanentOverrides.length} 项 · 单日修改 ${context.state.dateOverrides.length} 项 · 历史打卡 ${Object.keys(context.state.checkins).length} 项。</p><p class="fine-print">存储方式：${escapeHTML(context.storageMode === 'indexedDB' ? 'IndexedDB' : 'localStorage 兼容模式')} · 数据格式 v${context.state.schemaVersion}。原始学期计划、永久修改和单日覆盖分层保存。</p></details>`;
  }

  function navigation() {
    return [['day', '日程'], ['week', '本周'], ['check', '打卡'], ['reminder', '提醒']].map(([id, label]) => `<button type="button" data-action="tab" data-tab="${id}" class="${context.tab === id ? 'selected' : ''}" ${context.tab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('');
  }

  function bind() {
    $$('[data-action="tab"]').forEach((button) => button.addEventListener('click', () => context.actions.setTab(button.dataset.tab)));
    $$('[data-action="today"]').forEach((button) => button.addEventListener('click', () => context.actions.openDate(P.Schedule.today())));
    $$('[data-action="move-day"]').forEach((button) => button.addEventListener('click', () => context.actions.openDate(P.Schedule.addDays(context.selectedDate, Number(button.dataset.value)))));
    $$('[data-action="move-week"]').forEach((button) => button.addEventListener('click', () => context.actions.moveWeek(Number(button.dataset.value))));
    $$('[data-action="open-day"]').forEach((button) => button.addEventListener('click', () => context.actions.openDate(button.dataset.date)));
    $$('[data-action="pick-date"]').forEach((input) => input.addEventListener('change', () => P.Schedule.validDate(input.value) && context.actions.openDate(input.value)));
    $$('[data-action="details"]').forEach((button) => button.addEventListener('click', () => openDetails(button.dataset.id)));
    $$('[data-action="check"]').forEach((button) => button.addEventListener('click', () => context.actions.toggleCheckin(button.dataset.id)));
    $$('[data-action="add"]').forEach((button) => button.addEventListener('click', () => openEditor(null)));
    $$('[data-action="alarms"]').forEach((input) => input.addEventListener('change', () => context.actions.setAlarms(input.checked)));
    $$('[data-action="calendar"]').forEach((button) => button.addEventListener('click', () => {
      const kinds = $$('[name="calendar-kind"]:checked').map((input) => input.value);
      context.actions.exportCalendar($('#calendar-range').value, kinds);
    }));
    $$('[data-action="backup"]').forEach((button) => button.addEventListener('click', () => context.actions.backup()));
    $$('[data-action="sample"]').forEach((button) => button.addEventListener('click', () => context.actions.loadSample()));
    $$('[data-file]').forEach((input) => input.addEventListener('change', async () => {
      if (input.files?.[0]) await context.actions.importFile(input.files[0], input.dataset.file);
      input.value = '';
    }));
  }

  function mount(nextContext) {
    context = nextContext;
    $('#app').innerHTML = context.warning ? `<p class="notice" role="alert">${escapeHTML(context.warning)}</p>` : '';
    $('#app').insertAdjacentHTML('beforeend', context.tab === 'day' ? dayView() : context.tab === 'week' ? weekView() : context.tab === 'check' ? checkView() : reminderView());
    $('.bottom-nav').innerHTML = navigation();
    bind();
  }

  function findOccurrence(id) {
    const direct = P.Schedule.materializeDay(context.state, context.selectedDate).find((item) => item.id === id);
    if (direct) return direct;
    const around = P.Schedule.materializeRange(context.state, context.state.semester.startDate, context.state.semester.endDate);
    return around.find((item) => item.id === id) || null;
  }

  function showDialog(content) {
    const layer = $('#modal-layer');
    const modal = $('#modal');
    modal.innerHTML = `<div class="modal-top"><span>Plantation</span><button type="button" data-close aria-label="关闭">×</button></div>${content}`;
    $('[data-close]', modal).addEventListener('click', closeDialog);
    layer.onclick = (event) => { if (event.target === layer) closeDialog(); };
    layer.hidden = false;
    document.body.classList.add('modal-open');
    modal.scrollTop = 0;
  }

  function closeDialog() {
    const layer = $('#modal-layer');
    if (!layer) return;
    layer.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function openDetails(id) {
    const item = findOccurrence(id);
    if (!item) return toast('这项计划已不存在。');
    showDialog(`<span class="eyebrow">${escapeHTML(item.kind)} · ${item.date} · ${escapeHTML(P.Schedule.weekLabel(item.date, context.state.semester))}</span><h2>${escapeHTML(item.title)}</h2><p class="detail-time">${item.startTime}–${item.endTime}</p><p class="muted">${escapeHTML(item.location || '未设置地点')}</p><div class="note-box">${escapeHTML(item.note || '暂无备注')}</div><button class="primary-button wide-button" type="button" data-edit>修改计划 / 备注</button>`);
    $('[data-edit]', $('#modal')).addEventListener('click', () => openEditor(item));
  }

  function openEditor(item) {
    const isDateAdd = item?.origin === 'date-add';
    const date = item?.date || context.selectedDate;
    const title = item ? '修改计划与备注' : '添加计划';
    const kind = item?.kind || '自主学习';
    const kinds = P.Schedule.allKinds(context.state);
    const customValue = kinds.includes(kind) ? '' : kind;
    showDialog(`<h2>${title}</h2><form id="plan-form" novalidate>
      <label class="field">项目名称<input name="title" type="text" inputmode="text" enterkeyhint="next" maxlength="300" required value="${escapeHTML(item?.title || '')}"></label>
      <div class="form-grid"><label class="field">日期<input name="date" type="date" required value="${date}" ${item ? 'readonly' : ''}></label><label class="field">类型<select name="kindPreset" required>${kinds.map((entry) => `<option value="${escapeHTML(entry)}" ${entry === kind ? 'selected' : ''}>${escapeHTML(entry)}</option>`).join('')}<option value="__custom__" ${customValue ? 'selected' : ''}>＋ 自定义类型</option></select><small class="field-hint">需要其他类型时，选择“自定义类型”</small></label><label class="field">开始<input name="startTime" type="time" required value="${item?.startTime || '09:00'}"></label><label class="field">结束<input name="endTime" type="time" required value="${item?.endTime || '10:00'}"></label></div>
      <label class="field custom-kind-field" ${customValue ? '' : 'hidden'}>自定义类型<input name="customKind" type="text" inputmode="text" enterkeyhint="done" maxlength="30" value="${escapeHTML(customValue)}" placeholder="例如：社团、兼职、生活事务" ${customValue ? 'required' : 'disabled'}><small class="field-hint">输入任意名称，保存后会加入常用类型</small></label>
      <label class="field">地点 / 教室<input name="location" type="text" inputmode="text" enterkeyhint="next" maxlength="1000" value="${escapeHTML(item?.location || '')}"></label>
      <label class="field">备注（可写老师、准备事项或复习内容）<textarea name="note" inputmode="text" maxlength="15000" rows="5">${escapeHTML(item?.note || '')}</textarea></label>
      <label class="field">生效范围<select name="scope" ${isDateAdd ? 'disabled' : ''}><option value="once">临时 · 仅 ${date} 这一次</option><option value="future">永久 · ${item ? '整个重复计划' : '从这天起重复'}</option></select></label>
      ${!item ? `<div id="repeat-fields" hidden><div class="form-grid"><label class="field">重复规则<select name="pattern"><option value="all">每周</option><option value="odd">仅单教学周</option><option value="even">仅双教学周</option></select></label><label class="field">重复截至<input name="until" type="date" required value="${context.state.semester.endDate}"></label></div></div>` : ''}
      <p class="fine-print">${isDateAdd ? '临时新增没有重复系列，因此只修改这一次。' : item ? '永久修改会应用到整个重复计划；打卡历史不会因为计划变化被删除。备注使用相同范围。' : '永久新增可按每周、单周或双周重复。假期是否出现取决于所选重复规则与学期设置。'}</p>
      <p id="form-error" class="form-error" role="alert"></p>
      <div class="modal-actions"><button class="primary-button" type="submit">保存</button>${item ? '<button class="danger-button" type="button" data-delete>删除计划</button>' : ''}</div>
    </form>`);
    const form = $('#plan-form');
    const scope = $('[name="scope"]', form);
    const repeat = $('#repeat-fields', form);
    const kindPreset = $('[name="kindPreset"]', form);
    const customKindField = $('.custom-kind-field', form);
    const customKind = $('[name="customKind"]', form);
    const updateCustomKind = (focusInput) => {
      const enabled = kindPreset.value === '__custom__';
      customKindField.hidden = !enabled;
      customKind.disabled = !enabled;
      customKind.required = enabled;
      if (enabled && focusInput) {
        customKind.focus({ preventScroll: true });
        requestAnimationFrame(() => customKind.focus({ preventScroll: true }));
      }
    };
    kindPreset.addEventListener('change', () => updateCustomKind(true));
    updateCustomKind(false);
    if (repeat) { const updateRepeat = () => { repeat.hidden = scope.value !== 'future'; }; scope.addEventListener('change', updateRepeat); updateRepeat(); }
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      values.kind = values.kindPreset === '__custom__' ? String(values.customKind || '').trim() : values.kindPreset;
      delete values.kindPreset;
      delete values.customKind;
      if (isDateAdd) values.scope = 'once';
      const result = await context.actions.savePlan(values, item);
      if (result.ok) closeDialog(); else $('#form-error').textContent = result.message;
    });
    if (item) $('[data-delete]', form).addEventListener('click', async () => {
      const chosenScope = isDateAdd ? 'once' : scope.value;
      if (await context.actions.deletePlan(item, chosenScope)) closeDialog();
    });
  }

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { element.hidden = true; }, 4300);
  }

  function showUpdate(onApply) {
    const banner = $('#update-banner');
    banner.hidden = false;
    $('#update-now').onclick = onApply;
  }

  P.UI = { mount, toast, showUpdate, openEditor };
})(window.Plantation = window.Plantation || {});
