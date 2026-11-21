// CSV loading, parsing, chart configuration and source-data validation.
export const CSV_URL = '../data/exports/national/national_annual_totals.csv';
export const fmtInt = d3.format(',');

export const MEASURES = {
  hospitalisations: {
    id: 'hospitalisations', column: 'hospitalisations',
    toggleLabel: 'Hospitalizations', legendLabel: 'Hospitalised injuries',
    title: 'National Road-Crash Hospitalizations',
    subtitleLead: 'Annual recorded hospitalizations across Australia',
    metricName: 'Hospitalizations', unit: '', yLabel: 'Hospitalizations (count)'
  },
  net_bed_days: {
    id: 'net_bed_days', column: 'net_bed_days',
    toggleLabel: 'Net bed days', legendLabel: 'Net bed days',
    title: 'National Road-Crash Net Bed Days',
    subtitleLead: 'Annual accumulated net bed days across Australia',
    metricName: 'Net bed days', unit: ' days', yLabel: 'Net bed days (days)'
  }
};

export const BREAKS = [{ year: 2012 }, { year: 2017 }];

const NUM_COLS = ['hospitalisations', 'bed_days', 'died_bed_days', 'net_bed_days', 'avg_bed_days'];
const REQUIRED = ['year', ...NUM_COLS];

export async function loadData(url = CSV_URL) {
  const raw = await d3.csv(url);
  return parseRows(raw, raw.columns);
}

// Blank cells become null (never zero). Throws on missing columns or bad values.
export function parseRows(raw, columns) {
  const absent = REQUIRED.filter(c => !columns.includes(c));
  if (absent.length) throw new Error(`CSV is missing column(s): ${absent.join(', ')}`);
  return raw.map(r => {
    const row = { year: Number(r.year) };
    if (!Number.isInteger(row.year)) throw new Error(`Invalid year "${r.year}"`);
    for (const c of NUM_COLS) {
      const s = (r[c] ?? '').trim();
      row[c] = s === '' ? null : Number(s);
      if (row[c] !== null && !Number.isFinite(row[c])) throw new Error(`Non-numeric ${c} for ${row.year}: "${s}"`);
    }
    return row;
  }).sort((a, b) => a.year - b.year);
}

const EXPECTED_HOSP = {
  2011: 34033, 2012: 34024, 2013: 35001, 2014: 35515, 2015: 37082,
  2016: 38963, 2017: 39339, 2018: 39590, 2019: 39866, 2020: 37966, 2021: 39505
};
const EXPECTED_HOSP_TOTAL = 410884;
const PLAN_NET_TOTAL = 2007387;

// Validation is separate from chart drawing; reference values never feed the plot.
export function validate(rows) {
  const checks = [];
  const add = (label, pass, detail, level = 'warn') => checks.push({ label, pass, detail, level });
  const last = rows.at(-1);
  const net = rows.filter(r => r.net_bed_days != null);
  const hospTotal = d3.sum(rows, r => r.hospitalisations);
  const netTotal = d3.sum(net, r => r.net_bed_days);

  add('Years run 2011–2021 with no gaps', rows.length === 11 && rows.every((r, i) => r.year === 2011 + i), `${rows.length} rows`, 'error');
  add('Hospitalizations present for every year', rows.every(r => r.hospitalisations != null), '', 'error');
  add('Hospitalization values match expected observations', rows.every(r => EXPECTED_HOSP[r.year] === r.hospitalisations), '');
  add(`Hospitalization total = ${fmtInt(EXPECTED_HOSP_TOTAL)}`, hospTotal === EXPECTED_HOSP_TOTAL, `CSV total ${fmtInt(hospTotal)}`);
  add('Ten net-bed-day observations, 2011–2020', net.length === 10 && net[0].year === 2011 && net.at(-1).year === 2020, `${net.length} observations`);
  add('2021 net bed days not reported (not imputed)', last.net_bed_days === null, `2021 gross bed days ${fmtInt(last.bed_days)} are NOT used`);
  add('Net = gross − died where reported', net.every(r => r.died_bed_days != null && r.bed_days - r.died_bed_days === r.net_bed_days), '');

  const diff = PLAN_NET_TOTAL - netTotal;
  const discrepancy = {
    planTotal: PLAN_NET_TOTAL, csvTotal: netTotal, difference: diff, gross2021: last.bed_days,
    explainedByGross2021: diff === last.bed_days
  };
  add('Net-bed-day total vs project plan (2,007,387)', netTotal === PLAN_NET_TOTAL,
    `CSV 2011–2020 total ${fmtInt(netTotal)}; plan ${fmtInt(PLAN_NET_TOTAL)}; difference ${fmtInt(diff)}` +
    (discrepancy.explainedByGross2021 ? ' = 2021 gross bed days (not a validated net value). Team to verify against source data / KNIME workflow.' : ''), 'note');

  return { checks, discrepancy, blocking: checks.some(c => !c.pass && c.level === 'error') };
}
