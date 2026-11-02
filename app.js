const D = window.IHK_DATA;
const years = D.years;
const metricLabels = {
  Scaler: 'Scaler', HighGrowthFirm: 'Wachstumsunternehmen',
  ConsistentHighGrowthFirm: 'Kontinuierlich wachsende Unternehmen',
  VeryHighGrowthFirm: 'Sehr stark wachsende Unternehmen', Gazelle: 'Gazellen',
  Mature: 'Etablierte Unternehmen', Scaleup: 'Scale-ups', Superstar: 'Superstars'
};
const $ = selector => document.querySelector(selector);
const metricSelect = $('#metric'), districtSelect = $('#district');
const scenarioSelect = $('#scenario'), yearSelect = $('#year');
Object.entries(metricLabels).forEach(([key, label]) => metricSelect.add(new Option(label, key)));
Object.entries(D.scenarios).forEach(([key, value]) => scenarioSelect.add(new Option(value.label, key)));
scenarioSelect.value = D.default_scenario;
years.forEach(y => yearSelect.add(new Option(y, y)));
yearSelect.value = years.at(-1);
D.scenarios.observed.districts.forEach(d => districtSelect.add(new Option(d.name, d.name)));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const pct = v => finite(v) ? `${(v * 100).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%` : 'k. A.';
const diff = v => finite(v) ? `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1})} pp` : 'k. A.';
const num = v => Number(v).toLocaleString('de-DE');
const abs = (count, obs) => `${num(count)} / ${num(obs)}`;
const cls = v => !finite(v) ? 'muted' : v > 0.002 ? 'up' : v < -0.002 ? 'down' : 'neutral';
const difference = (a, b) => finite(a) && finite(b) ? a - b : null;
const scenario = () => D.scenarios[scenarioSelect.value];
const district = () => scenario().districts.find(d => d.name === districtSelect.value);
const statusLabels = {observed: 'Berichtet', interpolated: 'Interpoliert', forecast: 'Prognostiziert', peer_imputed: 'Peer-Schätzung', peer_imputed_recursive: 'Rekursive Peer-Schätzung', missing: 'Fehlend', not_applicable: 'Vor Gründung'};

function render() {
  const S = scenario(), m = metricSelect.value, index = years.indexOf(Number(yearSelect.value));
  const b = S.benchmark.metrics[m], latest = b.share[index];
  const rows = S.districts.map(d => {
    const a = d.metrics[m];
    return {...d, v: a.share[index], count: a.count[index], obs: a.obs[index], delta: difference(a.share[index], latest)};
  }).sort((a, z) => (z.v ?? -1) - (a.v ?? -1));
  const comparable = rows.filter(r => finite(r.delta));
  const above = comparable.filter(r => r.delta > 0).length;
  const avg = comparable.length ? comparable.reduce((a, r) => a + r.delta, 0) / comparable.length : null;
  const leader = rows.find(r => finite(r.v));
  $('#overview').innerHTML = `<div class="kpi"><div class="kpi-label">Rheinland-Pfalz-Benchmark</div><div class="kpi-value">${pct(latest)}</div><div class="kpi-note">${yearSelect.value} · ${abs(b.count[index], b.obs[index])} auswertbare Unternehmen</div></div><div class="kpi"><div class="kpi-label">Gebiete über Benchmark</div><div class="kpi-value">${above}<span style="font-size:18px;color:#8495a1"> / ${comparable.length}</span></div><div class="kpi-note">Gebiete mit auswertbarem Vergleich</div></div><div class="kpi"><div class="kpi-label">Mittlere Gebietsdifferenz</div><div class="kpi-value ${cls(avg)}">${diff(avg)}</div><div class="kpi-note">Ungewichtetes Mittel · ${yearSelect.value}</div></div><div class="kpi"><div class="kpi-label">Führendes Gebiet</div><div class="kpi-value" style="font-size:24px">${leader ? leader.name : 'k. A.'}</div><div class="kpi-note">${leader ? `${pct(leader.v)} · ${abs(leader.count, leader.obs)}` : 'Keine auswertbaren Unternehmen'}</div></div>`;
  $('#benchmark-pill').textContent = `RLP-Benchmark · ${pct(latest)} · ${abs(b.count[index], b.obs[index])}`;
  $('#rank-title').textContent = `Rangfolge nach Anteil ${yearSelect.value}`;
  $('#active-scenario').textContent = `${S.label} · ${yearSelect.value}`;
  $('#heatmap').innerHTML = `<div></div>${years.map(y => `<div class="heat-head">${y}</div>`).join('')}` + S.districts.map(d => `<div class="heat-name">${d.name}</div>` + d.metrics[m].share.map((v, i) => {
    const delta = difference(v, b.share[i]), strength = finite(delta) ? Math.min(Math.abs(delta) / .08, 1) : 0;
    const color = !finite(delta) ? '#edf2f5' : delta >= 0 ? `rgba(34,166,154,${.16 + strength * .75})` : `rgba(212,107,98,${.14 + strength * .72})`;
    return `<div class="heat-cell${years[i] === Number(yearSelect.value) ? ' selected-year' : ''}" style="background:${color};color:${finite(delta) && Math.abs(delta) > .035 ? '#fff' : '#28465b'}" title="${d.name} ${years[i]}: ${pct(v)} · ${abs(d.metrics[m].count[i], d.metrics[m].obs[i])} auswertbare Unternehmen (${diff(delta)})"><span>${diff(delta)}</span><small>${abs(d.metrics[m].count[i], d.metrics[m].obs[i])}</small></div>`;
  }).join('')).join('');
  const scale = Math.max(0.01, latest ?? 0, ...rows.map(r => r.v ?? 0)) * 1.12;
  $('#ranked-list').innerHTML = rows.map((r, i) => `<div class="rank-row"><div class="rank-no">${finite(r.v) ? String(i + 1).padStart(2, '0') : '–'}</div><div class="rank-name">${r.name}</div><div class="bar-track"><div class="bar-fill" style="width:${finite(r.v) ? r.v / scale * 100 : 0}%"></div>${finite(latest) ? `<div class="bar-benchmark" style="left:${latest / scale * 100}%"></div>` : ''}</div><div class="rank-value"><strong>${pct(r.v)}</strong><span>${abs(r.count, r.obs)}</span></div><div class="rank-diff ${cls(r.delta)}">${diff(r.delta)}</div></div>`).join('');
  renderDetail();
}

function renderDetail() {
  const m = metricSelect.value, d = district(), a = d.metrics[m], b = scenario().benchmark.metrics[m];
  const i = years.indexOf(Number(yearSelect.value)), latest = a.share[i], delta = difference(latest, b.share[i]);
  const trend = difference(latest, a.share[0]), available = a.share.filter(finite);
  const best = available.length ? years[a.share.indexOf(Math.max(...available))] : null;
  $('#detail-title').textContent = d.name;
  $('#detail-summary').innerHTML = `<div><div class="summary-number ${cls(delta)}">${pct(latest)}</div><div class="summary-caption">Anteil ${years[i]}</div></div><div><div class="summary-number ${cls(delta)}">${diff(delta)}</div><div class="summary-caption">vs. RLP-Benchmark</div></div><div><div class="summary-number ${cls(trend)}">${diff(trend)}</div><div class="summary-caption">Veränderung seit 2020</div></div><div><div class="summary-number">${num(a.count[i])}</div><div class="summary-caption">Absolute Zahl ${years[i]}</div><div class="summary-subcaption">von ${num(a.obs[i])} auswertbaren</div></div>`;
  const W = 900, H = 250, max = Math.max(.01, ...available, ...b.share.filter(finite)) * 1.18;
  const x = index => index * W / (years.length - 1), y = value => H - value / max * H;
  function line(series, color) {
    let path = '', previousValid = false;
    series.forEach((value, index) => {
      if (!finite(value)) { previousValid = false; return; }
      path += `${previousValid ? 'L' : 'M'}${x(index)},${y(value)} `;
      previousValid = true;
    });
    return `<path fill="none" stroke="${color}" stroke-width="5" d="${path}"/>`;
  }
  $('#line-chart').innerHTML = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Anteil ${metricLabels[m]}: ${d.name} und Rheinland-Pfalz, 2020 bis 2024">${line(b.share, '#c5d2da')}${line(a.share, '#1f89a7')}${a.share.map((value, index) => finite(value) ? `<circle cx="${x(index)}" cy="${y(value)}" r="7" fill="#fff" stroke="#1f89a7" stroke-width="4"><title>${years[index]}: ${pct(value)}</title></circle>` : '').join('')}</svg><div class="chart-labels">${years.map(year => `<span>${year}</span>`).join('')}</div>`;
  $('#insight-title').textContent = finite(delta) ? `${d.name} liegt ${Math.abs(delta) < 1e-12 ? 'gleichauf mit' : delta > 0 ? 'über' : 'unter'} dem RLP-Benchmark` : 'Kein auswertbarer Vergleich';
  $('#insight-copy').textContent = finite(latest) ? `${years[i]} gehören ${num(a.count[i])} von ${num(a.obs[i])} auswertbaren Unternehmen zur Kategorie „${metricLabels[m]}“ (${pct(latest)}). ${finite(delta) ? `Differenz zu Rheinland-Pfalz: ${diff(delta)}.` : 'Der RLP-Vergleich ist nicht verfügbar.'} Der Höchstwert 2020–2024 liegt im Jahr ${best}. Szenario: ${scenario().label}.` : 'Für dieses Merkmal und Jahr liegen keine auswertbaren Unternehmen vor. Fehlende Angaben werden nicht als null gewertet.';
  $('#coverage-title').textContent = `Beschäftigungsdaten ${years[i]} · ${d.name}`;
  const coverage = d.coverage[i];
  $('#coverage').innerHTML = Object.entries(statusLabels).map(([key, label]) => `<div class="coverage-item"><span class="status-dot status-${key}"></span><strong>${num(coverage[key] || 0)}</strong><span>${label}</span></div>`).join('');
  $('#dependency-note').textContent = `${num(d.population)} Unternehmen im Gebiet. Von ${num(a.obs[i])} für „${metricLabels[m]}“ auswertbaren Unternehmen verwenden ${num(a.estimated[i])} mindestens einen geschätzten Beschäftigungswert im relevanten Wachstumsfenster; ${num(a.forecast[i])} davon einen Prognosewert. Die Statuszahlen oben beziehen sich nur auf das Beschäftigungsjahr ${years[i]}.`;
}

$('#source-note').textContent = `ORBIS-Export: ${D.metadata.source_export_date} · Datenstand: ${D.metadata.source_data_update} · Pipeline: ${D.metadata.pipeline_generated_at.slice(0, 10)} · Dashboard: ${D.metadata.generated_at.slice(0, 10)}`;
$('#method-note').textContent = D.metadata.share_note;
$('#forecast-note').textContent = D.metadata.forecast_note;
$('#population-note').textContent = D.metadata.population_note;
[metricSelect, scenarioSelect, yearSelect].forEach(select => select.addEventListener('change', render));
districtSelect.addEventListener('change', renderDetail);
render();
