'use strict';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const number = value => value == null ? '—' : Number(value).toLocaleString();

function modelName(run) {
  if (run.model.startsWith('No LLM')) {
    if (run.suite === 'skillret' || run.model.includes('+')) return 'Keyword + semantic search';
    if (run.model.includes('semantic')) return 'Semantic search';
    return 'Keyword search';
  }
  if (run.model.includes('qwen3.8-27b')) return 'Qwen3.8 27B';
  if (run.model.includes('gpt-oss:120b')) return 'GPT-OSS 120B';
  return run.model;
}

function scoreValue(score) {
  if (score.value == null) return '—';
  if (score.unit === 'percent') return `${(score.value * 100).toFixed(1)}%`;
  if (score.unit === 'decimal') return score.value.toFixed(4);
  return number(score.value);
}

function scoreList(run, all = false) {
  const scores = all || ['retrieval', 'skillret'].includes(run.suite) ? run.scores : run.scores.slice(0, 3);
  if (!scores.length) return '<p>Scores are available in the original report.</p>';
  return `<div class="score-list">${scores.map(score => {
    const count = score.numerator == null || score.denominator == null
      ? '' : `<span class="score-count">${number(score.numerator)} / ${number(score.denominator)}</span>`;
    const warning = score.lower_is_better && score.value > 0 ? ' error-count' : '';
    return `<div class="score"><span class="score-label">${escapeHTML(score.label)}</span>
      <span class="score-value${warning}">${scoreValue(score)}</span>${count}</div>`;
  }).join('')}</div>`;
}

function dateLabel(date) {
  if (!date) return 'Date unrecorded';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'Date unrecorded';
  return value.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function failureChecks(run) {
  const metrics = run.metrics;
  const entries = [];
  const add = (checks, group = '') => {
    for (const [check, count] of Object.entries(checks || {})) {
      if (typeof count === 'number' && count > 0) entries.push({
        name: `${group ? `${group} · ` : ''}${check.replaceAll('_', ' ')}`, count,
      });
    }
  };
  if (metrics.failed) add(metrics.failed);
  else {
    for (const [name, group] of Object.entries(metrics.by_process || metrics.classes || {})) {
      add(group.failed, name.replaceAll('-', ' '));
    }
  }
  return entries.length ? `<div><h3>Failed checks</h3><ul class="failure-list">${entries.map(entry =>
    `<li>${escapeHTML(entry.name)}: ${number(entry.count)}</li>`).join('')}</ul></div>` : '';
}

async function startLedger() {
  const response = await fetch('./data.json');
  if (!response.ok) throw new Error('Published results could not load.');
  const data = await response.json();
  const runs = data.runs;
  const byId = new Map(runs.map(run => [run.id, run]));
  const $ = id => document.getElementById(id);
  let view = 'latest';
  let sortKey = 'test_name';
  let direction = 1;
  let visible = [];
  const expanded = new Set();
  const latest = data.latest_groups.map(group => {
    const members = group.ids.map(id => byId.get(id));
    const history = (group.all_ids || group.ids).map(id => byId.get(id));
    const run = members.at(-1);
    return { run, members, history, variation: group.variation };
  });

  const testNames = new Map(runs.map(run => [run.suite, run.test_name]));
  for (const [suite, name] of [...testNames].sort((a, b) => a[1].localeCompare(b[1]))) {
    $('suite').add(new Option(name, suite));
  }
  for (const model of [...new Set(runs.map(modelName))].sort()) {
    $('model').add(new Option(model, model));
  }
  const full = runs.filter(run => run.role === 'Full suite').length;
  $('snapshot').textContent = `${number(full)} full runs · ${number(runs.length - full)} small trials and checks · ${number(testNames.size)} tests · Updated ${dateLabel(data.latest_collection_date)}`;
  $('provenance').innerHTML = `Built from <a href="https://github.com/itlackey/akm-eval/tree/${encodeURIComponent(data.source_revision)}/reports">published reports</a> at revision ${escapeHTML(data.source_revision.slice(0, 8))}. Run times are shown in UTC. ` +
    '<a href="https://github.com/fwdslsh/website">Theme adapted from fwdslsh.dev</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).';

  function matches(run) {
    const terms = $('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (!$('suite').value || run.suite === $('suite').value) &&
      (!$('model').value || modelName(run) === $('model').value) &&
      terms.every(term => [run.test_name, run.suite, run.collection, run.label, modelName(run), run.model, run.notes]
        .join(' ').toLowerCase().includes(term));
  }

  function compare(a, b) {
    const values = entry => sortKey === 'model' ? modelName(entry.run) : entry.run[sortKey];
    return direction * String(values(a) ?? '').localeCompare(String(values(b) ?? ''), undefined, { numeric: true });
  }

  function runReport(run, index, comparable, open) {
    const scope = run.role === 'Pilot' ? 'Small trial' : run.role === 'Diagnostic' ? 'Compatibility check' : 'Full test';
    const stamp = run.date ? escapeHTML(run.date.slice(11, 16)) + ' UTC' : '';
    const first = run.scores[0];
    const score = first ? ` · ${escapeHTML(first.label)}: ${scoreValue(first)}` : '';
    return `<details${open ? ' open' : ''}>
      <summary>Run ${index + 1} · ${dateLabel(run.date)} ${stamp}${score}${comparable ? '' : ' · earlier test code or settings'}</summary>
      <div class="run-report">
        ${scoreList(run, true)}
        <div class="metadata"><span>${scope}</span><span>AKM ${escapeHTML(run.akm_version)}</span>
          <span>Scoring version ${escapeHTML(run.measurement)}</span><span>${number(run.scored)} of ${number(run.recorded)} cases scored</span>
          <span>${number(run.errors)} ${run.errors === 1 ? 'error' : 'errors'}</span><span>Model: ${escapeHTML(run.model)}</span><span>Run: ${escapeHTML(run.label)}</span></div>
        ${run.notes ? `<p>${escapeHTML(run.notes)}</p>` : ''}
        ${failureChecks(run)}
        <p class="source-links"><a href="${escapeHTML(run.summary_url)}" target="_blank" rel="noopener">Original scores ↗</a>
          <a href="${escapeHTML(run.samples_url)}" target="_blank" rel="noopener">Case-by-case output ↗</a></p>
      </div>
    </details>`;
  }

  function detail(entry) {
    const run = entry.run;
    const variation = entry.variation;
    const repeat = variation
      ? `${number(variation.unstable)} of ${number(variation.n)} shared cases changed ${escapeHTML(variation.kind)} across ${entry.members.length} matching runs.`
      : entry.members.length > 1 ? 'These runs do not record a comparable case-by-case verdict.'
        : 'One run has matching test code and settings; repeat consistency cannot be estimated.';
    const previous = entry.history.length > entry.members.length
      ? `<p>${entry.history.length - entry.members.length} earlier runs used different test code or settings. Their individual scores are listed below.</p>` : '';
    return `<tr class="detail-row"><td colspan="6"><div class="detail-content">
      <div><h3>${escapeHTML(run.test_name)}${run.collection ? ` / ${escapeHTML(run.collection)}` : ''}</h3>
        <p>${escapeHTML(run.test_description)}</p><p><a href="${escapeHTML(run.test_url)}">Test setup and scoring rules ↗</a></p></div>
      <div class="detail-columns"><div><h3>How this test is scored</h3><dl class="metric-definitions">
        ${run.scores.map(score => `<dt>${escapeHTML(score.label)}</dt><dd>${escapeHTML(score.explanation)}</dd>`).join('')}
      </dl></div><div><h3>Repeat consistency</h3><p>${repeat}</p>${previous}
        <p>Only cases scored in every matching run enter the consistency comparison. Failed calls are excluded.</p></div></div>
      <div><h3>${entry.history.length} published ${entry.history.length === 1 ? 'run' : 'runs'}</h3>
        <div class="run-list">${entry.history.map((row, index) => runReport(row, index,
          entry.members.some(member => member.id === row.id), row.id === run.id)).join('')}</div></div>
    </div></td></tr>`;
  }

  function row(entry) {
    const run = entry.run;
    const scope = run.role === 'Pilot' ? 'Small trial' : run.role === 'Diagnostic' ? 'Compatibility check' : '';
    const cases = run.scored === run.recorded ? `${number(run.scored)} scored`
      : `${number(run.scored)} of ${number(run.recorded)} scored`;
    const earlier = entry.history.length - entry.members.length;
    return `<tr class="result-row">
      <td class="test-cell" data-label="Test"><strong>${escapeHTML(run.test_name)}</strong>
        ${run.collection ? `<span class="sub">${escapeHTML(run.collection)}</span>` : ''}
        <span class="sub">${dateLabel(run.date)}</span>${scope ? `<span class="sub trial-label">${scope}</span>` : ''}</td>
      <td class="model-cell" data-label="Model / search">${escapeHTML(modelName(run))}</td>
      <td class="result-cell" data-label="Result">${scoreList(run)}</td>
      <td class="number" data-label="Cases">${cases}<span class="sub${run.errors > 0 ? ' error-count' : ''}">${number(run.errors)} ${run.errors === 1 ? 'error' : 'errors'}</span></td>
      <td class="number" data-label="Runs">${number(entry.members.length)}${earlier ? `<span class="sub">+ ${earlier} earlier</span>` : ''}</td>
      <td class="detail-cell"><button type="button" class="detail-button" data-id="${escapeHTML(run.id)}" aria-expanded="${expanded.has(run.id)}"
        aria-label="${expanded.has(run.id) ? 'Hide' : 'Show'} details for ${escapeHTML(run.test_name + ' ' + run.label)}">${expanded.has(run.id) ? 'Close' : 'Details'} ${expanded.has(run.id) ? '−' : '+'}</button></td>
    </tr>${expanded.has(run.id) ? detail(entry) : ''}`;
  }

  function render() {
    const candidates = view === 'latest' ? latest : runs.filter(run => view !== 'pilots' || run.role !== 'Full suite')
      .map(run => ({ run, members: [run], history: [run], variation: null }));
    // Metadata searches also match an earlier repeat in the visible result group.
    visible = candidates.filter(entry => entry.history.some(matches)).sort(compare);
    const columns = [['test_name', 'Test'], ['model', 'Model / search'], [null, 'Result'], [null, 'Cases'], [null, 'Runs'], [null, 'Details']];
    $('head').innerHTML = columns.map(([key, title]) => `<th scope="col"${key ? ` aria-sort="${key === sortKey ? direction === 1 ? 'ascending' : 'descending' : 'none'}"` : ''}>
      ${key ? `<button type="button" data-sort="${key}">${title}${key === sortKey ? direction === 1 ? ' ↑' : ' ↓' : ''}</button>` : title}</th>`).join('');
    $('body').innerHTML = visible.length ? visible.map(row).join('')
      : '<tr><td class="empty" colspan="6">No results match these filters. Clear filters or choose another view.</td></tr>';
    const records = selectedRuns();
    const noun = view === 'latest' ? 'result' : 'run';
    $('count').textContent = `${visible.length} ${noun}${visible.length === 1 ? '' : 's'} · ${records.length} published ${records.length === 1 ? 'run' : 'runs'} in this selection`;
    $('view-help').textContent = view === 'latest'
      ? 'Scores are from the newest full run. The Runs column counts matching repeats; earlier runs with changed test code are listed in Details.'
      : view === 'pilots' ? 'Small trials and compatibility checks. These case counts do not establish full-benchmark performance.'
        : 'Every completed public run, including repeats and small trials. Dates and original files are in Details.';
    for (const name of ['latest', 'all', 'pilots']) $('view-' + name).setAttribute('aria-pressed', String(view === name));
    const test = runs.find(run => run.suite === $('suite').value);
    $('test-guide').hidden = !test;
    $('test-guide').innerHTML = test ? `<p>${escapeHTML(test.test_description)}</p><a href="${escapeHTML(test.test_url)}">Read this test’s scoring rules ↗</a>` : '';
  }

  function selectedRuns() {
    return [...new Map(visible.flatMap(entry => entry.history).map(run => [run.id, run])).values()];
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.view) {
      view = button.dataset.view;
      expanded.clear();
      render();
    } else if (button.dataset.sort) {
      direction = button.dataset.sort === sortKey ? -direction : 1;
      sortKey = button.dataset.sort;
      render();
      document.querySelector(`[data-sort="${sortKey}"]`)?.focus({ preventScroll: true });
    } else if (button.dataset.id) {
      const id = button.dataset.id;
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      render();
      // The row is rebuilt; restore focus without interpolating an external ID into a selector.
      [...document.querySelectorAll('[data-id]')].find(element => element.dataset.id === id)?.focus({ preventScroll: true });
    }
  });
  for (const name of ['suite', 'model']) $(name).addEventListener('change', render);
  $('search').addEventListener('input', render);
  $('reset').onclick = () => {
    for (const name of ['suite', 'model', 'search']) $(name).value = '';
    expanded.clear();
    sortKey = 'test_name';
    direction = 1;
    render();
  };
  $('csv').onclick = () => {
    const fields = ['test_name', 'model', 'collection', 'label', 'date', 'role', 'akm_version', 'measurement', 'scored', 'recorded', 'errors', 'metric', 'value', 'unit', 'numerator', 'denominator', 'summary_url', 'samples_url'];
    const quote = value => {
      let text = String(value ?? '');
      if (/^[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = selectedRuns().flatMap(run => (run.scores.length ? run.scores : [null]).map(score => ({
      ...run, metric: score?.label, value: score?.value, unit: score?.unit,
      numerator: score?.numerator, denominator: score?.denominator,
    })));
    const csv = fields.map(quote).join(',') + '\r\n' + rows.map(run => fields.map(key => quote(run[key])).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'akm-eval-results.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  render();
}

startLedger().catch(() => {
  document.getElementById('snapshot').textContent = 'Results could not load. Use the published reports or try reloading.';
  document.getElementById('count').textContent = 'Results unavailable.';
  document.getElementById('body').innerHTML = '<tr><td class="empty" colspan="6"><a href="https://github.com/itlackey/akm-eval/blob/main/reports/README.md">Read the published reports ↗</a></td></tr>';
});
