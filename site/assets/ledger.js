'use strict';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function matchesText(value, query) {
  return String(query).toLowerCase().split('|').some(option => option.trim().split(/\s+/).every(term => String(value ?? '').toLowerCase().includes(term)));
}
function displayedValue(value, column) {
  return typeof value === 'number' ? Number(value.toFixed(column.decimals ?? 2)) : value;
}
function matchesCondition(raw, condition, column) {
  const value = displayedValue(raw, column), missing = value == null || value === '';
  if (condition.operator === 'missing') return missing;
  if (condition.operator === 'present') return !missing;
  if (missing) return false;
  const expected = column.kind === 'number' ? Number(condition.value) : condition.value;
  switch (condition.operator) {
    case 'contains': return matchesText(value, condition.value);
    case 'eq': return column.kind === 'number' ? value === expected : String(value).toLowerCase() === String(expected).toLowerCase();
    case 'gte': return value >= expected;
    case 'lte': return value <= expected;
    case 'between': {
      const [low, high] = condition.value.split('..').map(Number);
      return typeof value === 'number' && value >= low && value <= high;
    }
    default: return false;
  }
}
function matchesHeader(raw, query, column) {
  if (!query.trim()) return true;
  const word = query.trim().toLowerCase();
  if (word === 'blank') return raw == null || raw === '';
  if (word === 'recorded') return raw != null && raw !== '';
  if (column.kind !== 'number') return matchesText(raw, query);
  const range = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (range) return matchesCondition(raw, { operator: 'between', value: `${range[1]}..${range[2]}` }, column);
  const bound = query.match(/^\s*(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/);
  if (!bound || raw == null) return false;
  const value = displayedValue(raw, column), target = Number(bound[2]);
  switch (bound[1]) {
    case '>=': return value >= target;
    case '<=': return value <= target;
    case '>': return value > target;
    case '<': return value < target;
    default: return value === target;
  }
}
function modelName(value) {
  if (value.startsWith('No LLM')) return value;
  return value.split('/').at(-1).replace(/^qwen/i, 'Qwen').replace(/^gpt-oss:/i, 'GPT-OSS ');
}
function runName(value, suite) {
  let label = value.replace(/^bifrost-(?:qwen|gpt120)-(?:akm-[\d.]+-)?/, '').replace(/^akm-[\d.]+-/, '');
  for (const prefix of [`bifrost-${suite}-example-`, `${suite}-example-`]) if (label.startsWith(prefix)) label = label.slice(prefix.length);
  return label.replace(/-r(\d+)$/, ' · r$1');
}
function comparisonRow(row) {
  const basis = row.case_p50_s != null ? ['case', 'AKM command']
    : row.keyword_p50_s != null ? ['keyword', 'Keyword query']
    : row.akm_p50_s != null ? ['akm', 'With AKM agent / answer'] : null;
  const control = row.scores.find(score => score.label.endsWith('without AKM'));
  const withAKM = row.scores.find(score => score.label.endsWith('with AKM'));
  const paired = row.paired_cases > 0 && control?.value != null && withAKM?.value != null;
  return { ...row, model_route: row.model, control_quality_percent: control?.value == null ? null : control.value * 100,
    akm_quality_percent: withAKM?.value == null ? null : withAKM.value * 100,
    akm_gain_ci: row.akm_delta_lo_pp == null || row.akm_delta_hi_pp == null ? null : `${row.akm_delta_lo_pp.toFixed(2)} to ${row.akm_delta_hi_pp.toFixed(2)}`,
    median_time_change_percent: paired && row.control_p50_s > 0 && row.akm_p50_s != null ? (row.akm_p50_s / row.control_p50_s - 1) * 100 : null,
    latency_timed: basis ? row[basis[0] === 'case' ? 'timed_cases' : basis[0] + '_timed'] : null,
    latency_p50_s: basis ? row[basis[0] + '_p50_s'] : null,
    latency_p95_s: basis ? row[basis[0] + '_p95_s'] : null, latency_basis: basis?.[1] ?? null };
}
function formatCell(value, column) {
  if (value == null || value === '') return '<span class="unrecorded">—</span>';
  if (column.kind === 'number') return escapeHTML(value.toLocaleString('en', {
    minimumFractionDigits: column.decimals ?? 0, maximumFractionDigits: column.decimals ?? 0,
  })) + (column.unit === '%' ? '<span class="unit">%</span>' : '');
  if (column.kind === 'date') return escapeHTML(value.replace('T', ' ').slice(0, 16));
  if (column.key === 'model') return escapeHTML(modelName(value));
  if (/sha256|fingerprint/.test(column.key)) return escapeHTML(value.slice(0, 12));
  return escapeHTML(value);
}

async function startLedger() {
  const $ = id => document.getElementById(id);
  const revision = document.documentElement.dataset.revision;
  const response = await fetch('./data.json' + (revision ? '?v=' + encodeURIComponent(revision) : ''), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Published results could not load.');
  const dataset = await response.json();
  const rows = dataset.runs.map(run => comparisonRow({ ...run, ...run.comparison }));
  const columns = [...dataset.columns, ...[
    { key: 'model_route', label: 'Model route', kind: 'text', group: 'Settings', description: 'Full recorded model identifier, including its serving route. The Model column uses a shortened display name.' },
    { key: 'latency_p50_s', label: 'Latency p50 (s)', kind: 'number', group: 'Performance', decimals: 2, description: 'Median elapsed time. Uses command, keyword-query or with-AKM agent/answer timing as identified in Latency basis. Compare runs with the same basis.' },
    { key: 'latency_p95_s', label: 'Latency p95 (s)', kind: 'number', group: 'Performance', decimals: 2, description: '95th percentile of the same timings as Latency p50. This is elapsed time including overhead, not token-generation speed.' },
    { key: 'latency_timed', label: 'Timings recorded', kind: 'number', group: 'Performance', decimals: 0, description: 'Number of recorded durations used for comparison latency. Includes failed cases where they have timing records.' },
    { key: 'control_quality_percent', label: 'Without AKM (%)', kind: 'number', group: 'Quality', decimals: 2, unit: '%', description: 'Recorded control-arm quality. Its scored cases may differ from the with-AKM arm; Paired gain uses only shared cases.' },
    { key: 'akm_quality_percent', label: 'With AKM (%)', kind: 'number', group: 'Quality', decimals: 2, unit: '%', description: 'Recorded with-AKM quality. Its scored cases may differ from the control arm; Paired gain uses only shared cases.' },
    { key: 'akm_gain_ci', label: 'Gain 95% CI (pp)', kind: 'text', group: 'Quality', description: 'Recorded confidence interval for paired quality gain in percentage points. Original lower and upper bounds are available separately.' },
    { key: 'median_time_change_percent', label: 'Median time change (%)', kind: 'number', group: 'Performance', decimals: 2, unit: '%', description: '(With-AKM median / without-AKM median − 1) × 100. Negative means faster; positive means slower. Based on recorded arm timings, which may include errors and different timing counts. Shown only for runs with scored paired quality.' },
    { key: 'latency_basis', label: 'Latency basis', kind: 'text', group: 'Performance', description: 'Which recorded timing supplies the comparison latency. Original timing fields remain available separately.' },
  ]];
  const columnByKey = new Map(columns.map(column => [column.key, column]));
  const facets = ['model', 'suite', 'role', 'collection', 'akm_version', 'measurement', 'search_method', 'strategy'];
  const state = { search: '', facets: {}, conditions: [], analysisView: 'compare', errorsOnly: false, dateFrom: '', dateTo: '' };
  let grid, ready = false, visibleKeys = new Set(), layoutSignature = '';
  const widths = { model: 164, suite: 118, label: 196, quality_percent: 100, quality_metric: 205,
    scored: 100, quality_cases: 102, errors: 82, latency_p50_s: 111, latency_p95_s: 111, calls: 98,
    input_tokens: 124, output_tokens: 124, cost_usd: 130, role: 112, collection: 135,
    akm_version: 162, date: 155, recorded: 110 };
  const titles = { model: 'Model', label: 'Run', scored: 'All scored cases', quality_cases: 'Score cases', errors: 'Errors', input_tokens: 'Input tokens', output_tokens: 'Output tokens', cost_usd: 'Cost (USD)', calls: 'Calls', date: 'Collected (UTC)', akm_delta_pp: 'Paired gain (pp)', control_p50_s: 'Without p50 (s)', akm_p50_s: 'With p50 (s)' };
  const compareKeys = ['model', 'suite', 'label', 'quality_percent', 'quality_metric', 'quality_cases', 'errors', 'latency_p50_s', 'latency_p95_s', 'calls', 'input_tokens', 'output_tokens', 'cost_usd', 'role', 'collection', 'measurement', 'scoring_version', 'mode', 'akm_version', 'date'];

  for (const key of facets) {
    const values = [...new Set(rows.map(row => key === 'model' ? modelName(row.model) : row[key]))].filter(Boolean).sort();
    for (const value of values) $(key).add(new Option(value, value));
  }
  const grouped = new Map();
  for (const column of columns) {
    if (!grouped.has(column.group)) grouped.set(column.group, []);
    grouped.get(column.group).push(column);
  }
  for (const [group, items] of grouped) {
    const optgroup = document.createElement('optgroup'); optgroup.label = group;
    for (const column of items) optgroup.append(new Option(column.label, column.key));
    $('filter-column').append(optgroup);
  }
  $('snapshot').textContent = `${rows.length} published runs · ${new Set(rows.map(row => row.suite)).size} tests`;
  $('provenance').innerHTML = `<a href="https://github.com/itlackey/akm-eval/tree/${encodeURIComponent(dataset.source_revision)}/reports">Published reports · ${escapeHTML(dataset.source_revision.slice(0, 8))}</a> · ` +
    '<a href="https://github.com/fwdslsh/website">fwdslsh theme</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>) · <a href="./assets/vendor/tabulator.LICENSE">Tabulator MIT license</a>.';

  function filtered(row) {
    if (state.analysisView === 'impact' && !(row.paired_cases > 0 && row.control_quality_percent != null && row.akm_quality_percent != null)) return false;
    if (state.search && !matchesText([row.model, modelName(row.model), ...columns.map(column => row[column.key])].join(' '), state.search)) return false;
    if (state.errorsOnly && !(row.errors > 0)) return false;
    if (state.dateFrom && (!row.date || row.date.slice(0, 10) < state.dateFrom)) return false;
    if (state.dateTo && (!row.date || row.date.slice(0, 10) > state.dateTo)) return false;
    for (const [key, value] of Object.entries(state.facets)) {
      if (value && (key === 'model' ? modelName(row.model) : row[key]) !== value) return false;
    }
    return state.conditions.every(condition => matchesCondition(row[condition.key], condition, columnByKey.get(condition.key)));
  }
  function updateCount() {
    if (!ready) return;
    $('count').textContent = `${grid.getData('active').length} of ${rows.length} runs`;
    updateContext();
    const sorts = grid.getSorters();
    $('sort-status').textContent = sorts.length ? 'Sort: ' + sorts.map(sort => `${titles[sort.field] ?? columnByKey.get(sort.field)?.label ?? sort.field} ${sort.dir === 'asc' ? '↑' : '↓'}`).join(' · ') : '';
  }
  function updateContext() {
    const active = grid.getData('active'), view = state.analysisView, test = state.facets.suite;
    const models = [...new Set(active.filter(row => !row.model.startsWith('No LLM')).map(row => modelName(row.model)))];
    const collections = new Set(active.map(row => row.collection));
    let text;
    if (view === 'impact') {
      text = active.length ? `${active.length} paired runs. Positive quality gain means better; negative time change means faster.` : 'No scored with/without-AKM comparison is published for these filters.';
      if (active.length && active.every(row => row.role !== 'Full suite')) text += ' These are pilots; sample sizes and uncertainty are shown.';
    } else if (view === 'quality') {
      if (!test) text = 'Choose a test to rank quality. Different tests use different metrics.';
      else if (collections.size > 1) text = 'Choose a collection to compare the same test inputs.';
      else if (models.length === 1) text = `Only ${models[0]} is published for this test. Scores compare its runs; there is no model winner to establish.`;
      else if (models.length === 0) text = 'Retrieval quality compares search configurations; these runs use no answer model.';
      else text = `${models.length} models in these runs. Sort Quality % descending to find the highest recorded score; compare scope, score cases and scoring version before choosing a model.`;
    } else if (view === 'performance') {
      text = 'Compare medians within the same test and timing basis. New runs include model request duration and output tokens per second when usage is available. Missing values stay blank; first-token timing is not recorded.';
      if (test && models.length === 1) text += ` Only ${models[0]} is published for this test.`;
    } else text = 'Choose a test, then use Quality ranking, Speed & usage or AKM impact. Each row is a published run; hover a run to see its full label.';
    $('view-context').textContent = text;
  }
  function renderChips() {
    if (!ready) return;
    const chips = [];
    const chip = (text, remove) => chips.push({ text, remove });
    if (state.search) chip(`Search: ${state.search}`, () => { $('search').value = ''; state.search = ''; });
    for (const [key, value] of Object.entries(state.facets)) if (value) chip(`${key === 'suite' ? 'Test' : columnByKey.get(key)?.label ?? key}: ${value}`, () => { $(key).value = ''; state.facets[key] = ''; });
    if (state.dateFrom) chip(`From: ${state.dateFrom}`, () => { $('dateFrom').value = ''; state.dateFrom = ''; });
    if (state.dateTo) chip(`Through: ${state.dateTo}`, () => { $('dateTo').value = ''; state.dateTo = ''; });
    if (state.errorsOnly) chip('With errors', () => { $('errorsOnly').checked = false; state.errorsOnly = false; });
    const names = { contains: 'contains', eq: '=', gte: '≥', lte: '≤', between: 'between', missing: 'unrecorded', present: 'recorded' };
    for (const condition of state.conditions) chip(`${columnByKey.get(condition.key).label} ${names[condition.operator]} ${['missing', 'present'].includes(condition.operator) ? '' : condition.value}`, () => { state.conditions = state.conditions.filter(item => item !== condition); });
    for (const filter of grid.getHeaderFilters()) chip(`${columnByKey.get(filter.field)?.label ?? filter.field}: ${filter.value}`, () => grid.setHeaderFilterValue(filter.field, ''));
    $('active-filters').replaceChildren();
    for (const item of chips) {
      const button = document.createElement('button'); button.className = 'filter-chip'; button.type = 'button';
      button.textContent = item.text + ' ×'; button.setAttribute('aria-label', 'Remove filter ' + item.text);
      button.onclick = () => { item.remove(); applyFilters(); };
      $('active-filters').append(button);
    }
    $('filter-badge').textContent = chips.length ? `(${chips.length})` : '';
  }
  function applyFilters() {
    grid.setFilter(filtered); renderChips();
    if (['quality', 'performance', 'settings', 'impact'].includes($('view').value)) applyView($('view').value);
    updateCount();
  }
  function viewKeys(view) {
    const context = rows.filter(filtered);
    const recorded = column => context.some(row => row[column.key] != null && row[column.key] !== '');
    if (view === 'all') return columns.map(column => column.key);
    if (view === 'compare') return compareKeys;
    if (view === 'impact') return ['model', 'suite', 'label', 'role', 'control_quality_percent', 'akm_quality_percent', 'akm_delta_pp', 'akm_gain_ci', 'paired_cases', 'control_p50_s', 'akm_p50_s', 'median_time_change_percent', 'control_timed', 'akm_timed', 'errors', 'collection', 'date'];
    if (view === 'performance') return ['model', 'suite', 'label', 'role', 'quality_percent', 'latency_p50_s', 'latency_p95_s', 'latency_basis', 'latency_timed', 'errors', 'calls', 'model_mean_input_tokens', 'model_mean_output_tokens', 'model_mean_request_s', 'model_output_tokens_per_s', 'input_tokens', 'output_tokens', 'cost_usd', 'usage_cases', 'run_wall_s', 'collection', 'date'];
    const base = ['model', 'suite', 'label', 'role', 'quality_percent', 'quality_metric', 'quality_cases', 'scored', 'errors'];
    let extras;
    if (view === 'quality') extras = columns.filter(column => (column.group === 'Quality' || (state.facets.suite && column.key.startsWith('score:'))) && recorded(column));
    else extras = columns.filter(column => ['Settings', 'Provenance'].includes(column.group) && recorded(column));
    return [...new Set([...base, ...extras.map(column => column.key), 'collection', 'role', 'date'])];
  }
  function applyView(view, force = false) {
    const keys = viewKeys(view);
    const signature = JSON.stringify([view, keys]);
    if (!force && signature === layoutSignature && keys.length === visibleKeys.size && keys.every(key => visibleKeys.has(key))) {
      updateCount(); return;
    }
    layoutSignature = signature;
    visibleKeys = new Set(keys);
    const sizing = view === 'impact' ? { model: 148, suite: 118, label: 138, role: 88,
      control_quality_percent: 105, akm_quality_percent: 105, akm_delta_pp: 110,
      akm_gain_ci: 145, paired_cases: 85, control_p50_s: 110, akm_p50_s: 110, median_time_change_percent: 125 } : widths;
    const filters = grid.getHeaderFilters(), sorting = grid.getSorters().map(sort => ({ column: sort.field, dir: sort.dir }));
    const ordered = [...keys, ...columns.map(column => column.key).filter(key => !visibleKeys.has(key))];
    grid.setColumnLayout([...ordered.map(field => ({ field, visible: visibleKeys.has(field),
      width: sizing[field] ?? widths[field] ?? (columnByKey.get(field).kind === 'number' ? Math.min(340, Math.max(130, columnByKey.get(field).label.length * 7 + 36)) : 190) })), { field: 'sources', visible: true, width: 140 }]);
    grid.setSort(sorting);
    for (const filter of filters) grid.setHeaderFilterValue(filter.field, filter.value);
    renderColumnChooser(); updateCount();
  }
  function renderColumnChooser() {
    const query = $('column-search').value;
    $('column-list').replaceChildren();
    for (const [group, items] of grouped) {
      const matching = items.filter(column => matchesText(column.label + ' ' + column.description, query));
      if (!matching.length) continue;
      const title = document.createElement('p'); title.className = 'column-group'; title.textContent = group; $('column-list').append(title);
      for (const column of matching) {
        const label = document.createElement('label'); label.className = 'check-label'; label.title = column.description;
        const input = document.createElement('input'); input.type = 'checkbox'; input.checked = visibleKeys.has(column.key); input.dataset.column = column.key;
        input.onchange = () => {
          if (input.checked) { visibleKeys.add(column.key); grid.showColumn(column.key); }
          else { visibleKeys.delete(column.key); grid.hideColumn(column.key); }
          $('view').value = 'custom'; updateCount();
        };
        label.append(input, document.createTextNode(column.label)); $('column-list').append(label);
      }
    }
    $('columns-toggle').textContent = `Columns (${visibleKeys.size})`;
  }
  function openChooser(open) {
    $('columns-panel').hidden = !open; $('columns-toggle').setAttribute('aria-expanded', String(open));
    if (open) { renderColumnChooser(); $('column-search').focus(); }
  }
  const frozen = window.matchMedia('(min-width: 900px)').matches;
  grid = new Tabulator('#grid', {
    data: rows, index: 'id', maxHeight: 'min(62vh, 620px)', layout: 'fitData', rowHeight: 38,
    movableColumns: true, columnHeaderSortMulti: true,
    pagination: true, paginationMode: 'local', paginationSize: 25, paginationSizeSelector: [10, 25, 50, 100, true], paginationCounter: 'rows',
    selectableRows: false,
    placeholder: 'No runs match these filters. Reset filters to show all runs.',
    initialSort: [{ column: 'date', dir: 'desc' }],
    columns: [...[...compareKeys.map(key => columnByKey.get(key)), ...columns.filter(column => !compareKeys.includes(column.key))].map(column => ({
      field: column.key, title: titles[column.key] ?? column.label, visible: compareKeys.includes(column.key),
      headerWordWrap: true,
      width: widths[column.key] ?? (column.kind === 'number' ? Math.max(130, column.label.length * 7 + 36) : 190), minWidth: 65,
      frozen: frozen && ['model', 'suite'].includes(column.key),
      hozAlign: column.kind === 'number' ? 'right' : 'left', headerHozAlign: column.kind === 'number' ? 'right' : 'left',
      sorter: column.key === 'model' ? (a, b) => modelName(a ?? '').localeCompare(modelName(b ?? ''), undefined, { numeric: true }) : column.kind === 'number' ? 'number' : 'string',
      sorterParams: { alignEmptyValues: 'bottom' },
      headerTooltip: column.description,
      tooltip: (_event, cell) => {
        const row = cell.getRow().getData(), value = cell.getValue();
        const tooltip = document.createElement('div');
        tooltip.textContent = (value == null ? 'Unrecorded' : String(value)) + (column.key === 'suite' ? '\n' + row.test_description : '') + (column.key.startsWith('latency_') && row.latency_basis ? '\n' + row.latency_basis : '') + '\n' + column.description;
        return tooltip;
      },
      formatter: cell => {
        const row = cell.getRow().getData(), value = cell.getValue();
        if (column.key === 'label') return `<a href="${escapeHTML(row.summary_url)}" target="_blank" rel="noopener">${escapeHTML(runName(value, row.suite))}</a>`;
        if (column.key === 'suite') return `<a href="${escapeHTML(row.test_url)}" target="_blank" rel="noopener" class="test-link">${escapeHTML(value)}</a>`;
        const content = formatCell(value, column);
        if (value != null && value !== 0 && ['akm_delta_pp', 'median_time_change_percent'].includes(column.key)) {
          const better = column.key === 'akm_delta_pp' ? value > 0 : value < 0;
          return `<span class="${better ? 'improved' : 'regressed'}">${content}</span>`;
        }
        return content;
      },
      cssClass: column.key === 'quality_percent' ? 'quality-cell' : '',
      headerFilter: (cell, _onRendered, success) => {
        const input = document.createElement('input'); input.type = 'search';
        input.value = cell.getValue() ?? '';
        input.setAttribute('aria-label', 'Filter ' + column.label);
        input.oninput = () => success(input.value);
        input.onmousedown = event => event.stopPropagation();
        return input;
      },
      headerFilterLiveFilter: false,
      headerFilterPlaceholder: column.kind === 'number' ? '≥ value / min..max' : 'Filter…',
      headerFilterFunc: (query, value) => matchesHeader(value, query.replace('≥', '>=').replace('≤', '<='), column),
    })), { field: 'sources', title: 'Reports', width: 140, headerSort: false,
      formatter: cell => {
        const row = cell.getRow().getData();
        return `<a href="${escapeHTML(row.summary_url)}" target="_blank" rel="noopener">Summary</a> <a href="${escapeHTML(row.samples_url)}" target="_blank" rel="noopener">Cases</a>`;
      }, tooltip: 'Original published summary and sample output for this run.' }],
  });
  grid.on('tableBuilt', () => {
    ready = true; visibleKeys = new Set(compareKeys); layoutSignature = JSON.stringify(['compare', compareKeys]); renderColumnChooser(); updateCount();
    for (const input of document.querySelectorAll('.tabulator-header-filter input')) {
      const field = input.closest('[tabulator-field]')?.getAttribute('tabulator-field');
      input.setAttribute('aria-label', 'Filter ' + (columnByKey.get(field)?.label ?? field));
    }
  });
  for (const event of ['dataFiltered', 'dataSorted', 'pageLoaded', 'renderComplete']) grid.on(event, updateCount);
  grid.on('dataFiltered', renderChips);

  for (const key of facets) $(key).onchange = () => { state.facets[key] = $(key).value; applyFilters(); };
  $('search').oninput = () => { state.search = $('search').value.trim(); applyFilters(); };
  for (const key of ['dateFrom', 'dateTo']) $(key).onchange = () => { state[key] = $(key).value; applyFilters(); };
  $('errorsOnly').onchange = () => { state.errorsOnly = $('errorsOnly').checked; applyFilters(); };
  $('advanced-toggle').onclick = () => { const open = $('advanced-panel').hidden; $('advanced-panel').hidden = !open; $('advanced-toggle').setAttribute('aria-expanded', String(open)); };
  $('view').onchange = () => {
    const view = $('view').value;
    if (view !== 'custom') {
      state.analysisView = view;
      applyFilters(); applyView(view);
      grid.setSort(view === 'quality' ? 'quality_percent' : view === 'performance' ? 'latency_p50_s' : view === 'impact' ? 'akm_delta_pp' : 'date', view === 'performance' ? 'asc' : 'desc');
    }
  };
  $('columns-toggle').onclick = () => openChooser($('columns-panel').hidden);
  $('columns-close').onclick = () => { openChooser(false); $('columns-toggle').focus(); };
  $('column-search').oninput = renderColumnChooser;
  $('reset-columns').onclick = () => { $('view').value = 'compare'; state.analysisView = 'compare'; applyFilters(); applyView('compare', true); };
  document.addEventListener('click', event => { if (!event.target.closest('.column-menu')) openChooser(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') openChooser(false); });
  $('header-filters').onchange = () => {
    $('grid').classList.toggle('hide-header-filters', !$('header-filters').checked); grid.redraw(true);
  };
  function changeOperator() {
    const column = columnByKey.get($('filter-column').value);
    for (const option of $('filter-operator').options) option.disabled = column.kind !== 'number' && ['gte', 'lte', 'between'].includes(option.value);
    if ($('filter-operator').selectedOptions[0]?.disabled) $('filter-operator').value = 'contains';
    $('filter-value').disabled = ['missing', 'present'].includes($('filter-operator').value);
    $('filter-value').placeholder = $('filter-operator').value === 'between' ? 'Minimum..maximum, e.g. 80..95' : 'Value';
    $('filter-value').setCustomValidity('');
  }
  $('filter-column').onchange = changeOperator; $('filter-operator').onchange = changeOperator;
  $('filter-value').oninput = () => $('filter-value').setCustomValidity('');
  $('add-filter').onsubmit = event => {
    event.preventDefault();
    const key = $('filter-column').value, operator = $('filter-operator').value, value = $('filter-value').value.trim(), column = columnByKey.get(key);
    let invalid = '';
    if (!['missing', 'present'].includes(operator)) {
      if (!value) invalid = 'Enter a filter value.';
      else if (operator === 'between') {
        const pair = value.split('..');
        if (pair.length !== 2 || pair.some(item => !item.trim() || !Number.isFinite(Number(item))) || Number(pair[0]) > Number(pair[1])) invalid = 'Enter a range such as 80..95, with the minimum first.';
      } else if (column.kind === 'number' && operator !== 'contains' && !Number.isFinite(Number(value))) invalid = 'Enter a number in the column’s displayed units.';
    }
    $('filter-value').setCustomValidity(invalid);
    if (invalid) { $('filter-value').reportValidity(); return; }
    state.conditions.push({ key, operator, value }); $('filter-value').value = ''; applyFilters();
  };
  changeOperator();
  $('reset').onclick = () => {
    for (const key of [...facets, 'search', 'dateFrom', 'dateTo']) $(key).value = '';
    $('errorsOnly').checked = false;
    Object.assign(state, { search: '', facets: {}, conditions: [], errorsOnly: false, dateFrom: '', dateTo: '' });
    grid.clearHeaderFilter();
    grid.setSort(state.analysisView === 'quality' ? 'quality_percent' : state.analysisView === 'performance' ? 'latency_p50_s' : state.analysisView === 'impact' ? 'akm_delta_pp' : 'date', state.analysisView === 'performance' ? 'asc' : 'desc');
    applyFilters();
  };

  function download(name, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('json').onclick = () => download('akm-eval-filtered.json', 'application/json', JSON.stringify({ source_revision: dataset.source_revision, columns, runs: grid.getData('active') }, null, 2));
  $('csv').onclick = () => {
    const quote = value => { let text = String(value ?? ''); if (typeof value === 'string' && /^[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const fields = [...columns.map(column => column.key), 'summary_url', 'samples_url'];
    download('akm-eval-filtered.csv', 'text/csv;charset=utf-8', [...columns.map(column => column.label), 'Summary URL', 'Samples URL'].map(quote).join(',') + '\r\n' + grid.getData('active').map(row => fields.map(key => quote(row[key])).join(',')).join('\r\n'));
  };
}
startLedger().catch(error => {
  console.error(error);
  document.getElementById('snapshot').textContent = 'Results could not load.';
  document.getElementById('grid').innerHTML = '<p class="empty"><a href="https://github.com/itlackey/akm-eval/blob/main/reports/README.md">Read published reports ↗</a></p>';
});
