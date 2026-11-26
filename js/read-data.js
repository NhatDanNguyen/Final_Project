// CSV loading, strict parsing, within-workbook summaries, and source-data validation.
// Shared URLs, metadata, layout defaults, colours, and formatters live in ./share-constants.js.

import {
  AGE_GROUPS,
  AGE_ORDER,
  COUNTERPARTY_KEYS,
  DATA_URLS,
  OLDER_AGE_GROUPS,
  ROAD_USERS,
  ROAD_USER_ORDER,
  STATES,
  STATE_BY_CODE,
  WORKBOOKS,
  YEAR_RANGE,
  fmtInt
} from './share-constants.js';

// --- Strict parsing helpers (blank cells become null, never zero) ---

function assertColumns(columns, required, datasetName) {
  if (!Array.isArray(columns)) {
    throw new Error(`${datasetName}: missing CSV header column list.`);
  }
  const missing = required.filter(col => !columns.includes(col));
  if (missing.length) {
    throw new Error(`${datasetName}: CSV is missing column(s): ${missing.join(', ')}`);
  }
}

function parseText(value) {
  const s = (value ?? '').trim();
  return s === '' ? null : s;
}

function parseInteger(value, col, context) {
  const s = (value ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid integer for ${col} (${context}): "${s}"`);
  }
  return n;
}

function parseNumber(value, col, context) {
  const s = (value ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) {
    throw new Error(`Non-numeric ${col} (${context}): "${s}"`);
  }
  return n;
}

// Returns null if any row has a missing value (prevents silently treating nulls as 0 in totals).
function sumStrict(rows, accessor) {
  let total = 0;
  for (const row of rows) {
    const v = accessor(row);
    if (v == null) return null;
    total += v;
  }
  return total;
}

function assertUniqueKeys(rows, keyFn, datasetName) {
  const seen = new Set();
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) {
      throw new Error(`${datasetName}: duplicate key "${key}"`);
    }
    seen.add(key);
  }
}

// --- Pure CSV row parsers (one per exported dataset) ---

// Act 1: road_user_trend.csv ("year","road_user","hospitalisations")
export function parseRoadUserTrend(raw, columns = raw?.columns) {
  assertColumns(columns, ['year', 'road_user', 'hospitalisations'], 'road_user_trend.csv');
  const rows = raw.map((r, i) => {
    const year = parseInteger(r.year, 'year', `row ${i + 1}`);
    const roadUser = parseText(r.road_user);
    if (year == null) throw new Error(`Missing year at row ${i + 1} in road_user_trend.csv`);
    if (roadUser == null) throw new Error(`Missing road_user at row ${i + 1} in road_user_trend.csv`);
    return {
      year,
      roadUser,
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', `${roadUser} ${year}`)
    };
  }).sort((a, b) => {
    const orderA = ROAD_USER_ORDER.get(a.roadUser) ?? 99;
    const orderB = ROAD_USER_ORDER.get(b.roadUser) ?? 99;
    return orderA - orderB || a.year - b.year;
  });
  assertUniqueKeys(rows, d => `${d.roadUser}|${d.year}`, 'road_user_trend.csv');
  return rows;
}

// Act 2: pedal_cyclist_counterparty.csv ("counterparty","hospitalisations")
export function parseCounterparty(raw, columns = raw?.columns) {
  assertColumns(columns, ['counterparty', 'hospitalisations'], 'pedal_cyclist_counterparty.csv');
  const rows = raw.map((r, i) => {
    const counterparty = parseText(r.counterparty);
    if (counterparty == null) throw new Error(`Missing counterparty at row ${i + 1} in pedal_cyclist_counterparty.csv`);
    return {
      counterparty,
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', counterparty),
      isNonCollision: counterparty === COUNTERPARTY_KEYS.nonCollision,
      isCarCollision: counterparty === COUNTERPARTY_KEYS.carCollision,
      isUnspecified: counterparty === COUNTERPARTY_KEYS.unspecified
    };
  }).sort((a, b) => (b.hospitalisations ?? -Infinity) - (a.hospitalisations ?? -Infinity));
  assertUniqueKeys(rows, d => d.counterparty, 'pedal_cyclist_counterparty.csv');

  const total = sumStrict(rows, d => d.hospitalisations);
  return rows.map(d => ({
    ...d,
    share: d.hospitalisations != null && total != null && total > 0 ? d.hospitalisations / total : null
  }));
}

// Act 3 (volume): age_grp_2011_vs_2021.csv ("year","age_group","hospitalisations")
export function parseAgeComparison(raw, columns = raw?.columns) {
  assertColumns(columns, ['year', 'age_group', 'hospitalisations'], 'age_grp_2011_vs_2021.csv');
  const rows = raw.map((r, i) => {
    const year = parseInteger(r.year, 'year', `row ${i + 1}`);
    const ageGroup = parseText(r.age_group);
    if (year == null) throw new Error(`Missing year at row ${i + 1} in age_grp_2011_vs_2021.csv`);
    if (ageGroup == null) throw new Error(`Missing age_group at row ${i + 1} in age_grp_2011_vs_2021.csv`);
    return {
      year,
      ageGroup,
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', `${ageGroup} ${year}`)
    };
  }).sort((a, b) => {
    const orderA = AGE_ORDER.get(a.ageGroup) ?? 99;
    const orderB = AGE_ORDER.get(b.ageGroup) ?? 99;
    return orderA - orderB || a.year - b.year;
  });
  assertUniqueKeys(rows, d => `${d.ageGroup}|${d.year}`, 'age_grp_2011_vs_2021.csv');
  return rows;
}

// Act 3 (clinical burden): avg_bds_age_grp.csv ("age_group","net_bed_days","hospitalisations","avg_bds")
export function parseAvgBedDaysByAge(raw, columns = raw?.columns) {
  assertColumns(columns, ['age_group', 'net_bed_days', 'hospitalisations', 'avg_bds'], 'avg_bds_age_grp.csv');
  const rows = raw.map((r, i) => {
    const ageGroup = parseText(r.age_group);
    if (ageGroup == null) throw new Error(`Missing age_group at row ${i + 1} in avg_bds_age_grp.csv`);
    return {
      ageGroup,
      netBedDays: parseInteger(r.net_bed_days, 'net_bed_days', ageGroup),
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', ageGroup),
      avgBedDays: parseNumber(r.avg_bds, 'avg_bds', ageGroup)
    };
  }).sort((a, b) => (AGE_ORDER.get(a.ageGroup) ?? 99) - (AGE_ORDER.get(b.ageGroup) ?? 99));
  assertUniqueKeys(rows, d => d.ageGroup, 'avg_bds_age_grp.csv');
  return rows;
}

// Act 4 (totals): state_hospitalisations_total_pedal_cyclist.csv ("state","hospitalisations","bed_days")
export function parseStateTotals(raw, columns = raw?.columns) {
  assertColumns(columns, ['state', 'hospitalisations', 'bed_days'], 'state_hospitalisations_total_pedal_cyclist.csv');
  const rows = raw.map((r, i) => {
    const state = parseText(r.state);
    if (state == null) throw new Error(`Missing state at row ${i + 1} in state_hospitalisations_total_pedal_cyclist.csv`);
    const meta = STATE_BY_CODE.get(state);
    return {
      state,
      stateName: meta ? meta.name : state,
      gridCol: meta ? meta.gridCol : null,
      gridRow: meta ? meta.gridRow : null,
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', state),
      bedDays: parseInteger(r.bed_days, 'bed_days', state)
    };
  }).sort((a, b) => (b.hospitalisations ?? -Infinity) - (a.hospitalisations ?? -Infinity));
  assertUniqueKeys(rows, d => d.state, 'state_hospitalisations_total_pedal_cyclist.csv');
  return rows;
}

// Act 4 (sparklines): state_hospitalisations_trend_pedal_cyclist.csv ("year","road_user","state","hospitalisations","bed_days")
export function parseStateTrends(raw, columns = raw?.columns) {
  assertColumns(columns, ['year', 'road_user', 'state', 'hospitalisations', 'bed_days'], 'state_hospitalisations_trend_pedal_cyclist.csv');
  const rows = raw.map((r, i) => {
    const year = parseInteger(r.year, 'year', `row ${i + 1}`);
    const roadUser = parseText(r.road_user);
    const state = parseText(r.state);
    if (year == null) throw new Error(`Missing year at row ${i + 1} in state_hospitalisations_trend_pedal_cyclist.csv`);
    if (roadUser == null) throw new Error(`Missing road_user at row ${i + 1} in state_hospitalisations_trend_pedal_cyclist.csv`);
    if (state == null) throw new Error(`Missing state at row ${i + 1} in state_hospitalisations_trend_pedal_cyclist.csv`);
    return {
      year,
      roadUser,
      state,
      hospitalisations: parseInteger(r.hospitalisations, 'hospitalisations', `${state} ${year}`),
      bedDays: parseInteger(r.bed_days, 'bed_days', `${state} ${year}`)
    };
  }).sort((a, b) => a.state.localeCompare(b.state) || a.year - b.year);
  assertUniqueKeys(rows, d => `${d.state}|${d.year}`, 'state_hospitalisations_trend_pedal_cyclist.csv');
  return rows;
}

// --- Within-workbook derived summaries (never join National and State workbooks) ---

export function buildAct1Summary(roadUserTrend) {
  const byRoadUser = new Map();
  for (const row of roadUserTrend) {
    if (!byRoadUser.has(row.roadUser)) byRoadUser.set(row.roadUser, []);
    byRoadUser.get(row.roadUser).push(row);
  }

  const orderedUsers = [
    ...ROAD_USERS.filter(u => byRoadUser.has(u)),
    ...[...byRoadUser.keys()].filter(u => !ROAD_USER_ORDER.has(u))
  ];

  const series = orderedUsers.map(roadUser => {
    const rows = byRoadUser.get(roadUser).slice().sort((a, b) => a.year - b.year);
    const byYear = new Map(rows.map(r => [r.year, r.hospitalisations]));
    const vStart = byYear.get(YEAR_RANGE.start) ?? null;
    const v2019 = byYear.get(2019) ?? null;
    const v2020 = byYear.get(2020) ?? null;
    const vEnd = byYear.get(YEAR_RANGE.end) ?? null;
    const change2011To2021 = vStart != null && vEnd != null ? vEnd - vStart : null;
    const change2019To2020 = v2019 != null && v2020 != null ? v2020 - v2019 : null;
    return {
      roadUser,
      isPrimary: roadUser === 'Pedal cyclist',
      rows,
      value2011: vStart,
      value2019: v2019,
      value2020: v2020,
      value2021: vEnd,
      change2011To2021,
      pctChange2011To2021: change2011To2021 != null && vStart > 0 ? change2011To2021 / vStart : null,
      change2019To2020,
      pctChange2019To2020: change2019To2020 != null && v2019 > 0 ? change2019To2020 / v2019 : null,
      total2011To2021: sumStrict(rows, r => r.hospitalisations)
    };
  });

  const years = [...new Set(roadUserTrend.map(r => r.year))].sort((a, b) => a - b);
  return { years, series };
}

export function buildAct2Summary(counterparty) {
  const total = sumStrict(counterparty, d => d.hospitalisations);
  return {
    total,
    rows: counterparty,
    nonCollision: counterparty.find(d => d.isNonCollision) ?? null,
    unspecified: counterparty.find(d => d.isUnspecified) ?? null,
    carCollision: counterparty.find(d => d.isCarCollision) ?? null
  };
}

export function buildAct3Summary(ageComparison, avgBedDaysByAge) {
  const compareByAge = new Map();
  for (const row of ageComparison) {
    if (!compareByAge.has(row.ageGroup)) compareByAge.set(row.ageGroup, {});
    compareByAge.get(row.ageGroup)[row.year] = row.hospitalisations;
  }
  const bedDaysByAge = new Map(avgBedDaysByAge.map(r => [r.ageGroup, r]));

  const byAgeGroup = AGE_GROUPS.map(ageGroup => {
    const cmp = compareByAge.get(ageGroup) ?? {};
    const bds = bedDaysByAge.get(ageGroup) ?? {};
    const hosp2011 = cmp[YEAR_RANGE.start] ?? null;
    const hosp2021 = cmp[YEAR_RANGE.end] ?? null;
    const change = hosp2011 != null && hosp2021 != null ? hosp2021 - hosp2011 : null;
    return {
      ageGroup,
      isOlder40Plus: OLDER_AGE_GROUPS.has(ageGroup),
      hosp2011,
      hosp2021,
      change,
      pctChange: change != null && hosp2011 > 0 ? change / hosp2011 : null,
      totalHospitalisations: bds.hospitalisations ?? null,
      netBedDays: bds.netBedDays ?? null,
      avgBedDays: bds.avgBedDays ?? null
    };
  });

  const hosp2011 = sumStrict(byAgeGroup, d => d.hosp2011);
  const hosp2021 = sumStrict(byAgeGroup, d => d.hosp2021);
  const totalGrowth = hosp2011 != null && hosp2021 != null ? hosp2021 - hosp2011 : null;
  const older40PlusGrowth = sumStrict(byAgeGroup.filter(d => d.isOlder40Plus), d => d.change);

  return {
    byAgeGroup,
    totals: {
      hosp2011,
      hosp2021,
      totalGrowth,
      older40PlusGrowth,
      older40PlusGrowthShare: older40PlusGrowth != null && totalGrowth != null && totalGrowth !== 0
        ? older40PlusGrowth / totalGrowth
        : null,
      totalHospitalisations: sumStrict(byAgeGroup, d => d.totalHospitalisations),
      totalNetBedDays: sumStrict(byAgeGroup, d => d.netBedDays)
    }
  };
}

export function buildAct4Summary(stateTotals, stateTrends) {
  const trendsByState = new Map();
  for (const row of stateTrends) {
    if (!trendsByState.has(row.state)) trendsByState.set(row.state, []);
    trendsByState.get(row.state).push(row);
  }
  const totalsByState = new Map(stateTotals.map(r => [r.state, r]));

  const byState = STATES.map(meta => {
    const tot = totalsByState.get(meta.code);
    const series = (trendsByState.get(meta.code) ?? []).slice().sort((a, b) => a.year - b.year);
    const byYear = new Map(series.map(r => [r.year, r.hospitalisations]));
    const value2011 = byYear.get(YEAR_RANGE.start) ?? null;
    const value2021 = byYear.get(YEAR_RANGE.end) ?? null;
    const change2011To2021 = value2011 != null && value2021 != null ? value2021 - value2011 : null;
    return {
      state: meta.code,
      stateName: meta.name,
      gridCol: meta.gridCol,
      gridRow: meta.gridRow,
      totalHospitalisations: tot ? tot.hospitalisations : null,
      totalBedDays: tot ? tot.bedDays : null,
      value2011,
      value2021,
      change2011To2021,
      pctChange2011To2021: change2011To2021 != null && value2011 > 0 ? change2011To2021 / value2011 : null,
      series
    };
  });

  return {
    byState,
    totals: {
      totalHospitalisations: sumStrict(byState, d => d.totalHospitalisations),
      totalBedDays: sumStrict(byState, d => d.totalBedDays)
    }
  };
}

// --- Async CSV loaders using D3 v7 ---

async function fetchCsv(url, parser) {
  if (!globalThis.d3?.csv) {
    throw new Error('D3 v7 is required before calling CSV loaders (ensure d3.min.js loads first).');
  }
  const raw = await globalThis.d3.csv(url);
  return parser(raw, raw.columns);
}

export const loadRoadUserTrend   = (url = DATA_URLS.roadUserTrend)   => fetchCsv(url, parseRoadUserTrend);
export const loadCounterparty    = (url = DATA_URLS.counterparty)    => fetchCsv(url, parseCounterparty);
export const loadAgeComparison   = (url = DATA_URLS.ageComparison)   => fetchCsv(url, parseAgeComparison);
export const loadAvgBedDaysByAge = (url = DATA_URLS.avgBedDaysByAge) => fetchCsv(url, parseAvgBedDaysByAge);
export const loadStateTotals     = (url = DATA_URLS.stateTotals)     => fetchCsv(url, parseStateTotals);
export const loadStateTrends     = (url = DATA_URLS.stateTrends)     => fetchCsv(url, parseStateTrends);

// Load all six exported CSVs in parallel, partitioned strictly by source workbook.
export async function loadAllData(urls = DATA_URLS) {
  const [
    roadUserTrend,
    counterparty,
    ageComparison,
    avgBedDaysByAge,
    stateTotals,
    stateTrends
  ] = await Promise.all([
    loadRoadUserTrend(urls.roadUserTrend),
    loadCounterparty(urls.counterparty),
    loadAgeComparison(urls.ageComparison),
    loadAvgBedDaysByAge(urls.avgBedDaysByAge),
    loadStateTotals(urls.stateTotals),
    loadStateTrends(urls.stateTrends)
  ]);

  return {
    national: {
      workbook: WORKBOOKS.national,
      roadUserTrend,
      counterparty,
      ageComparison,
      avgBedDaysByAge,
      act1: buildAct1Summary(roadUserTrend),
      act2: buildAct2Summary(counterparty),
      act3: buildAct3Summary(ageComparison, avgBedDaysByAge)
    },
    state: {
      workbook: WORKBOOKS.state,
      totals: stateTotals,
      trends: stateTrends,
      act4: buildAct4Summary(stateTotals, stateTrends)
    }
  };
}

// --- Source-data validation (kept separate from chart rendering) ---

export function validateAllData(datasets) {
  const checks = [];
  const add = (act, label, pass, detail = '', level = 'warn') => {
    checks.push({ act, label, pass, detail, level });
  };

  const { national, state } = datasets;
  const expectedYears = Array.from(
    { length: YEAR_RANGE.end - YEAR_RANGE.start + 1 },
    (_, i) => YEAR_RANGE.start + i
  );

  // Act 1: road_user_trend.csv
  const act1Series = national.act1.series;
  const pcSeries = act1Series.find(s => s.roadUser === 'Pedal cyclist');
  const allModesPresent =
    act1Series.length === ROAD_USERS.length &&
    ROAD_USERS.every(u => act1Series.some(s => s.roadUser === u));
  const allModesCompleteYears =
    national.roadUserTrend.length === ROAD_USERS.length * expectedYears.length &&
    act1Series.every(s =>
      s.rows.length === expectedYears.length &&
      s.rows.every((r, i) => r.year === expectedYears[i] && r.hospitalisations != null && r.hospitalisations >= 0)
    );
  add('Act 1', 'Exactly 4 expected transport modes present (Car occupant, Motorcyclist, Pedal cyclist, Pedestrian)', allModesPresent, `${act1Series.length} modes`, 'error');
  add('Act 1', 'Every mode covers 2011–2021 with no gaps, extras, or null counts', allModesCompleteYears, `${national.roadUserTrend.length} rows`, 'error');

  // Act 2: pedal_cyclist_counterparty.csv
  const cpNonEmpty = national.counterparty.length > 0 && national.counterparty.every(d => d.hospitalisations != null && d.hospitalisations >= 0);
  const cpReconciles = pcSeries != null && national.act2.total === pcSeries.total2011To2021;
  add('Act 2', 'Counterparty counts are complete and non-negative', cpNonEmpty, `${national.counterparty.length} categories`, 'error');
  add('Act 2', 'Counterparty total reconciles with Act 1 Pedal cyclist 2011–2021 total (National workbook)', cpReconciles,
    `Counterparty ${fmtInt(national.act2.total)} vs Trend ${fmtInt(pcSeries?.total2011To2021)}`, 'error');

  // Act 3: age_grp_2011_vs_2021.csv & avg_bds_age_grp.csv
  const ageRows = national.act3.byAgeGroup;
  const noUnexpectedAgeRows =
    national.ageComparison.length === AGE_GROUPS.length * 2 &&
    national.avgBedDaysByAge.length === AGE_GROUPS.length &&
    national.ageComparison.every(r => AGE_ORDER.has(r.ageGroup) && (r.year === YEAR_RANGE.start || r.year === YEAR_RANGE.end)) &&
    national.avgBedDaysByAge.every(r => AGE_ORDER.has(r.ageGroup));
  const ageComplete =
    noUnexpectedAgeRows &&
    ageRows.length === AGE_GROUPS.length &&
    ageRows.every(d =>
      d.hosp2011 != null && d.hosp2021 != null && d.netBedDays != null && d.totalHospitalisations != null && d.avgBedDays != null
    );
  const age2011Reconciles = pcSeries != null && national.act3.totals.hosp2011 === pcSeries.value2011;
  const age2021Reconciles = pcSeries != null && national.act3.totals.hosp2021 === pcSeries.value2021;
  const bdsTotalReconciles = pcSeries != null && national.act3.totals.totalHospitalisations === pcSeries.total2011To2021;
  const avgBdsMatchesRatio = ageRows.every(d =>
    d.totalHospitalisations > 0 && Math.abs(d.avgBedDays - (d.netBedDays / d.totalHospitalisations)) <= 0.01
  );
  add('Act 3', 'Exactly 7 canonical age groups with complete 2011/2021 and bed-day records', ageComplete,
    `${national.ageComparison.length} comparison rows, ${national.avgBedDaysByAge.length} bed-day rows`, 'error');
  add('Act 3', '2011 & 2021 age sums reconcile with Act 1 Pedal cyclist annual counts (National workbook)', age2011Reconciles && age2021Reconciles,
    `2011: ${fmtInt(national.act3.totals.hosp2011)} vs ${fmtInt(pcSeries?.value2011)}; 2021: ${fmtInt(national.act3.totals.hosp2021)} vs ${fmtInt(pcSeries?.value2021)}`, 'error');
  add('Act 3', 'Age bed-day hospitalisations reconcile with Act 1 Pedal cyclist 11-year total', bdsTotalReconciles,
    `Age table ${fmtInt(national.act3.totals.totalHospitalisations)} vs Trend ${fmtInt(pcSeries?.total2011To2021)}`, 'error');
  add('Act 3', 'Average net bed days equals net_bed_days / hospitalisations (within ±0.01 rounding)', avgBdsMatchesRatio, '', 'warn');

  // Act 4: state_hospitalisations_total_pedal_cyclist.csv & state_hospitalisations_trend_pedal_cyclist.csv
  const stateRows = state.act4.byState;
  const allStatesPresent =
    state.totals.length === STATES.length &&
    state.totals.every(r => STATE_BY_CODE.has(r.state)) &&
    stateRows.every(s => s.totalHospitalisations != null && s.totalBedDays != null);
  const allStatesCompleteYears =
    state.trends.length === STATES.length * expectedYears.length &&
    state.trends.every(r => STATE_BY_CODE.has(r.state)) &&
    stateRows.every(s =>
      s.series.length === expectedYears.length &&
      s.series.every((r, i) => r.year === expectedYears[i] && r.roadUser === 'Pedal cyclist' && r.hospitalisations != null && r.bedDays != null)
    );
  const stateSumsReconcile = stateRows.every(s =>
    sumStrict(s.series, r => r.hospitalisations) === s.totalHospitalisations &&
    sumStrict(s.series, r => r.bedDays) === s.totalBedDays
  );
  add('Act 4', 'Exactly 8 expected Australian jurisdictions present in state totals', allStatesPresent, `${state.totals.length} jurisdictions`, 'error');
  add('Act 4', 'Every jurisdiction covers 2011–2021 for Pedal cyclist with no gaps or extras', allStatesCompleteYears, `${state.trends.length} rows`, 'error');
  add('Act 4', 'State 2011–2021 trend sums reconcile exactly with state totals (State workbook)', stateSumsReconcile,
    `State total ${fmtInt(state.act4.totals.totalHospitalisations)} hospitalisations, ${fmtInt(state.act4.totals.totalBedDays)} bed days`, 'error');

  // Guardrail transparency note (intentional workbook separation)
  add(
    'Guardrail',
    'National and State & Territory workbooks kept unjoined',
    true,
    `National Pedal cyclist total (${fmtInt(pcSeries?.total2011To2021)}) and State & Territory sum (${fmtInt(state.act4.totals.totalHospitalisations)}) come from separate BITRE/AIHW workbooks and are never joined.`,
    'note'
  );

  return {
    checks,
    blocking: checks.some(c => !c.pass && c.level === 'error')
  };
}
