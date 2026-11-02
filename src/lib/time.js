// Todas las fechas se manejan como "hora local del reloj" sin zona horaria.
// Internamente: segundos desde epoch calculados con Date.UTC (evita problemas de DST).

export const MIN = 60;
export const HOUR = 3600;
export const DAY = 86400;

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const WEEKDAYS_LETTER = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function toTs(y, m, d, h = 0, mi = 0, s = 0) {
  return Date.UTC(y, m - 1, d, h, mi, s) / 1000;
}

export function dateKey(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function keyToTs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return toTs(y, m, d);
}

export function addDays(key, n) {
  return dateKey(keyToTs(key) + n * DAY);
}

export function weekday(keyOrTs) {
  const ts = typeof keyOrTs === 'string' ? keyToTs(keyOrTs) : keyOrTs;
  return new Date(ts * 1000).getUTCDay();
}

/** "22:00" -> 1320 (minutos) */
export function hmToMin(hm) {
  if (!hm) return null;
  const [h, m] = String(hm).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export function fmtTime(ts) {
  return new Date(ts * 1000).toISOString().slice(11, 16);
}

export function fmtDate(key) {
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateShort(key) {
  const [, m, d] = key.split('-');
  return `${WEEKDAYS_SHORT[weekday(key)]} ${d}/${m}`;
}

/** minutos -> "7:45" */
export function fmtDuration(min) {
  if (min == null || Number.isNaN(min)) return '';
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

export function* eachDay(fromKey, toKey) {
  for (let k = fromKey; k <= toKey; k = addDays(k, 1)) yield k;
}

export function todayKey() {
  const n = new Date();
  return dateKey(toTs(n.getFullYear(), n.getMonth() + 1, n.getDate()));
}
