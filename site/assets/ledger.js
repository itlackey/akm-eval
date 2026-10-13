'use strict';

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function matchesText(value, query) {
  const text = String(value ?? '').toLowerCase();
  // A pipe accepts alternative values; each alternative can contain multiple search terms.
  return query.toLowerCase().split('|').some(option => option.trim().split(/\s+/).every(term => text.includes(term)));
}

function filterRows(rows, columns, state) {
  return rows.filter(row => {
    if (state.search && !matchesText(columns.map(column => row[column.key]).join(' '), state.search)) return false;
    if (state.selectedOnly && !state.selected.has(row.id)) return false;
    if (state.errorsOnly && !(row.errors > 0)) return false;
    if (state.dateFrom && (!row.date || row.date.slice(0, 10) < state.dateFrom)) return false;
    if (state.dateTo && (!row.date || row.date.slice(0, 10) > state.dateTo)) return false;
    for (const [key, value] of Object.entries(state.facets)) if (value && row[key] !== value) return false;
    for (const [key, filter] of Object.entries(state.filters)) {
      const raw = row[key];
      const column = columns.find(column => column.key === key);
      const value = typeof raw === 'number' ? Number(raw.toFixed(column?.decimals ?? 2)) : raw;
      const missing = value == null || value === '';
      if (filter.presence === 'missing' && !missing || filter.presence === 'present' && missing) return false;
      if (filter.text && !matchesText(value, filter.text)) return false;
      if (filter.min !== '' && (typeof value !== 'number' || value < Number(filter.min))) return false;
      if (filter.max !== '' && (typeof value !== 'number' || value > Number(filter.max))) return false;
    }
    return true;
  });
}

function sortRows(rows, sorting) {
  return [...rows].sort((a, b) => {
    for (const { key, direction } of sorting) {
      const x = a[key], y = b[key];
      if (x == null || x === '') { if (y != null && y !== '') return 1; else continue; }
      if (y == null || y === '') return -1;
      const difference = typeof x === 'number' && typeof y === 'number' ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true });
      if (difference) return direction * difference;
    }
    return a.id.localeCompare(b.id);
  });
}

function formatCell(value, column) {
  if (value == null || value === '') return '—';
  if (column.kind === 'number') return value.toLocaleString('en', {
    minimumFractionDigits: column.decimals || 0, maximumFractionDigits: column.decimals || 0,
  }) + (column.unit || '');
  if (column.kind === 'date') return escapeHTML(value.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', ''));
  return escapeHTML(value);
}

async function startLedger() {
  const $ = id => document.getElementById(id);
  const revision = document.documentElement.dataset.revision;
  const response = await fetch('./data.json' + (revision ? '?v=' + encodeURIComponent(revision) : ''), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Published results could not load.');
  const data = await response.json();
  const columns = data.columns;
  const rows = data.runs.map(run => ({ ...run, ...run.comparison }));
  const byId = new Map(rows.map(row => [row.id, row]));
  const facets = ['model', 'suite', 'collection', 'role', 'akm_version', 'measurement', 'search_method', 'strategy'];
  const selected = new Set();
  const state = { search: '', facets: {}, filters: {}, errorsOnly: false, selectedOnly: false,
    dateFrom: '', dateTo: '', selected };
  let sorting = [{ key: 'date', direction: -1 }];
  let visible = [];

  for (const key of facets) for (const value of [...new Set(rows.map(row => row[key]))].filter(Boolean).sort()) {
    $(key).add(new Option(value, value));
  }
  $('snapshot').textContent = `${rows.length} published runs · ${new Set(rows.map(row => row.suite)).size} tests · ${new Set(rows.map(row => row.model)).size} model / search configurations`;
  $('provenance').innerHTML = `<a href="https://github.com/itlackey/akm-eval/tree/${encodeURIComponent(data.source_revision)}/reports">Published reports at ${escapeHTML(data.source_revision.slice(0, 8))}</a> · ` +
    '<a href="https://github.com/fwdslsh/website">fwdslsh theme</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).';

  function sticky(index) { return index === 0 ? ' sticky-model' : index === 1 ? ' sticky-run' : ''; }
  const groups = [];
  for (const column of columns) {
    if (groups.at(-1)?.name === column.group) groups.at(-1).count++;
    else groups.push({ name: column.group, count: 1 });
  }
  $('groups').innerHTML = '<th class="sticky-select" rowspan="3" scope="col">Select</th>' +
    groups.map(group => `<th colspan="${group.count}" scope="colgroup">${escapeHTML(group.name)}</th>`).join('') + '<th rowspan="3" scope="col">Source files</th>';
  $('head').innerHTML = columns.map((column, index) => `<th scope="col" class="${sticky(index)}" data-column="${index}" title="${escapeHTML(column.description)}">
    <button type="button" data-sort="${index}">${escapeHTML(column.label)} <span data-sort-mark="${index}"></span></button></th>`).join('');
  $('column-filters').innerHTML = columns.map((column, index) => `<th class="${sticky(index)}">${column.kind === 'number'
    ? `<div class="range-filter"><input type="number" step="any" inputmode="decimal" data-filter="${index}" data-bound="min" placeholder="Min" aria-label="Minimum ${escapeHTML(column.label)}"><input type="number" step="any" inputmode="decimal" data-filter="${index}" data-bound="max" placeholder="Max" aria-label="Maximum ${escapeHTML(column.label)}"></div>`
    : `<input type="search" data-filter="${index}" data-bound="text" placeholder="Filter…" aria-label="Filter ${escapeHTML(column.label)}">`}
      <select class="presence-filter" data-filter="${index}" data-bound="presence" aria-label="Recorded values for ${escapeHTML(column.label)}"><option value="">All values</option><option value="present">Recorded only</option><option value="missing">Unrecorded only</option></select></th>`).join('');

  function updateSort() {
    for (const [index, column] of columns.entries()) {
      const position = sorting.findIndex(sort => sort.key === column.key);
      const sort = sorting[position];
      document.querySelector(`[data-column="${index}"]`)?.setAttribute('aria-sort', !sort ? 'none' : sort.direction === 1 ? 'ascending' : 'descending');
      const mark = document.querySelector(`[data-sort-mark="${index}"]`);
      if (mark) mark.textContent = sort ? `${sort.direction === 1 ? '↑' : '↓'}${sorting.length > 1 ? position + 1 : ''}` : '';
    }
    $('sort-status').textContent = 'Sorted by ' + sorting.map(sort => `${columns.find(column => column.key === sort.key)?.label} ${sort.direction === 1 ? 'ascending' : 'descending'}`).join(', then ');
  }

  function render() {
    visible = sortRows(filterRows(rows, columns, state), sorting);
    const totalColumns = columns.length + 2;
    $('body').innerHTML = visible.length ? visible.map(row => `<tr class="ledger-row${selected.has(row.id) ? ' is-selected' : ''}">
      <td class="sticky-select"><input type="checkbox" data-select="${escapeHTML(row.id)}" ${selected.has(row.id) ? 'checked' : ''} aria-label="Compare ${escapeHTML(row.suite + ' ' + row.label)}"></td>
      ${columns.map((column, index) => {
        const value = row[column.key];
        const digest = column.key.endsWith('sha256');
        const metric = column.key.startsWith('score:') ? row.scores.find(score => 'score:' + score.label === column.key) : null;
        const fraction = metric?.numerator != null && metric?.denominator != null ? `<span class="sub">${metric.numerator} / ${metric.denominator}</span>` : column.key === 'label' ? `<span class="sub">${escapeHTML(row.suite)}</span>` : '';
        return `<td class="${column.kind === 'number' ? 'numeric' : 'text-cell'}${sticky(index)}${column.key === 'notes' ? ' notes-cell' : ''}${column.key === 'errors' && value > 0 ? ' error-count' : ''}" title="${escapeHTML(value ?? 'Unrecorded')}">${digest && value ? escapeHTML(value.slice(0, 12)) : formatCell(value, column)}${fraction}</td>`;
      }).join('')}
      <td class="source-cell"><a href="${escapeHTML(row.summary_url)}" target="_blank" rel="noopener">Summary ↗</a><a href="${escapeHTML(row.samples_url)}" target="_blank" rel="noopener">Cases ↗</a><a href="${escapeHTML(row.test_url)}" target="_blank" rel="noopener">Scoring ↗</a></td>
    </tr>`).join('') : `<tr><td colspan="${totalColumns}" class="empty">No runs match the filters${state.selectedOnly ? ' or selected rows' : ''}. Reset filters to show every run.</td></tr>`;
    $('count').textContent = `${visible.length} of ${rows.length} runs · ${columns.length} columns · ${selected.size} selected`;
    $('selectedCount').textContent = String(selected.size);
    updateSort();
  }

  function readControls() {
    state.search = $('search').value.trim();
    for (const key of facets) state.facets[key] = $(key).value;
    state.errorsOnly = $('errorsOnly').checked;
    state.selectedOnly = $('selectedOnly').checked;
    state.dateFrom = $('dateFrom').value;
    state.dateTo = $('dateTo').value;
    render();
  }
  for (const id of [...facets, 'errorsOnly', 'selectedOnly', 'dateFrom', 'dateTo']) $(id).addEventListener('change', readControls);
  $('search').addEventListener('input', readControls);
  function columnFilter(event) {
    const index = event.target.dataset?.filter;
    if (index == null) return;
    const column = columns[Number(index)];
    const bound = event.target.dataset.bound;
    const filter = state.filters[column.key] ||= { text: '', min: '', max: '', presence: '' };
    filter[bound] = event.target.value;
    render();
  }
  document.addEventListener('input', columnFilter);
  document.addEventListener('change', event => {
    if (event.target.dataset?.filter != null) { columnFilter(event); return; }
    const id = event.target.dataset?.select;
    if (!id || !byId.has(id)) return;
    event.target.checked ? selected.add(id) : selected.delete(id);
    render();
    [...document.querySelectorAll('[data-select]')].find(element => element.dataset.select === id)?.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.sort != null) {
      const column = columns[Number(button.dataset.sort)];
      const current = sorting.find(sort => sort.key === column.key);
      const next = { key: column.key, direction: current ? -current.direction : 1 };
      sorting = event.shiftKey ? current ? sorting.map(sort => sort.key === next.key ? next : sort) : [...sorting, next] : [next];
      render();
    } else if (button.dataset.group) {
      const index = columns.findIndex(column => column.group === button.dataset.group);
      const heading = document.querySelector(`[data-column="${index}"]`);
      if (heading) $('table-scroll').scrollTo({ left: Math.max(0, heading.offsetLeft - (document.documentElement.clientWidth <= 640 ? 50 : 500)), behavior: 'smooth' });
    }
  });
  $('reset').onclick = () => {
    for (const id of [...facets, 'search', 'dateFrom', 'dateTo']) $(id).value = '';
    $('errorsOnly').checked = false;
    $('selectedOnly').checked = false;
    for (const input of document.querySelectorAll('[data-filter]')) input.value = '';
    state.filters = {}; selected.clear(); sorting = [{ key: 'date', direction: -1 }];
    readControls();
  };
  $('selectVisible').onclick = () => { for (const row of visible) selected.add(row.id); render(); };
  $('clearSelection').onclick = () => { selected.clear(); $('selectedOnly').checked = false; readControls(); };

  function download(name, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('json').onclick = () => download('akm-eval-filtered.json', 'application/json', JSON.stringify({
    source_revision: data.source_revision, columns, runs: visible,
  }, null, 2));
  $('csv').onclick = () => {
    const quote = value => { let text = String(value ?? ''); if (/^[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const fields = [...columns.map(column => column.key), 'summary_url', 'samples_url'];
    download('akm-eval-filtered.csv', 'text/csv;charset=utf-8',
      [...columns.map(column => column.label), 'Summary URL', 'Samples URL'].map(quote).join(',') + '\r\n' +
      visible.map(row => fields.map(key => quote(row[key])).join(',')).join('\r\n'));
  };
  render();
}

startLedger().catch(() => {
  document.getElementById('snapshot').textContent = 'Results could not load. Reload the page or use the published reports.';
  document.getElementById('body').innerHTML = '<tr><td class="empty"><a href="https://github.com/itlackey/akm-eval/blob/main/reports/README.md">Read published reports ↗</a></td></tr>';
});
