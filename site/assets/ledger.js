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
function latestRuns(rows) {
  const latest = new Map();
  for (const row of rows) {
    const identity = [row.akm_version, row.suite, row.collection, row.mode, row.model, row.search_method, row.embedding_model, row.strategy];
    if (row.suite === 'memory-utility') identity.push(row.memory_akm_fingerprint, row.measurement, row.scoring_version,
      row.memory_input_digest, row.memory_labels_digest, row.memory_prompt_digest, row.memory_reader_digest,
      row.memory_embedding_digest, row.memory_context_budget, row.memory_search_limit,
      row.memory_case_source, row.memory_split, row.memory_haystack, row.memory_budgets, row.memory_judge_model, row.memory_sample_seed);
    const key = JSON.stringify(identity);
    const previous = latest.get(key);
    if (!previous || row.date > previous.date || (row.date === previous.date && row.id < previous.id)) latest.set(key, row);
  }
  return [...latest.values()];
}
function comparisonRow(row) {
  const basis = row.case_p50_s != null ? ['case', 'AKM command']
    : row.keyword_p50_s != null ? ['keyword', 'Keyword query']
    : row.akm_p50_s != null ? ['akm', 'With AKM agent / answer'] : null;
  const control = row.scores.find(score => score.label.endsWith('without AKM'));
  const withAKM = row.scores.find(score => score.label.endsWith('with AKM'));
  const paired = row.paired_cases > 0 && control?.value != null && withAKM?.value != null;
  return { ...row, case_coverage: `${row.scored ?? '—'} / ${row.total_cases ?? row.recorded ?? '—'}`, model_route: row.model, control_quality_percent: control?.value == null ? null : control.value * 100,
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
    { key: 'case_coverage', label: 'Cases scored / total', kind: 'text', group: 'Run', description: 'Scored cases / total suite cases when recorded, otherwise selected or saved cases. The quality metric may use only a subset; Metric cases shows that denominator.' },
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
  // Only offer three-arm views when such reports are published. Existing views keep their contract.
  const memoryViews = ['memory', 'memory-budgets', 'memory-performance', 'memory-diagnostics'];
  if (rows.some(row => row.suite === 'memory-utility')) {
    const group = document.createElement('optgroup'); group.label = 'Memory usefulness';
    for (const [key, label] of [['memory', 'Memory · quality & gains'], ['memory-budgets', 'Memory · by budget'], ['memory-performance', 'Memory · time & usage'], ['memory-diagnostics', 'Memory · errors & coverage']]) group.append(new Option(label, key));
    $('view').append(group);
  }
  const facets = ['model', 'suite', 'role', 'collection', 'measurement', 'search_method', 'strategy'];
  const state = { search: '', versions: [], latestOnly: false, facets: {}, conditions: [], analysisView: 'compare', errorsOnly: false, dateFrom: '', dateTo: '' };
  let latestIds = null, restoringURL = false;
  let grid, ready = false, visibleKeys = new Set(), layoutSignature = '';
  const widths = { model: 164, suite: 118, label: 196, quality_percent: 100, quality_metric: 205,
    scored: 100, case_coverage: 116, quality_cases: 102, errors: 82, latency_p50_s: 111, latency_p95_s: 111, calls: 98,
    input_tokens: 124, output_tokens: 124, cost_usd: 130, role: 112, collection: 135,
    akm_version: 162, date: 155, recorded: 110 };
  const titles = { model: 'Model', label: 'Run', scored: 'All scored cases', quality_cases: 'Metric cases', errors: 'Errors', input_tokens: 'Input tokens', output_tokens: 'Output tokens', cost_usd: 'Cost (USD)', calls: 'Calls', date: 'Collected (UTC)', akm_delta_pp: 'Paired gain (pp)', control_p50_s: 'Without p50 (s)', akm_p50_s: 'With p50 (s)' };
  const compareKeys = ['model', 'suite', 'akm_version', 'quality_percent', 'quality_metric', 'case_coverage', 'errors', 'latency_p50_s', 'latency_p95_s', 'calls', 'input_tokens', 'output_tokens', 'cost_usd', 'role', 'quality_cases', 'collection', 'measurement', 'scoring_version', 'mode', 'label', 'date'];

  for (const key of facets) {
    const values = [...new Set(rows.map(row => key === 'model' ? modelName(row.model) : row[key]))].filter(Boolean).sort();
    for (const value of values) $(key).add(new Option(value, value));
  }
  for (const version of [...new Set(rows.map(row => row.akm_version))].filter(Boolean).sort()) {
    const label = document.createElement('label'); label.className = 'check-label';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = version;
    input.onchange = () => {
      state.versions = [...$('version-options').querySelectorAll('input:checked')].map(input => input.value);
      applyFilters();
    };
    label.append(input, document.createTextNode(version)); $('version-options').append(label);
  }
  function renderVersions() {
    for (const input of $('version-options').querySelectorAll('input')) input.checked = state.versions.includes(input.value);
    $('version-summary').textContent = state.versions.length === 1 ? `AKM ${state.versions[0]}`
      : state.versions.length ? `AKM versions (${state.versions.length})` : 'All AKM versions';
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

  function syncURL() {
    if (!ready || restoringURL) return;
    const url = new URL(window.location.href), params = url.searchParams;
    for (const key of [...params.keys()]) if (facets.includes(key) || ['q', 'akm', 'latest', 'errors', 'from', 'to', 'view', 'filter', 'column', 'sort'].includes(key) || key.startsWith('header.')) params.delete(key);
    for (const key of facets) if (state.facets[key]) params.set(key, state.facets[key]);
    for (const version of state.versions) params.append('akm', version);
    for (const [key, value] of [['q', state.search], ['latest', state.latestOnly ? '1' : ''], ['errors', state.errorsOnly ? '1' : ''], ['from', state.dateFrom], ['to', state.dateTo], ['view', state.analysisView === 'compare' ? '' : state.analysisView]]) if (value) params.set(key, value);
    for (const { key, operator, value } of state.conditions) params.append('filter', JSON.stringify([key, operator, value]));
    for (const { field, value } of grid.getHeaderFilters()) params.set('header.' + field, value);
    const selected = selectedColumns();
    if ($('view').value === 'custom') for (const key of selected.length ? selected : ['']) params.append('column', key);
    const sorting = grid.getSorters().map(sort => sort.field + ':' + sort.dir);
    if (JSON.stringify(sorting) !== JSON.stringify(defaultSort().map(sort => sort.column + ':' + sort.dir))) for (const sort of sorting.length ? sorting : ['']) params.append('sort', sort);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }
  function restoreURL() {
    restoringURL = true;
    const params = new URLSearchParams(window.location.search);
    state.versions = [...new Set(params.getAll('akm').filter(Boolean))];
    state.conditions = [];
    for (const key of facets) {
      const value = params.get(key) ?? '';
      if (value && ![...$(key).options].some(option => option.value === value)) $(key).add(new Option(value, value));
      $(key).value = state.facets[key] = value;
    }
    for (const [key, param] of [['search', 'q'], ['dateFrom', 'from'], ['dateTo', 'to']]) {
      $(key).value = params.get(param) ?? ''; state[key] = $(key).value.trim();
    }
    for (const [key, id, param] of [['latestOnly', 'latest-only', 'latest'], ['errorsOnly', 'errorsOnly', 'errors']]) $(id).checked = state[key] = params.get(param) === '1';
    for (const value of params.getAll('filter')) {
      try {
        const [key, operator, input] = JSON.parse(value);
        if (columnByKey.has(key) && ['contains', 'eq', 'gte', 'lte', 'between', 'missing', 'present'].includes(operator) && typeof input === 'string') state.conditions.push({ key, operator, value: input });
      } catch { /* Ignore malformed URL conditions; keep the other filters usable. */ }
    }
    const view = params.get('view');
    state.analysisView = [...$('view').options].some(option => option.value === view && !option.disabled) ? view : 'compare';
    $('view').value = state.analysisView;
    grid.clearHeaderFilter();
    for (const [key, value] of params) if (key.startsWith('header.') && columnByKey.has(key.slice(7))) grid.setHeaderFilterValue(key.slice(7), value);
    $('header-filters').checked = grid.getHeaderFilters().length > 0;
    $('grid').classList.toggle('hide-header-filters', !$('header-filters').checked);
    applyFilters(); applyView(state.analysisView);
    const selected = [...new Set(params.getAll('column').filter(key => columnByKey.has(key)))];
    if (selected.length || params.get('column') === '') {
      applyView('custom', false, selected); $('view').value = 'custom';
    }
    const sorting = params.getAll('sort').map(value => {
      const separator = value.lastIndexOf(':');
      return { column: value.slice(0, separator), dir: value.slice(separator + 1) };
    }).filter(sort => columnByKey.has(sort.column) && ['asc', 'desc'].includes(sort.dir));
    grid.setSort(sorting.length || params.get('sort') === '' ? sorting : defaultSort());
    restoringURL = false; syncURL();
  }

  function matchesFilters(row) {
    if (memoryViews.includes(state.analysisView) && row.suite !== 'memory-utility') return false;
    if (state.analysisView === 'impact' && !(row.paired_cases > 0 && row.control_quality_percent != null && row.akm_quality_percent != null)) return false;
    if (state.search && !matchesText([row.model, modelName(row.model), ...columns.map(column => row[column.key])].join(' '), state.search)) return false;
    if (state.versions.length && !state.versions.includes(row.akm_version)) return false;
    if (state.errorsOnly && !(row.errors > 0)) return false;
    if (state.dateFrom && (!row.date || row.date.slice(0, 10) < state.dateFrom)) return false;
    if (state.dateTo && (!row.date || row.date.slice(0, 10) > state.dateTo)) return false;
    for (const [key, value] of Object.entries(state.facets)) {
      if (value && (key === 'model' ? modelName(row.model) : row[key]) !== value) return false;
    }
    return state.conditions.every(condition => matchesCondition(row[condition.key], condition, columnByKey.get(condition.key)));
  }
  function filtered(row) {
    return matchesFilters(row) && (!latestIds || latestIds.has(row.id));
  }
  function updateLatest() {
    if (!state.latestOnly) { latestIds = null; return; }
    const headers = grid.getHeaderFilters();
    const matching = rows.filter(matchesFilters).filter(row => headers.every(filter =>
      matchesHeader(row[filter.field], filter.value.replace('≥', '>=').replace('≤', '<='), columnByKey.get(filter.field))));
    latestIds = new Set(latestRuns(matching).map(row => row.id));
  }
  function updateCount() {
    if (!ready) return;
    $('count').textContent = `${grid.getData('active').length} of ${rows.length} runs`;
    updateContext(); queueMicrotask(renderTouchRuns);
    const sorts = grid.getSorters();
    $('sort-status').textContent = sorts.length ? 'Sort: ' + sorts.map(sort => `${titles[sort.field] ?? columnByKey.get(sort.field)?.label ?? sort.field} ${sort.dir === 'asc' ? '↑' : '↓'}`).join(' · ') : '';
  }
  function updateContext() {
    const active = grid.getData('active'), view = state.analysisView, test = state.facets.suite;
    const models = [...new Set(active.filter(row => !row.model.startsWith('No LLM')).map(row => modelName(row.model)))];
    const collections = new Set(active.map(row => row.collection));
    let text;
    if (memoryViews.includes(view)) {
      text = view === 'memory' ? 'Notes − none measures persistent-memory gain; Inferred − notes measures native-inference gain. Gains use all selected cases (errors/unrun = zero). Compare complete pairs and conservative 95% bounds; no winner is inferred.'
        : view === 'memory-budgets' ? 'LongMemEval cases read at each memory budget (estimated tokens). The primary comparison is Inferred − notes at 1024; the other budgets are secondary. p-values are exact McNemar; intervals are exact on the discordant pairs. — means the run did not record that budget.'
        : view === 'memory-performance' ? 'Phase times include observed failed work. Reader token/cost totals exclude inference and embeddings; compare reporting counts and equal case counts. — means unknown, not zero.'
        : 'Factual accuracy, format compliance and citation checks are separate. Safety flags cover labeled cases only. Exact quotes do not prove entailment; literal anchors can miss valid paraphrases.';
      if (!active.length) text = 'No memory-usefulness results match these filters. ' + text;
      else if (active.every(row => row.role !== 'Full suite')) text += ' These are pilot/diagnostic runs, not full-suite evidence.';
    } else if (view === 'impact') {
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
    if (test && state.versions.length && !active.length) {
      const available = [...new Set(rows.filter(row => row.suite === test && (!state.facets.role || row.role === state.facets.role)).map(row => row.akm_version))];
      if (available.length) text += ` Published ${test} results for this scope use AKM ${available.join(', ')}. Clear other filters or select one of those versions to see them.`;
    }
    $('view-context').textContent = text;
  }
  function renderChips() {
    if (!ready) return;
    const chips = [];
    const chip = (text, remove) => chips.push({ text, remove });
    if (state.search) chip(`Search: ${state.search}`, () => { $('search').value = ''; state.search = ''; });
    for (const [key, value] of Object.entries(state.facets)) if (value) chip(`${key === 'suite' ? 'Test' : columnByKey.get(key)?.label ?? key}: ${value}`, () => { $(key).value = ''; state.facets[key] = ''; });
    for (const version of state.versions) chip(`AKM version: ${version}`, () => { state.versions = state.versions.filter(value => value !== version); });
    if (state.dateFrom) chip(`From: ${state.dateFrom}`, () => { $('dateFrom').value = ''; state.dateFrom = ''; });
    if (state.dateTo) chip(`Through: ${state.dateTo}`, () => { $('dateTo').value = ''; state.dateTo = ''; });
    if (state.latestOnly) chip('Latest only', () => { $('latest-only').checked = false; state.latestOnly = false; });
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
    renderVersions(); grid.setFilter(filtered); renderChips();
    if (['quality', 'performance', 'settings', 'impact', ...memoryViews].includes($('view').value)) applyView($('view').value);
    updateCount();
  }
  function viewKeys(view) {
    const context = rows.filter(filtered);
    const recorded = column => context.some(row => row[column.key] != null && row[column.key] !== '');
    if (view === 'all') return columns.map(column => column.key === 'label' ? 'akm_version' : column.key === 'akm_version' ? 'label' : column.key);
    if (view === 'compare') return compareKeys;
    if (memoryViews.includes(view)) {
      const arms = ['none', 'source', 'inferred'];
      const pairs = ['persistent_memory', 'memory_inference'];
      const quality = [...arms.map(arm => `memory_${arm}_accuracy`), ...pairs.map(pair => `memory_${pair}_failure_inclusive_gain`), ...pairs.flatMap(pair =>
        ['ci_low', 'ci_high', 'complete_pairs', 'incomplete_pairs'].map(key => `memory_${pair}_failure_inclusive_${key}`))];
      const performance = ['memory_inference_mean_s', 'memory_inference_index_mean_s', ...arms.flatMap(arm =>
        ['index_s', 'retrieval_s', 'answer_s', 'prompt_tokens', 'completion_tokens', 'cost_usd', 'prompt_tokens_reported', 'prompt_tokens_attempted', 'cost_usd_reported'].map(key => `memory_${arm}_${key}`))];
      const diagnostics = ['memory_selected', 'memory_scored', 'memory_unfinished', 'memory_inference_output', 'memory_inference_no_change', 'memory_inference_errors', ...arms.flatMap(arm =>
        ['n_evaluated', 'n_errors', 'n_not_run', 'protocol_correct', 'cited_correct', 'malformed_answers', 'missing_citation', 'outdated_answer', 'wrong_scope_answer', 'unsupported_unanswerable'].map(key => `memory_${arm}_${key}`))];
      const budgets = [256, 512, 1024, 2048, 4096].flatMap(budget => [...arms.map(arm => `memory_b${budget}_${arm}_accuracy`), ...arms.map(arm => `memory_b${budget}_${arm}_tokens`),
        ...pairs.flatMap(pair => ['gain', 'ci_low', 'ci_high', 'p_value'].map(key => `memory_b${budget}_${pair}_${key}`))]);
      return ['model', 'suite', 'akm_version', 'role', ...(view === 'memory' ? [...quality, 'memory_memory_inference_failure_inclusive_p_value'] : view === 'memory-budgets' ? ['memory_split', 'memory_haystack', 'memory_judge_model', ...budgets] : view === 'memory-performance' ? performance : diagnostics), 'errors', 'measurement', 'scoring_version', 'label', 'date'];
    }
    if (view === 'impact') return ['model', 'suite', 'akm_version', 'role', 'control_quality_percent', 'akm_quality_percent', 'akm_delta_pp', 'akm_gain_ci', 'paired_cases', 'control_p50_s', 'akm_p50_s', 'median_time_change_percent', 'control_timed', 'akm_timed', 'errors', 'collection', 'label', 'date'];
    if (view === 'performance') return ['model', 'suite', 'akm_version', 'role', 'quality_percent', 'latency_p50_s', 'latency_p95_s', 'latency_basis', 'latency_timed', 'errors', 'calls', 'model_mean_input_tokens', 'model_mean_output_tokens', 'model_mean_request_s', 'model_output_tokens_per_s', 'input_tokens', 'output_tokens', 'cost_usd', 'cost_calls', 'usage_cases', 'usage_basis', 'run_wall_s', 'collection', 'label', 'date'];
    const base = ['model', 'suite', 'akm_version', 'role', 'quality_percent', 'quality_metric', 'quality_cases', 'scored', 'errors'];
    let extras;
    if (view === 'quality') extras = columns.filter(column => (column.group === 'Quality' || (state.facets.suite && column.key.startsWith('score:'))) && recorded(column));
    else extras = columns.filter(column => ['Settings', 'Provenance'].includes(column.group) && recorded(column));
    return [...new Set([...base, ...extras.map(column => column.key), 'collection', 'role', 'label', 'date'])];
  }
  function selectedColumns() {
    return grid.getColumns().filter(column => column.isVisible() && columnByKey.has(column.getField())).map(column => column.getField());
  }
  function defaultSort() {
    if (memoryViews.includes(state.analysisView)) return [{ column: 'date', dir: 'desc' }];
    return [{ column: state.analysisView === 'quality' ? 'quality_percent' : state.analysisView === 'performance' ? 'latency_p50_s' : state.analysisView === 'impact' ? 'akm_delta_pp' : 'date', dir: state.analysisView === 'performance' ? 'asc' : 'desc' }];
  }
  function applyView(view, force = false, keys = viewKeys(view)) {
    const signature = JSON.stringify([view, keys]);
    if (!force && signature === layoutSignature && keys.length === visibleKeys.size && keys.every(key => visibleKeys.has(key))) {
      updateCount(); return;
    }
    layoutSignature = signature;
    visibleKeys = new Set(keys);
    const sizing = view === 'impact' ? { model: 148, suite: 118, label: 138, role: 88,
      control_quality_percent: 105, akm_quality_percent: 105, akm_delta_pp: 110,
      akm_gain_ci: 145, paired_cases: 85, control_p50_s: 110, akm_p50_s: 110, median_time_change_percent: 125 }
      : view === 'memory' ? { model: 148, suite: 118, role: 88,
        memory_none_accuracy: 110, memory_source_accuracy: 110, memory_inferred_accuracy: 110,
        memory_persistent_memory_failure_inclusive_gain: 150, memory_memory_inference_failure_inclusive_gain: 150 } : widths;
    const filters = grid.getHeaderFilters(), sorting = grid.getSorters().map(sort => ({ column: sort.field, dir: sort.dir }));
    const ordered = [...keys, ...columns.map(column => column.key).filter(key => !visibleKeys.has(key))];
    grid.setColumnLayout([...ordered.map(field => ({ field, visible: visibleKeys.has(field),
      width: sizing[field] ?? widths[field] ?? (columnByKey.get(field).kind === 'number' ? Math.min(340, Math.max(130, columnByKey.get(field).label.length * 7 + 36)) : 190) })), { field: 'sources', visible: true, width: 140 }]);
    grid.setSort(sorting);
    for (const filter of filters) grid.setHeaderFilterValue(filter.field, filter.value);
    renderColumnChooser(); updateCount(); syncURL();
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
          visibleKeys = new Set(selectedColumns()); $('view').value = 'custom'; updateCount(); syncURL();
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
  const touchLayout = window.matchMedia('(max-width: 900px) and (any-pointer: coarse)');
  function renderTouchRuns() {
    if (!ready || !touchLayout.matches) return;
    const active = grid.getData('active'), size = grid.getPageSize();
    const start = typeof size === 'number' ? (grid.getPage() - 1) * size : 0;
    const page = typeof size === 'number' ? active.slice(start, start + size) : active;
    const sort = grid.getSorters()[0];
    const keys = [...new Set([...visibleKeys, sort?.field].filter(Boolean))];
    $('touch-sort').replaceChildren(...keys.map(key => new Option(titles[key] ?? columnByKey.get(key).label, key)));
    $('touch-sort').value = sort?.field ?? 'date';
    $('touch-direction').textContent = sort?.dir === 'asc' ? 'Ascending ↑' : 'Descending ↓';
    $('touch-cards').innerHTML = page.length ? page.map(row => {
      const fields = [...visibleKeys].filter(key => !['model', 'suite', 'akm_version'].includes(key));
      return `<article class="run-card" data-run-id="${escapeHTML(row.id)}">
        <h2>${escapeHTML(modelName(row.model))}</h2>
        <p class="run-identity">${escapeHTML(row.suite)} · AKM ${escapeHTML(row.akm_version)}</p>
        <dl>${fields.map(key => `<div><dt>${escapeHTML(titles[key] ?? columnByKey.get(key).label)}</dt><dd>${key === 'label'
          ? `<a href="${escapeHTML(row.summary_url)}" target="_blank" rel="noopener">${escapeHTML(row.label)}</a>`
          : formatCell(row[key], columnByKey.get(key))}</dd></div>`).join('')}</dl>
        <div class="run-reports"><a href="${escapeHTML(row.summary_url)}" target="_blank" rel="noopener">Summary ↗</a><a href="${escapeHTML(row.samples_url)}" target="_blank" rel="noopener">Cases ↗</a></div>
      </article>`;
    }).join('') : '<p class="empty">No runs match these filters. Reset filters to show all runs.</p>';
  }
  function updateTouchLayout() {
    document.body.classList.toggle('touch-layout', touchLayout.matches);
    $('touch-results').hidden = !touchLayout.matches;
    if (ready) { grid.redraw(true); updateCount(); }
  }
  touchLayout.addEventListener('change', updateTouchLayout);
  $('touch-sort').onchange = () => grid.setSort($('touch-sort').value, grid.getSorters()[0]?.dir ?? 'desc');
  $('touch-direction').onclick = () => grid.setSort($('touch-sort').value, grid.getSorters()[0]?.dir === 'asc' ? 'desc' : 'asc');
  const frozen = window.matchMedia('(min-width: 900px)').matches && !touchLayout.matches;
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
    ready = true; visibleKeys = new Set(compareKeys); layoutSignature = JSON.stringify(['compare', compareKeys]); renderColumnChooser(); updateTouchLayout();
    for (const input of document.querySelectorAll('.tabulator-header-filter input')) {
      const field = input.closest('[tabulator-field]')?.getAttribute('tabulator-field');
      input.setAttribute('aria-label', 'Filter ' + (columnByKey.get(field)?.label ?? field));
    }
    restoreURL();
  });
  for (const event of ['dataFiltered', 'dataSorted', 'pageLoaded', 'renderComplete']) grid.on(event, updateCount);
  grid.on('dataFiltered', () => { renderChips(); syncURL(); });
  grid.on('dataSorted', syncURL);
  grid.on('columnMoved', () => {
    layoutSignature = ''; visibleKeys = new Set(selectedColumns()); $('view').value = 'custom'; updateCount(); syncURL();
  });
  window.addEventListener('popstate', restoreURL);
  grid.on('dataFiltering', updateLatest);

  for (const key of facets) $(key).onchange = () => { state.facets[key] = $(key).value; applyFilters(); };
  $('search').oninput = () => { state.search = $('search').value.trim(); applyFilters(); };
  for (const key of ['dateFrom', 'dateTo']) $(key).onchange = () => { state[key] = $(key).value; applyFilters(); };
  $('latest-only').onchange = () => { state.latestOnly = $('latest-only').checked; applyFilters(); };
  $('errorsOnly').onchange = () => { state.errorsOnly = $('errorsOnly').checked; applyFilters(); };
  $('advanced-toggle').onclick = () => { const open = $('advanced-panel').hidden; $('advanced-panel').hidden = !open; $('advanced-toggle').setAttribute('aria-expanded', String(open)); };
  $('view').onchange = () => {
    const view = $('view').value;
    if (view !== 'custom') {
      state.analysisView = view;
      applyFilters(); applyView(view);
      grid.setSort(defaultSort());
    }
  };
  $('columns-toggle').onclick = () => openChooser($('columns-panel').hidden);
  $('columns-close').onclick = () => { openChooser(false); $('columns-toggle').focus(); };
  $('column-search').oninput = renderColumnChooser;
  $('reset-columns').onclick = () => { $('view').value = 'compare'; state.analysisView = 'compare'; applyFilters(); applyView('compare', true); };
  document.addEventListener('click', event => {
    if (!event.target.closest('.column-menu')) openChooser(false);
    if (!event.target.closest('.version-filter')) $('version-filter').open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      openChooser(false);
      if ($('version-filter').open) { $('version-filter').open = false; $('version-summary').focus(); }
    }
  });
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
    $('errorsOnly').checked = false; $('latest-only').checked = false;
    Object.assign(state, { search: '', versions: [], latestOnly: false, facets: {}, conditions: [], errorsOnly: false, dateFrom: '', dateTo: '' });
    grid.clearHeaderFilter();
    grid.setSort(defaultSort());
    applyFilters();
  };

  let copyFeedback;
  $('copy-link').onclick = async () => {
    syncURL(); clearTimeout(copyFeedback);
    try {
      await navigator.clipboard.writeText(window.location.href);
      $('copy-link').textContent = 'Copied!'; $('copy-status').textContent = 'Link copied.';
    } catch {
      $('copy-link').textContent = 'Copy failed'; $('copy-status').textContent = 'Copy failed. Copy the URL from the address bar.';
    }
    copyFeedback = setTimeout(() => { $('copy-link').textContent = 'Copy link'; $('copy-status').textContent = ''; }, 2000);
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
