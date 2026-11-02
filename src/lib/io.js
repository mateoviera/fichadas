// Utilidades de entrada/salida: descargas, CSV y feriados.

export function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV con ; y BOM: Excel en español lo abre directo con columnas separadas. */
export function toCSV(rows, sep = ';') {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(sep)).join('\r\n');
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function readFileAsArrayBuffer(file) {
  return file.arrayBuffer();
}

/** Feriados nacionales desde Nager.Date (API pública y gratuita). */
export async function fetchHolidays(year, country = 'AR') {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
  if (!res.ok) throw new Error(`El servicio de feriados respondió ${res.status}.`);
  const data = await res.json();
  return data.map((h) => ({ date: h.date, name: h.localName || h.name }));
}
