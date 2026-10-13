'use strict';

async function startLedger() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error('Published results could not load.');
  const DATA = await response.json(), ROWS = DATA.runs;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fmt = value => value == null ? '—' : typeof value === 'number' ? value.toLocaleString() : esc(value);
  const keys = ['suite', 'model', 'role', 'akm_version', 'measurement'];
  const cols = [['expand', 'Details'], ['suite', 'Suite'], ['model', 'Model / mode'], ['label', 'Run artifact'], ['role', 'Scope'], ['akm_version', 'AKM CLI'], ['measurement', 'Measurement'], ['scored', 'Scored / recorded'], ['errors', 'Errors'], ['result', 'Suite result'], ['guardrail', 'Guardrail / coverage']];
  let sortKey = 'date', direction = -1, filtered = [], expanded = new Set();
  for (const key of keys) for (const value of [...new Set(ROWS.map(row => row[key]))].sort()) $(key).add(new Option(value, value));
  $('total').textContent = fmt(ROWS.length);
  $('samples').textContent = fmt(ROWS.reduce((sum, row) => sum + (row.recorded ?? 0), 0));
  $('suites').textContent = fmt(new Set(ROWS.map(row => row.suite)).size);
  $('latest').textContent = DATA.latest_collection_date.slice(0, 10) || 'Unspecified';
  const unknown = ROWS.filter(row => row.recorded == null).length;
  $('provenance').innerHTML = `Published reports at <a href="https://github.com/itlackey/akm-eval/tree/${encodeURIComponent(DATA.source_revision)}/reports">${esc(DATA.source_revision.slice(0, 12))}</a> · Collection dates and versions are recorded per run.${unknown ? ` Recorded coverage is unknown for ${unknown} artifacts.` : ''}`;
  const byId = new Map(ROWS.map(row => [row.id, row]));
  $('latestBody').innerHTML = DATA.latest_groups.map(group => {
    const rows = group.ids.map(id => byId.get(id)), run = rows[0], variation = group.variation;
    return `<tr><td><b>${esc(run.suite)}</b>${run.collection ? `<br>${esc(run.collection)}` : ''}<br><span class="muted">AKM ${esc(run.akm_version)} · measurement ${esc(run.measurement)}</span></td><td>${esc(run.model)}${run.mode ? `<br>${esc(run.mode)}` : ''}</td><td class="number">${fmt(rows.length)}</td><td>${rows.map(row => `${fmt(row.scored)} / ${fmt(row.recorded)}${row.errors ? ` · ${fmt(row.errors)} errors` : ''}`).join('<br>')}</td><td>${rows.map(row => `${esc(row.result)}<br><span class="muted">${esc(row.guardrail)}</span>`).join('<br><br>')}</td><td>${variation ? `${(variation.flip_rate * 100).toFixed(1)}% ${esc(variation.kind)} flip<br><span class="muted">${fmt(variation.unstable)}/${fmt(variation.n)} unstable across ${rows.length} runs</span>` : '<span class="muted">No comparable repeated verdicts</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="6">No full-run groups are published yet.</td></tr>';
  function compare(a, b) {
    const x = a[sortKey], y = b[sortKey];
    if (x == null && y == null) return a.id.localeCompare(b.id);
    if (x == null) return 1;
    if (y == null) return -1;
    return direction * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true }));
  }
  function cell(row, key) {
    if (key === 'expand') return `<button class="toggle" data-id="${esc(row.id)}" aria-expanded="${expanded.has(row.id)}" aria-label="Show details for ${esc(row.suite + ' ' + row.label)}">${expanded.has(row.id) ? '−' : '+'}</button>`;
    if (key === 'suite') return `<b>${esc(row.suite)}</b>${row.collection ? `<br><span class="muted">${esc(row.collection)}</span>` : ''}${row.mode ? `<br><span class="muted">${esc(row.mode)}</span>` : ''}`;
    if (key === 'label') return `${esc(row.label)}<br><span class="muted">${esc(row.date.slice(0, 16).replace('T', ' '))}${row.date ? ' UTC' : ''}</span>`;
    if (key === 'role') return `<span class="badge ${row.role === 'Pilot' ? 'pilot' : row.role === 'Diagnostic' ? 'diagnostic' : ''}">${esc(row.role)}</span>`;
    if (key === 'scored') return `${fmt(row.scored)} / ${fmt(row.recorded)}`;
    if (key === 'errors') return `<span class="${row.errors ? 'error-count' : ''}">${fmt(row.errors)}</span>`;
    return esc(row[key]);
  }
  function detail(row) {
    return `<tr class="details"><td colspan="${cols.length}"><div class="detail-grid"><section><h3>${esc(row.suite)} · ${esc(row.label)}</h3><p>${esc(row.notes || 'Completed public run. Read this suite’s metric definitions before comparing.')}</p><p class="source-links"><a href="${esc(row.summary_url)}" target="_blank" rel="noopener">Original summary JSON</a><a href="${esc(row.samples_url)}" target="_blank" rel="noopener">Original sample rows</a></p><dl><dt>AKM CLI</dt><dd>${esc(row.akm_version)}</dd><dt>Measurement</dt><dd>${esc(row.measurement)}</dd><dt>Collector commit</dt><dd>${esc(row.source_commit || 'Unspecified')}</dd><dt>Scored / recorded</dt><dd>${fmt(row.scored)} / ${fmt(row.recorded)}</dd><dt>Collection errors</dt><dd>${fmt(row.errors)}</dd><dt>Harness digest</dt><dd>${esc(row.harness_sha256 || 'Unspecified')}</dd></dl></section><section><h3>Recorded metrics and group breakdowns</h3><pre>${esc(JSON.stringify(row.metrics, null, 2))}</pre></section></div></td></tr>`;
  }
  function render() {
    const term = $('search').value.toLowerCase().trim();
    filtered = ROWS.filter(row => keys.every(key => !$(key).value || row[key] === $(key).value) && (!$('errorsOnly').checked || row.errors > 0) && (!term || [row.suite, row.collection, row.label, row.model, row.role, row.notes, row.result, row.guardrail, row.source_commit].join(' ').toLowerCase().includes(term))).sort(compare);
    $('head').innerHTML = cols.map(([key, title]) => `<th ${key === 'expand' ? '' : `aria-sort="${sortKey === key ? (direction === 1 ? 'ascending' : 'descending') : 'none'}"`}><button type="button" ${key === 'expand' ? 'disabled' : `data-sort="${key}"`}>${esc(title)} ${sortKey === key ? (direction === 1 ? '↑' : '↓') : ''}</button></th>`).join('');
    $('body').innerHTML = filtered.length ? filtered.map(row => `<tr>${cols.map(([key]) => `<td class="${key === 'scored' || key === 'errors' ? 'number' : key === 'model' ? 'model' : key === 'label' ? 'run-name' : key === 'result' ? 'score' : key === 'guardrail' ? 'guardrail' : ''}">${cell(row, key)}</td>`).join('')}</tr>${expanded.has(row.id) ? detail(row) : ''}`).join('') : `<tr><td class="empty" colspan="${cols.length}">No matching runs. Reset filters or broaden your search.</td></tr>`;
    $('count').textContent = `${filtered.length} of ${ROWS.length} runs · ${filtered.filter(row => row.role === 'Full suite').length} full suites · ${filtered.reduce((sum, row) => sum + (row.recorded ?? 0), 0).toLocaleString()} recorded rows`;
  }
  document.addEventListener('click', event => {
    const sort = event.target.closest('[data-sort]');
    if (sort) { const key = sort.dataset.sort; direction = key === sortKey ? -direction : 1; sortKey = key; render(); }
    const toggle = event.target.closest('[data-id]');
    if (toggle) { expanded.has(toggle.dataset.id) ? expanded.delete(toggle.dataset.id) : expanded.add(toggle.dataset.id); render(); }
  });
  for (const key of [...keys, 'errorsOnly']) $(key).addEventListener('change', render);
  $('search').addEventListener('input', render);
  $('reset').onclick = () => { for (const key of [...keys, 'search']) $(key).value = ''; $('errorsOnly').checked = false; sortKey = 'date'; direction = -1; expanded.clear(); render(); };
  function download(name, type, content) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('json').onclick = () => download('akm-eval-filtered-runs.json', 'application/json', JSON.stringify({ ...DATA, runs: filtered, latest_groups: [] }, null, 2));
  $('csv').onclick = () => {
    const fields = ['suite', 'collection', 'mode', 'label', 'date', 'model', 'role', 'akm_version', 'measurement', 'recorded', 'scored', 'errors', 'result', 'guardrail', 'notes', 'source_commit', 'summary_url', 'samples_url'];
    const quote = value => { let valueText = String(value ?? ''); if (/^[=+@-]/.test(valueText)) valueText = "'" + valueText; return '"' + valueText.replace(/"/g, '""') + '"'; };
    download('akm-eval-filtered-runs.csv', 'text/csv;charset=utf-8', fields.map(quote).join(',') + '\r\n' + filtered.map(row => fields.map(key => quote(row[key])).join(',')).join('\r\n'));
  };
  render();
}
startLedger().catch(() => {
  document.getElementById('count').textContent = 'Results could not load. Follow the published reports link above or retry.';
  document.getElementById('body').textContent = 'Results unavailable.';
  document.getElementById('latestBody').textContent = 'Results unavailable.';
});
