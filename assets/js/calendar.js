(function (P) {
  'use strict';
  function escapeICS(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }

  function utf8Length(value) {
    return new TextEncoder().encode(value).length;
  }

  function foldLine(line) {
    let output = '';
    let part = '';
    let bytes = 0;
    for (const character of line) {
      const size = utf8Length(character);
      if (bytes + size > 75) {
        output += `${part}\r\n`;
        part = ' ';
        bytes = 1;
      }
      part += character;
      bytes += size;
    }
    return output + part;
  }

  function utcStamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('日历时间无效。');
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  function stableHash(value) {
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < value.length; index += 1) {
      first = Math.imul(first ^ value.charCodeAt(index), 0x01000193);
      second = Math.imul(second ^ value.charCodeAt(index), 0x85ebca6b);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }

  function generateICS(items, settings) {
    if (!Array.isArray(items) || items.length > 20000) throw new Error('日历项目数量不正确。');
    const enabled = settings?.enabled !== false;
    const lead = Number.isInteger(settings?.minutesBefore) ? settings.minutesBefore : 10;
    const now = utcStamp(new Date());
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plantation//Study Planner//ZH-CN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Plantation', 'X-WR-TIMEZONE:Asia/Shanghai'
    ];
    for (const item of items) {
      const start = utcStamp(`${item.date}T${item.startTime}:00+08:00`);
      const end = utcStamp(`${item.date}T${item.endTime}:00+08:00`);
      lines.push(
        'BEGIN:VEVENT', `UID:${stableHash(item.id)}@plantation.local`, `DTSTAMP:${now}`,
        `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeICS(item.title)}`,
        `LOCATION:${escapeICS(item.location)}`, `DESCRIPTION:${escapeICS(item.note)}`,
        `CATEGORIES:${escapeICS(item.kind)}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE'
      );
      if (enabled) {
        lines.push('BEGIN:VALARM', `TRIGGER:-PT${lead}M`, 'ACTION:DISPLAY', `DESCRIPTION:${escapeICS(item.title)}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(foldLine).join('\r\n')}\r\n`;
  }

  function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function exportICS(items, settings, filename) {
    if (!items.length) throw new Error('所选范围没有可导出的项目。');
    const calendar = generateICS(items, settings);
    downloadBlob(calendar, filename, 'text/calendar;charset=utf-8');
    return items.length;
  }

  P.Calendar = { escapeICS, foldLine, generateICS, exportICS, downloadBlob, stableHash };
})(window.Plantation = window.Plantation || {});
