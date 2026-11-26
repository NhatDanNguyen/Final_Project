// Shared constants, metadata, layout defaults, colour palette, and formatters
// for "The Quiet Surge: Why Pedal Cyclists Became Australia's Fastest-Growing Road Trauma Burden, 2011-2021".
//
// Relative CSV paths resolve from html/index.html.
// Data-integrity guardrails:
//   1. Counts, not risk: all figures represent confirmed hospitalisation demand, never per-capita or per-km risk.
//   2. No cross-workbook joins: Acts 1-3 draw solely from the National workbook (Cause of injury = Traffic),
//      and Act 4 draws solely from the State & Territory workbook (Road user = Pedal cyclist).

export const DATA_URLS = {
  // National workbook (Cause of injury = Traffic) — Acts 1 to 3
  roadUserTrend: '../data/exports/road_user_trend.csv',
  counterparty: '../data/exports/pedal_cyclist_counterparty.csv',
  ageComparison: '../data/exports/age_grp_2011_vs_2021.csv',
  avgBedDaysByAge: '../data/exports/avg_bds_age_grp.csv',
  // State & Territory workbook (Road user = Pedal cyclist) — Act 4
  stateTotals: '../data/exports/state_hospitalisations_total_pedal_cyclist.csv',
  stateTrends: '../data/exports/state_hospitalisations_trend_pedal_cyclist.csv'
};

export const WORKBOOKS = {
  national: {
    id: 'national',
    name: 'BITRE/AIHW National Hospitalised Injury Workbook',
    filter: 'Cause of injury = Traffic',
    acts: [1, 2, 3],
    framingNote: 'Confirmed hospitalisation counts (hospital demand), not per-capita or per-kilometre crash risk.'
  },
  state: {
    id: 'state',
    name: 'BITRE/AIHW State & Territory Hospitalised Injury Workbook',
    filter: 'Road user = Pedal cyclist',
    acts: [4],
    framingNote: 'Confirmed hospitalisation counts (hospital demand) from the State & Territory workbook; kept separate from National totals.'
  }
};

export const YEAR_RANGE = { start: 2011, end: 2021 };

export const BREAKS = [
  {
    year: 2012,
    jurisdiction: 'Vic',
    label: '2012 (Vic)',
    note: 'Change in hospital admission counting criteria in Victoria (2012).'
  },
  {
    year: 2017,
    jurisdiction: 'NSW',
    label: '2017 (NSW)',
    note: 'Change in hospital admission counting criteria in NSW (2017), shifting recorded counts downward.'
  }
];

export const ROAD_USERS = [
  'Pedal cyclist',
  'Car occupant',
  'Motorcyclist',
  'Pedestrian'
];

export const AGE_GROUPS = [
  '0-7',
  '8-16',
  '17-25',
  '26-39',
  '40-64',
  '65-74',
  '75+'
];

export const OLDER_AGE_GROUPS = new Set(['40-64', '65-74', '75+']);

export const COUNTERPARTY_KEYS = {
  nonCollision: 'Non-collision transport accident',
  unspecified: 'Other and unspecified transport accidents',
  carCollision: 'Car, pick-up truck or van'
};

// Canonical Australian states/territories with equal-area tile-grid coordinates for Act 4.
export const STATES = [
  { code: 'WA',  name: 'Western Australia',            gridCol: 0, gridRow: 1 },
  { code: 'NT',  name: 'Northern Territory',           gridCol: 1, gridRow: 0 },
  { code: 'SA',  name: 'South Australia',              gridCol: 1, gridRow: 1 },
  { code: 'Qld', name: 'Queensland',                   gridCol: 2, gridRow: 0 },
  { code: 'NSW', name: 'New South Wales',              gridCol: 2, gridRow: 1 },
  { code: 'Vic', name: 'Victoria',                     gridCol: 2, gridRow: 2 },
  { code: 'ACT', name: 'Australian Capital Territory', gridCol: 3, gridRow: 2 },
  { code: 'Tas', name: 'Tasmania',                     gridCol: 2, gridRow: 3 }
];

export const STATE_BY_CODE = new Map(STATES.map(s => [s.code, s]));
export const AGE_ORDER = new Map(AGE_GROUPS.map((g, i) => [g, i]));
export const ROAD_USER_ORDER = new Map(ROAD_USERS.map((u, i) => [u, i]));

// Shared visual layout defaults (responsive viewBox dimensions and margins).
export const CHART_LAYOUT = {
  width: 840,
  height: 420,
  margin: { top: 40, right: 120, bottom: 54, left: 72 },
  tileGrid: { cols: 4, rows: 4, tileWidth: 180, tileHeight: 130, gap: 12 },
  tooltip: { offsetX: 12, offsetY: -12 },
  transitionMs: 450
};

export const INNER_WIDTH = CHART_LAYOUT.width - CHART_LAYOUT.margin.left - CHART_LAYOUT.margin.right;
export const INNER_HEIGHT = CHART_LAYOUT.height - CHART_LAYOUT.margin.top - CHART_LAYOUT.margin.bottom;

// Cohesive semantic palette aligned with the 4-Act narrative.
export const COLORS = {
  navy: '#0f2447',
  text: '#2b3a52',
  muted: '#4f5f78',
  grid: '#e1e7ef',
  axis: '#6b7a90',
  surface: '#ffffff',
  pageBg: '#eef2f7',
  // Narrative roles
  cyclist: '#d95f02',        // Focal highlight: Pedal cyclist / non-collision / 40+ surge
  carOccupant: '#1f6fb4',    // Comparison mode & car/van collisions
  motorcyclist: '#5c7c99',   // Comparison mode
  pedestrian: '#8a99ad',     // Comparison mode
  unspecifiedBase: '#cfd8e3',// Act 2 hatched bar base (Other & unspecified)
  unspecifiedStripe: '#7b8ba1',
  breakAmber: '#9a5b00',     // 2012 (Vic) & 2017 (NSW) series-break markers
  pandemicBand: '#fff4e6',   // 2020 lockdown callout shading
  bedDays: '#0f2447'         // Act 3 average net bed days clinical overlay
};

export const ROAD_USER_COLORS = {
  'Pedal cyclist': COLORS.cyclist,
  'Car occupant': COLORS.carOccupant,
  'Motorcyclist': COLORS.motorcyclist,
  'Pedestrian': COLORS.pedestrian
};

// Formatters use D3 in the browser and fall back gracefully in Node checks.
export const fmtInt = value => {
  if (value == null || !Number.isFinite(value)) return '—';
  return globalThis.d3?.format ? globalThis.d3.format(',.0f')(value) : Math.round(value).toLocaleString('en-AU');
};

export const fmtDec = (value, decimals = 2) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return globalThis.d3?.format ? globalThis.d3.format(`,.${decimals}f`)(value) : Number(value).toFixed(decimals);
};

export const fmtSignedPct = (ratio, decimals = 1) => {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return globalThis.d3?.format ? globalThis.d3.format(`+.${decimals}%`)(ratio) : `${ratio >= 0 ? '+' : ''}${(ratio * 100).toFixed(decimals)}%`;
};
