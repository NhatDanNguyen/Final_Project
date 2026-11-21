// Chart rendering, controls and page startup. Styling lives in css/v1.css.
import { BREAKS, CSV_URL, fmtInt, loadData, MEASURES, validate } from './read-data.js';

export function createChart(host) {
  const svg = d3.select(host).append('svg').attr('class', 'v1-svg').attr('role', 'group');
  const tip = d3.select(host).append('div').attr('class', 'v1-tip').attr('aria-hidden', 'true');
  let last = null;

  function render(s, transition = false) {
    last = s;
    const { rows, measure: key, meta, range } = s;
    const priorPaths = new Map(svg.selectAll('.series').nodes().map(node => [node.getAttribute('class'), node.getAttribute('d')]));
    const priorDots = new Map(svg.selectAll('.dot').nodes().map(node => [node.__data__.year, {
      cx: node.getAttribute('cx'), cy: node.getAttribute('cy'), opacity: node.getAttribute('opacity')
    }]));
    const priorYears = new Map(svg.selectAll('.year-tick').nodes().map(node => [+node.textContent, {
      x: node.getAttribute('x'), opacity: node.getAttribute('opacity')
    }]));
    const W = Math.max(280, Math.round(host.clientWidth)), compact = W < 520;
    const shortViewport = window.innerHeight <= 700;
    const H = Math.max(shortViewport ? 180 : 220, Math.round(host.clientHeight || window.innerHeight * 0.4));
    const m = { top: shortViewport ? 32 : compact ? 38 : 44, right: compact ? 12 : 24, bottom: shortViewport ? 32 : 38, left: compact ? 54 : 68 };
    const plotB = H - m.bottom, plotH = plotB - m.top;
    const vis = rows.filter(r => r.year >= range[0] && r.year <= range[1]);

    // Zero-based scale, fixed per measure (independent of the selected range, so zooming never exaggerates changes).
    const yMax = d3.scaleLinear().domain([0, d3.max(rows, r => r[key]) * 1.1]).nice(5).domain()[1];
    const x = d3.scalePoint(vis.map(d => d.year), [m.left, W - m.right]).padding(0.5);
    const y = d3.scaleLinear([0, yMax], [plotB, m.top]);
    const step = x.step();

    svg.selectAll('*').remove();
    svg.attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('aria-label', `${meta.title}, ${vis[0].year} to ${vis.at(-1).year}. Line chart with a zero-based vertical axis. Tab through the years for exact values.`);

    svg.append('defs').append('pattern').attr('id', 'v1-hatch').attr('width', 6).attr('height', 6)
      .attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
      .append('line').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 6).attr('class', 'hatch-line');

    // Axes
    const ticks = y.ticks(5);
    const grid = svg.append('g').attr('class', 'grid');
    grid.selectAll('line').data(ticks.filter(t => t > 0)).join('line')
      .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y);
    svg.append('line').attr('class', 'baseline').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(0)).attr('y2', y(0));
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'tick')
      .attr('x', m.left - 10).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmtInt);
    svg.append('text').attr('class', 'axis-title').attr('x', 4).attr('y', 14).text(meta.yLabel);
    const showAll = step >= 38, y0 = vis[0].year;
    const yearLabels = svg.append('g').selectAll('text').data(vis.filter(d => showAll || (d.year - y0) % 2 === 0)).join('text')
      .attr('class', 'tick year-tick')
      .attr('x', d => transition && priorYears.has(d.year) ? priorYears.get(d.year).x : x(d.year))
      .attr('opacity', d => transition && !priorYears.has(d.year) ? 0 : 1)
      .attr('y', plotB + 20).attr('text-anchor', 'middle').text(d => d.year);
    if (transition) {
      const duration = transition === 'measure' ? 700 : 430;
      yearLabels.transition().duration(duration).ease(d3.easeCubicInOut)
        .attr('x', d => x(d.year)).attr('opacity', 1);
    }
    // Missing observations: hatched band + label, never a zero.
    const bw = Math.min(step * 0.8, 64);
    const miss = svg.append('g').selectAll('g').data(vis.filter(d => d[key] == null)).join('g');
    miss.append('rect').attr('class', 'missing-band').attr('x', d => x(d.year) - bw / 2).attr('y', m.top).attr('width', bw).attr('height', plotH);
    miss.append('text').attr('class', 'missing-label').attr('text-anchor', 'middle')
      .attr('transform', d => `translate(${x(d.year) + 5},${m.top + plotH / 2}) rotate(-90)`).text('Not reported');

    // Match the reference: the pre-change year stands alone, then line styles
    // identify the Victoria and NSW counting-practice periods.
    const [victoriaBreak, nswBreak] = BREAKS;
    const baseline = vis.filter(d => d.year < victoriaBreak.year && d[key] != null);
    const victoria = vis.filter(d => d.year >= victoriaBreak.year && d.year < nswBreak.year && d[key] != null);
    const nsw = vis.filter(d => d.year >= nswBreak.year && d[key] != null);
    const line = d3.line().defined(d => d[key] != null).x(d => x(d.year)).y(d => y(d[key])).curve(d3.curveLinear);
    const paths = svg.append('g').selectAll('path').data([
      { values: victoria, className: 'series series-victoria' },
      { values: nsw, className: 'series series-nsw' }
    ]).join('path').attr('class', d => d.className).attr('d', d => line(d.values));
    if (transition) {
      const duration = transition === 'measure' ? 700 : 430;
      paths.each(function(d) {
        const path = d3.select(this), previous = priorPaths.get(d.className), target = line(d.values);
        if (previous && target) {
          path.attr('d', previous).transition().duration(duration).ease(d3.easeCubicInOut).attr('d', target);
        } else if (previous && !target) {
          path.attr('d', previous).transition().duration(duration).ease(d3.easeCubicInOut)
            .attr('opacity', 0).on('end', () => path.attr('d', null).attr('opacity', 1));
        } else if (!previous && target) {
          path.attr('opacity', 0).transition().duration(duration).ease(d3.easeCubicInOut).attr('opacity', 1);
        }
      });
    }
    const dots = svg.append('g').selectAll('circle').data(vis.filter(d => d[key] != null)).join('circle')
      .attr('class', 'dot').attr('cx', d => x(d.year)).attr('cy', d => y(d[key])).attr('r', 4.5)
      .attr('opacity', d => d.year < victoriaBreak.year ? 1 : 0);
    if (transition) {
      const duration = transition === 'measure' ? 700 : 430;
      dots.each(function(d) {
        const dot = d3.select(this), previous = priorDots.get(d.year);
        if (previous) dot.attr('cx', previous.cx).attr('cy', previous.cy).attr('opacity', previous.opacity);
        else dot.attr('opacity', 0);
        dot.transition().duration(duration).ease(d3.easeCubicInOut)
          .attr('cx', x(d.year)).attr('cy', y(d[key]))
          .attr('opacity', d.year < victoriaBreak.year ? 1 : 0);
      });
    }

    // Exact-value interaction: one focusable hit area per year (mouse + keyboard)
    const guide = svg.append('line').attr('class', 'guide').attr('y1', m.top).attr('y2', plotB).style('display', 'none');
    const hide = () => {
      tip.classed('is-on', false); guide.style('display', 'none');
      dots.attr('r', 4.5).attr('opacity', p => p.year < victoriaBreak.year ? 1 : 0);
    };
    const show = d => {
      const v = d[key], px = x(d.year), py = v != null ? y(v) : m.top + plotH / 2;
      tip.html(`<strong>Year: ${d.year}</strong><span>${meta.metricName}: ${v == null ? 'Not reported.' : fmtInt(v) + meta.unit}</span>`).classed('is-on', true);
      const tw = tip.node().offsetWidth, th = tip.node().offsetHeight;
      let top = py + 14; if (top + th > plotB) top = py - th - 14; if (top < 0) top = 4;
      tip.style('left', Math.min(Math.max(px - tw / 2, 4), W - tw - 4) + 'px').style('top', top + 'px');
      guide.attr('x1', px).attr('x2', px).style('display', null);
      dots.attr('r', p => p.year === d.year ? 6.5 : 4.5)
        .attr('opacity', p => p.year === d.year || p.year < victoriaBreak.year ? 1 : 0);
    };
    svg.append('g').selectAll('rect').data(vis).join('rect').attr('class', 'hit').attr('tabindex', 0).attr('role', 'img')
      .attr('x', d => x(d.year) - step / 2).attr('y', m.top).attr('width', step).attr('height', plotH)
      .attr('aria-label', d => `${d.year}: ${meta.metricName} ${d[key] == null ? 'not reported' : fmtInt(d[key]) + meta.unit}`)
      .on('mouseenter focus', (e, d) => show(d)).on('mouseleave blur', hide)
      .on('keydown', e => { if (e.key === 'Escape') hide(); });

    if (transition === 'measure') {
      svg.node().animate([
        { opacity: 0.45, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 620, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  }

  new ResizeObserver(() => last && render(last)).observe(host);
  window.addEventListener('resize', () => last && render(last));
  return { render };
}

function initToggle(el, measures, initialId, onSelect) {
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', 'Choose measure');
  const buttons = measures.map(measure => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seg-btn';
    button.setAttribute('role', 'radio');
    button.dataset.id = measure.id;
    button.textContent = measure.toggleLabel;
    el.append(button);
    return button;
  });
  const set = (id, { focus = false, notify = true } = {}) => {
    buttons.forEach(button => {
      const active = button.dataset.id === id;
      button.setAttribute('aria-checked', String(active));
      button.tabIndex = active ? 0 : -1;
      button.classList.toggle('is-active', active);
      if (active && focus) button.focus();
    });
    if (notify) onSelect(id);
  };
  el.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button) set(button.dataset.id);
  });
  el.addEventListener('keydown', event => {
    const current = buttons.findIndex(button => button.getAttribute('aria-checked') === 'true');
    const count = buttons.length;
    const next = {
      ArrowRight: (current + 1) % count, ArrowDown: (current + 1) % count,
      ArrowLeft: (current + count - 1) % count, ArrowUp: (current + count - 1) % count,
      Home: 0, End: count - 1
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      set(buttons[next].dataset.id, { focus: true });
    }
  });
  set(initialId, { notify: false });
}

function initRange({ startInput, endInput, startValue, endValue, track, resetBtn, status }, years, onChange) {
  const min = years[0], max = years.at(-1);
  for (const input of [startInput, endInput]) {
    input.min = min;
    input.max = max;
    input.step = 1;
  }
  const sync = (start, end, notify = true, activeInput = null) => {
    start = Math.max(min, Math.min(start, end - 1));
    end = Math.min(max, Math.max(end, start + 1));
    startInput.value = start;
    endInput.value = end;
    startValue.value = startValue.textContent = start;
    endValue.value = endValue.textContent = end;
    const span = max - min || 1;
    track.style.setProperty('--range-start', `${((start - min) / span) * 100}%`);
    track.style.setProperty('--range-end', `${((end - min) / span) * 100}%`);
    startInput.style.zIndex = activeInput === startInput ? 4 : 2;
    endInput.style.zIndex = activeInput === endInput ? 4 : 3;
    const full = start === min && end === max;
    resetBtn.disabled = full;
    status.textContent = full ? `Full period · ${start}–${end}` : `Showing ${start}–${end}`;
    status.classList.toggle('is-filtered', !full);
    if (notify) onChange([start, end]);
  };
  startInput.addEventListener('input', () => sync(+startInput.value, +endInput.value, true, startInput));
  endInput.addEventListener('input', () => sync(+startInput.value, +endInput.value, true, endInput));
  resetBtn.addEventListener('click', () => { sync(min, max); startInput.focus(); });
  sync(min, max, false);
}

function initInfo(button, panel, closeButton) {
  const close = (refocus = true) => {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  const open = () => {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    closeButton.focus();
  };
  button.addEventListener('click', () => panel.hidden ? open() : close());
  closeButton.addEventListener('click', () => close());
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  button.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('click', event => {
    if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(false);
  });
}

const $ = id => document.getElementById(id);
const state = { measure: 'hospitalisations', range: null };
let rows, chart;

function draw(transition = false) {
  const measure = MEASURES[state.measure], range = state.range;
  const visible = rows.filter(row => row.year >= range[0] && row.year <= range[1]);
  const observations = visible.filter(row => row[measure.column] != null);
  const firstYear = observations[0]?.year ?? range[0];
  const lastYear = observations.at(-1)?.year ?? range[1];
  $('v1-title').textContent = measure.title;
  $('v1-subtitle').textContent = `${measure.subtitleLead}, ${firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}.`;
  $('v1-key-measure').textContent = measure.legendLabel;
  chart.render({ rows, measure: measure.column, meta: measure, range }, transition);
}

async function init() {
  const host = $('v1-chart');
  try {
    rows = await loadData(CSV_URL);
    const report = validate(rows);
    console.table(report.checks.map(({ label, pass, detail, level }) => ({ label, pass, level, detail })));
    if (report.blocking) {
      throw new Error('Data validation failed: ' + report.checks.filter(check => !check.pass && check.level === 'error').map(check => check.label).join('; '));
    }
  } catch (error) {
    console.error(error);
    host.setAttribute('aria-busy', 'false');
    host.innerHTML = '<p class="v1-error" role="alert">Sorry, the chart data could not be loaded. Please try again later.</p>';
    return;
  }

  host.replaceChildren();
  host.setAttribute('aria-busy', 'false');
  chart = createChart(host);
  const years = rows.map(row => row.year);
  state.range = [years[0], years.at(-1)];
  initToggle($('v1-toggle'), Object.values(MEASURES), state.measure, id => {
    state.measure = id;
    draw('measure');
  });
  initRange({
    startInput: $('v1-start'), endInput: $('v1-end'),
    startValue: $('v1-start-value'), endValue: $('v1-end-value'),
    track: $('v1-range-slider'), resetBtn: $('v1-reset'), status: $('v1-range-status')
  }, years, range => {
    state.range = range;
    draw('range');
  });
  initInfo($('v1-info-btn'), $('v1-info'), $('v1-info-close'));
  draw();
}

init();
