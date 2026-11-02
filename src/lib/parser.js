import { toTs, dateKey } from './time.js';

/** Decodifica el archivo: UTF-8 y, si falla, Windows-1252 (típico de relojes con ñ / acentos). */
export function decodeBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

const DT_RE = /(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/;

/**
 * Lee un TXT exportado por relojes ProSoft / ZKTeco.
 * Formatos soportados (detectados automáticamente):
 *  - AllGLog:   No  DevId  UserId  UName  Verify  DateTime
 *  - UDISKLOG:  No  Mchn   EnNo    Name   Mode    IOMd  DateTime   (con línea de versión/firmware)
 *  - Genérico:  cualquier línea con un número de registro, equipo, legajo y fecha/hora.
 */
export function parseClockFile(text, fileName = '') {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const meta = { fileName, format: 'Genérico', firmware: '', exportDate: '', device: '' };
  const records = [];
  const errors = [];

  const first = lines[0] || '';
  if (/^UDISKLOG/i.test(first)) {
    meta.format = 'UDISKLOG';
    const v = first.match(/version=(\S+)/i);
    const fw = first.match(/firmware=(\S+)/i);
    const dt = first.match(/date=(\S+)/i);
    if (v) meta.format += ` v${v[1]}`;
    if (fw) meta.firmware = fw[1];
    if (dt) meta.exportDate = dt[1];
  }
  const headerIdx = lines.findIndex((l) => /DateTime/i.test(l) && /^\s*No\b/i.test(l));
  if (headerIdx >= 0) {
    const h = lines[headerIdx];
    if (/UserId/i.test(h)) meta.format = 'AllGLog';
    else if (/EnNo/i.test(h) && meta.format === 'Genérico') meta.format = 'GLog (EnNo)';
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.trim() || i === headerIdx || /^UDISKLOG/i.test(line)) return;
    const dt = line.match(DT_RE);
    if (!dt) {
      if (/^\s*\d+/.test(line)) errors.push({ line: i + 1, text: line });
      return;
    }
    const before = line.slice(0, dt.index);
    let cols = before.split('\t');
    if (cols.length < 3) cols = before.trim().split(/\s+/);
    const nums = cols.map((c) => c.trim());
    // columnas: No, Equipo, Legajo, Nombre, ...
    const legajoRaw = nums[2];
    if (!legajoRaw || !/^\d+$/.test(legajoRaw)) {
      errors.push({ line: i + 1, text: line });
      return;
    }
    const name = (cols[3] || '').trim();
    const [, y, mo, d, hh, mi, ss] = dt;
    const ts = toTs(+y, +mo, +d, +hh, +mi, +(ss || 0));
    if (!meta.device && nums[1]) meta.device = nums[1];
    records.push({
      legajo: String(parseInt(legajoRaw, 10)),
      name: /^\d*$/.test(name) ? '' : name,
      ts,
    });
  });

  records.sort((a, b) => a.ts - b.ts);
  const legajos = new Set(records.map((r) => r.legajo));
  return {
    meta,
    records,
    errors,
    summary: {
      count: records.length,
      legajos: legajos.size,
      from: records.length ? dateKey(records[0].ts) : null,
      to: records.length ? dateKey(records[records.length - 1].ts) : null,
    },
  };
}
