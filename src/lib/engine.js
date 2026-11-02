import { MIN, DAY, dateKey, keyToTs, addDays, weekday, hmToMin, eachDay, fmtTime } from './time.js';

export const DEFAULT_SETTINGS = {
  tolIn: 10, // minutos de tolerancia para el ingreso
  tolOut: 10, // minutos de tolerancia para el egreso
  windowMin: 180, // ventana de búsqueda alrededor del horario esperado
  dedupeMin: 10, // fichadas repetidas dentro de estos minutos se consideran una sola
  maxFreeHours: 16, // máximo de horas entre ingreso y egreso cuando no hay horario
  extraMin: 30, // a partir de cuántos minutos después del egreso se marca "extra"
};

export const ISSUE_LABELS = {
  tarde: 'Llegada tarde',
  anticipada: 'Salida anticipada',
  sin_ingreso: 'Sin ingreso',
  sin_egreso: 'Sin egreso',
  ausente: 'Ausente',
  fuera: 'Fuera de horario',
};
export const INFO_LABELS = {
  feriado: 'Feriado',
  licencia: 'Licencia',
  extra: 'Horas extra',
  sin_horario: 'Sin horario asignado',
  manual: 'Fichada manual',
};

/** Duración en minutos de un bloque (soporta cruce de medianoche: 22:00 → 06:00 = 480). */
export function blockDuration(b) {
  const s = hmToMin(b.start);
  const e = hmToMin(b.end);
  if (s == null || e == null) return 0;
  return e > s ? e - s : e + 1440 - s;
}

function blockLabel(b) {
  return `${b.start}–${b.end}`;
}

/** Turnos esperados (instancias) que "rodean" a un instante: día anterior, mismo día y siguiente. */
function instancesAround(schedule, ts) {
  const out = [];
  const base = dateKey(ts);
  for (const dk of [addDays(base, -1), base, addDays(base, 1)]) {
    out.push(...instancesForDay(schedule, dk));
  }
  return out;
}

const dayCache = new Map();
function instancesForDay(schedule, dk) {
  const ck = `${schedule.id}|${schedule._v || ''}|${dk}`;
  if (dayCache.has(ck)) return dayCache.get(ck);
  const wd = weekday(dk);
  const res = [];
  (schedule.blocks || []).forEach((b, idx) => {
    const days = schedule.type === 'rotativo' ? [0, 1, 2, 3, 4, 5, 6] : b.days || [];
    if (!days.includes(wd)) return;
    const sMin = hmToMin(b.start);
    const dur = blockDuration(b);
    if (sMin == null || !dur) return;
    const start = keyToTs(dk) + sMin * MIN;
    res.push({
      key: `${dk}#${idx}`,
      date: dk,
      start,
      end: start + dur * MIN,
      dur: dur * MIN,
      est: b.est || '',
      label: blockLabel(b),
      overnight: hmToMin(b.end) <= sMin,
    });
  });
  if (dayCache.size > 20000) dayCache.clear();
  dayCache.set(ck, res);
  return res;
}

/** Une fichadas repetidas (mismo reloj, pocos minutos de diferencia). */
export function dedupe(punches, seconds) {
  const out = [];
  const lastByEst = new Map();
  for (const p of punches) {
    const last = lastByEst.get(p.e);
    if (last && p.t - last.t <= seconds) {
      last.dups.push(p);
      continue;
    }
    const item = { ...p, dups: [] };
    out.push(item);
    lastByEst.set(p.e, item);
  }
  return out;
}

function rangeOk(dk, from, to) {
  return (!from || dk >= from) && (!to || dk <= to);
}

function leaveFor(leaves, dk) {
  return leaves.find((l) => dk >= l.from && dk <= (l.to || l.from));
}

/**
 * Analiza las fichadas de un empleado contra su horario.
 * punches: [{e: establecimientoId, t: ts, m?: notaManual}] de ese legajo (cualquier orden)
 * schedule: { id, type: 'fijo'|'rotativo', blocks: [{days, start, end, est}] } o null
 */
export function analyzeEmployee({ punches, schedule, settings = DEFAULT_SETTINGS, holidays = new Map(), leaves = [], from, to, isCovered = () => true }) {
  const S = { ...DEFAULT_SETTINGS, ...settings };
  const W = S.windowMin * MIN;
  const sorted = [...punches].sort((a, b) => a.t - b.t);
  const P = dedupe(sorted, S.dedupeMin * MIN);
  const used = new Array(P.length).fill(false);
  const matched = new Set();
  const rows = [];

  const hasBlocks = schedule && (schedule.blocks || []).some((b) => blockDuration(b) > 0);

  if (!hasBlocks) {
    // Sin horario: se empareja cada ingreso con la siguiente fichada del mismo establecimiento.
    for (let i = 0; i < P.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const p = P[i];
      let exit = null;
      for (let j = i + 1; j < P.length; j++) {
        if (used[j] || P[j].e !== p.e) continue;
        if (P[j].t - p.t <= S.maxFreeHours * 3600) {
          exit = P[j];
          used[j] = true;
        }
        break;
      }
      rows.push(makeRow({ inst: null, entry: p, exit, mids: [], S, holidays, leaves, noSchedule: true }));
    }
    return finish(rows, from, to);
  }

  const estOk = (inst, p) => !inst.est || inst.est === p.e;

  const bestStart = (p, exclude) => {
    let best = null;
    let bestD = Infinity;
    for (const inst of instancesAround(schedule, p.t)) {
      if (matched.has(inst.key) || inst.key === exclude || !estOk(inst, p)) continue;
      const d = p.t - inst.start;
      if (d < -W || d > Math.min(W, inst.dur / 2)) continue;
      if (Math.abs(d) < bestD) {
        bestD = Math.abs(d);
        best = inst;
      }
    }
    return best ? { inst: best, diff: bestD } : null;
  };

  const bestEnd = (p) => {
    let best = null;
    let bestD = Infinity;
    for (const inst of instancesAround(schedule, p.t)) {
      if (matched.has(inst.key) || !estOk(inst, p)) continue;
      const d = p.t - inst.end;
      if (d < -Math.min(W, inst.dur / 2) || d > W) continue;
      if (Math.abs(d) < bestD) {
        bestD = Math.abs(d);
        best = inst;
      }
    }
    return best ? { inst: best, diff: bestD } : null;
  };

  // Busca el egreso de un turno iniciado en P[i].
  const findExit = (i, inst) => {
    const p = P[i];
    const cands = [];
    for (let j = i + 1; j < P.length && P[j].t <= inst.end + W; j++) {
      if (!used[j] && P[j].e === p.e) cands.push(j);
    }
    const endFrom = Math.max(inst.end - W, inst.start + inst.dur / 2);
    const endish = cands.filter((j) => {
      const c = P[j];
      if (c.t < endFrom) return false;
      // si esta fichada encaja mejor como inicio de OTRO turno, no es egreso
      const other = bestStart(c, inst.key);
      return !(other && other.diff < Math.abs(c.t - inst.end));
    });
    let exitIdx = endish.length ? endish[endish.length - 1] : -1;
    if (exitIdx < 0) {
      const early = cands.filter((j) => P[j].t >= p.t + 30 * MIN && P[j].t < endFrom && !bestStart(P[j], inst.key));
      if (early.length) exitIdx = early[early.length - 1];
    }
    const mids = exitIdx < 0 ? [] : cands.filter((j) => j < exitIdx);
    return { exitIdx, mids };
  };

  for (let i = 0; i < P.length; i++) {
    if (used[i]) continue;
    const p = P[i];
    const asStart = bestStart(p);
    const asEnd = bestEnd(p);

    if (asStart) {
      const { exitIdx, mids } = findExit(i, asStart.inst);
      if (exitIdx >= 0 || !asEnd || asStart.diff <= asEnd.diff) {
        used[i] = true;
        matched.add(asStart.inst.key);
        if (exitIdx >= 0) used[exitIdx] = true;
        mids.forEach((j) => (used[j] = true));
        rows.push(makeRow({ inst: asStart.inst, entry: p, exit: exitIdx >= 0 ? P[exitIdx] : null, mids: mids.map((j) => P[j]), S, holidays, leaves }));
        continue;
      }
    }
    if (asEnd) {
      used[i] = true;
      matched.add(asEnd.inst.key);
      rows.push(makeRow({ inst: asEnd.inst, entry: null, exit: p, mids: [], S, holidays, leaves }));
      continue;
    }
    // Fichada fuera de cualquier turno programado: se intenta emparejar con la siguiente.
    used[i] = true;
    let exit = null;
    for (let j = i + 1; j < P.length; j++) {
      if (used[j] || P[j].e !== p.e) continue;
      if (P[j].t - p.t <= S.maxFreeHours * 3600 && !bestStart(P[j]) && !bestEnd(P[j])) {
        exit = P[j];
        used[j] = true;
      }
      break;
    }
    rows.push(makeRow({ inst: null, entry: p, exit, mids: [], S, holidays, leaves, outside: true }));
  }

  // Ausencias (solo horarios fijos: en rotativos no se sabe qué días le tocaba).
  // isCovered(dk, est) indica si hay archivos cargados que cubran ese día (evita falsas ausencias).
  if (schedule.type !== 'rotativo' && from && to) {
    for (const dk of eachDay(from, to)) {
      for (const inst of instancesForDay(schedule, dk)) {
        if (matched.has(inst.key) || !isCovered(dk, inst.est)) continue;
        rows.push(makeRow({ inst, entry: null, exit: null, mids: [], S, holidays, leaves, absent: true }));
      }
    }
  }

  return finish(rows, from, to);
}

function makeRow({ inst, entry, exit, mids, S, holidays, leaves, noSchedule, outside, absent }) {
  const date = inst ? inst.date : dateKey((entry || exit).t);
  const issues = [];
  const info = [];
  let lateMin = 0;
  let earlyMin = 0;
  let extraMin = 0;

  const holiday = holidays.get ? holidays.get(date) : null;
  const leave = leaveFor(leaves, date);

  if (absent) {
    if (holiday) info.push('feriado');
    else if (leave) info.push('licencia');
    else issues.push('ausente');
  } else if (noSchedule) {
    info.push('sin_horario');
    if (!exit) issues.push('sin_egreso');
  } else if (outside) {
    issues.push('fuera');
  } else {
    if (!entry) issues.push('sin_ingreso');
    if (!exit) issues.push('sin_egreso');
    if (entry) {
      const d = Math.round((entry.t - inst.start) / MIN);
      if (d > S.tolIn) {
        issues.push('tarde');
        lateMin = d;
      }
    }
    if (exit) {
      const d = Math.round((inst.end - exit.t) / MIN);
      if (d > S.tolOut) {
        issues.push('anticipada');
        earlyMin = d;
      } else if (-d >= S.extraMin) {
        info.push('extra');
        extraMin = -d;
      }
    }
    if (holiday) info.push('feriado');
    if (leave) info.push('licencia');
  }
  if ((entry && entry.m) || (exit && exit.m)) info.push('manual');

  const workedMin = entry && exit ? Math.round((exit.t - entry.t) / MIN) : 0;
  return {
    key: inst ? inst.key : `x${(entry || exit).t}`,
    date,
    inst,
    entry,
    exit,
    mids,
    est: (entry || exit || {}).e || (inst && inst.est) || '',
    issues,
    info,
    lateMin,
    earlyMin,
    extraMin,
    workedMin,
    expectedMin: inst && !(absent && (holiday || leave)) ? Math.round(inst.dur / MIN) : 0,
    holidayName: holiday || '',
    leaveType: leave ? leave.type : '',
    nextDayExit: !!(exit && dateKey(exit.t) !== date),
  };
}

function finish(rows, from, to) {
  return rows
    .filter((r) => rangeOk(r.date, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || sortTs(a) - sortTs(b));
}

function sortTs(r) {
  return r.inst ? r.inst.start : (r.entry || r.exit).t;
}

export function summarize(rows) {
  const s = { turnos: 0, ok: 0, tarde: 0, tardeMin: 0, anticipada: 0, anticipadaMin: 0, incompleto: 0, ausente: 0, fuera: 0, worked: 0, expected: 0, extra: 0, evaluables: 0 };
  for (const r of rows) {
    const isAbsentExcused = !r.entry && !r.exit;
    if (!isAbsentExcused) s.turnos++;
    s.worked += r.workedMin;
    s.expected += r.expectedMin;
    s.extra += r.extraMin;
    if (r.issues.includes('tarde')) { s.tarde++; s.tardeMin += r.lateMin; }
    if (r.issues.includes('anticipada')) { s.anticipada++; s.anticipadaMin += r.earlyMin; }
    if (r.issues.includes('sin_ingreso') || r.issues.includes('sin_egreso')) s.incompleto++;
    if (r.issues.includes('ausente')) s.ausente++;
    if (r.issues.includes('fuera')) s.fuera++;
    const evaluable = r.inst && !r.info.includes('sin_horario') && !(isAbsentExcused && !r.issues.length);
    if (evaluable) {
      s.evaluables++;
      if (!r.issues.length) s.ok++;
    }
  }
  s.cumplimiento = s.evaluables ? Math.round((s.ok / s.evaluables) * 100) : null;
  return s;
}

/** Texto corto para depurar / exportar. */
export function rowToText(r) {
  const i = r.entry ? fmtTime(r.entry.t) : '--:--';
  const o = r.exit ? fmtTime(r.exit.t) + (r.nextDayExit ? '(+1)' : '') : '--:--';
  return `${r.date} ${r.inst ? r.inst.label : 'libre'} ${i}→${o} ${[...r.issues, ...r.info].join(',')}`;
}

export { DAY };
