/*
 * PITWALL — client de timing live.
 *
 * Règle absolue : si une donnée n'arrive pas, on l'affiche comme absente
 * (—, badge "pas de données", grisé). On n'interpole jamais, on ne réutilise
 * jamais une ancienne valeur en la faisant passer pour une valeur live.
 *
 * Source F1 : OpenF1 (https://openf1.org), API communautaire gratuite.
 * Source WEC/IMSA : PAS DE SOURCE LIVE GRATUITE FIABLE À CE JOUR.
 * Le sélecteur affiche ces séries mais bascule explicitement en mode
 * "non disponible" plutôt que de simuler des données.
 */

const OPENF1 = 'https://api.openf1.org/v1';
const POLL_MS = 5000;
const STALE_AFTER_MS = 15000;
const DOWN_AFTER_MS = 60000;

const state = {
  series: 'f1',
  sessionKey: null,
  drivers: new Map(),      // driver_number -> {name_acronym, team_name, team_colour, full_name}
  positions: new Map(),    // driver_number -> position
  intervals: new Map(),    // driver_number -> {gap_to_leader, interval}
  laps: new Map(),         // driver_number -> {last, best, s1, s2, s3}
  stints: new Map(),       // driver_number -> {compound, tyre_age, stops}
  location: new Map(),     // driver_number -> {x, y}
  weather: null,
  raceControlSeen: new Set(),
  selectedDriver: null,
  lastSuccessfulFetch: 0,
};

const el = (id) => document.getElementById(id);

function fmtGap(v){
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v; // e.g. "LAP 1"
  return '+' + v.toFixed(3);
}
function fmtLap(v){
  if (v === null || v === undefined) return null;
  const m = Math.floor(v / 60);
  const s = (v % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

async function fetchJSON(path){
  const res = await fetch(OPENF1 + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ---------- Data refresh ---------- */

async function ensureSession(){
  try {
    const sessions = await fetchJSON('/sessions?session_key=latest');
    if (!sessions || !sessions.length){
      state.sessionKey = null;
      return null;
    }
    const s = sessions[0];
    state.sessionKey = s.session_key;
    el('sessionName').textContent = `${s.circuit_short_name} — ${s.session_name}`;
    el('sessionMeta').textContent = `${s.country_name} · ${s.session_type}`;
    return s;
  } catch (e){
    state.sessionKey = null;
    el('sessionMeta').textContent = 'Impossible de joindre OpenF1.';
    return null;
  }
}

async function refreshDrivers(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/drivers?session_key=${state.sessionKey}`);
    rows.forEach(d => state.drivers.set(d.driver_number, d));
  } catch(e){ /* garde la liste précédente, ne pas inventer */ }
}

async function refreshPositions(){
  if (!state.sessionKey) return null;
  try {
    const rows = await fetchJSON(`/position?session_key=${state.sessionKey}&limit=200`);
    if (!rows.length) return false;
    // garder la dernière position connue par pilote
    const latestByDriver = new Map();
    rows.forEach(r => {
      const prev = latestByDriver.get(r.driver_number);
      if (!prev || new Date(r.date) > new Date(prev.date)) latestByDriver.set(r.driver_number, r);
    });
    state.positions.clear();
    latestByDriver.forEach((v,k) => state.positions.set(k, v.position));
    return true;
  } catch(e){ return false; }
}

async function refreshIntervals(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/intervals?session_key=${state.sessionKey}&limit=200`);
    const latestByDriver = new Map();
    rows.forEach(r => {
      const prev = latestByDriver.get(r.driver_number);
      if (!prev || new Date(r.date) > new Date(prev.date)) latestByDriver.set(r.driver_number, r);
    });
    latestByDriver.forEach((v,k) => state.intervals.set(k, v));
  } catch(e){ /* pas de données -> on laisse tel quel, affiché comme périmé plus bas */ }
}

async function refreshLaps(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/laps?session_key=${state.sessionKey}&limit=300`);
    const byDriver = new Map();
    rows.forEach(r => {
      const cur = byDriver.get(r.driver_number);
      if (!cur || r.lap_number > cur.lap_number) byDriver.set(r.driver_number, r);
    });
    byDriver.forEach((r,k) => {
      const prevBest = state.laps.get(k)?.best;
      const best = (prevBest !== undefined && (!r.lap_duration || prevBest < r.lap_duration)) ? prevBest : r.lap_duration;
      state.laps.set(k, {
        last: r.lap_duration ?? null,
        best: best ?? null,
        s1: r.duration_sector_1 ?? null,
        s2: r.duration_sector_2 ?? null,
        s3: r.duration_sector_3 ?? null,
      });
    });
  } catch(e){ /* silencieux, on garde le dernier connu affiché comme "dernier tour connu" */ }
}

async function refreshStints(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/stints?session_key=${state.sessionKey}`);
    const byDriver = new Map();
    rows.forEach(r => {
      const cur = byDriver.get(r.driver_number);
      if (!cur || r.stint_number > cur.stint_number) byDriver.set(r.driver_number, r);
    });
    const stops = new Map();
    rows.forEach(r => stops.set(r.driver_number, Math.max(stops.get(r.driver_number) || 0, r.stint_number - 1)));
    byDriver.forEach((r,k) => {
      state.stints.set(k, {
        compound: r.compound || null,
        tyreAge: (r.tyre_age_at_start !== undefined && r.lap_end !== undefined && r.lap_start !== undefined)
          ? (r.tyre_age_at_start + (r.lap_end - r.lap_start)) : null,
        stops: stops.get(k) ?? null,
      });
    });
  } catch(e){ /* pas de données */ }
}

async function refreshLocation(){
  if (!state.sessionKey) return false;
  try {
    const since = new Date(Date.now() - 8000).toISOString();
    const rows = await fetchJSON(`/location?session_key=${state.sessionKey}&date%3E=${encodeURIComponent(since)}`);
    if (!rows.length) return false;
    const latestByDriver = new Map();
    rows.forEach(r => {
      const prev = latestByDriver.get(r.driver_number);
      if (!prev || new Date(r.date) > new Date(prev.date)) latestByDriver.set(r.driver_number, r);
    });
    state.location.clear();
    latestByDriver.forEach((v,k) => state.location.set(k, v));
    return true;
  } catch(e){ return false; }
}

async function refreshWeather(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/weather?session_key=${state.sessionKey}&limit=1`);
    state.weather = rows.length ? rows[rows.length - 1] : null;
  } catch(e){ state.weather = null; }
}

async function refreshRaceControl(){
  if (!state.sessionKey) return;
  try {
    const rows = await fetchJSON(`/race_control?session_key=${state.sessionKey}&limit=30`);
    rows.forEach(r => {
      const id = r.date + '|' + r.message;
      if (!state.raceControlSeen.has(id)){
        state.raceControlSeen.add(id);
        pushRadioMessage(r);
      }
      if (r.category === 'Flag') updateFlagBadge(r.flag);
    });
  } catch(e){ /* silencieux */ }
}

/* ---------- Rendering ---------- */

function updateFlagBadge(flag){
  const badge = el('flagBadge');
  if (!flag){ badge.textContent = '—'; badge.className = 'panel-flag'; return; }
  const f = flag.toUpperCase();
  badge.textContent = f;
  badge.className = 'panel-flag';
  if (f.includes('GREEN')) badge.classList.add('green');
  else if (f.includes('YELLOW')) badge.classList.add('yellow');
  else if (f.includes('RED')) badge.classList.add('red');
  else if (f.includes('SAFETY') || f.includes('VSC')) badge.classList.add('sc');
}

function pushRadioMessage(r){
  const feed = el('radioFeed');
  const emptyRow = feed.querySelector('.empty-row');
  if (emptyRow) emptyRow.remove();
  const li = document.createElement('li');
  const t = new Date(r.date);
  const time = t.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  li.innerHTML = `<span class="rtime">${time}</span>${escapeHtml(r.message || '')}`;
  if (r.flag){
    const f = r.flag.toUpperCase();
    if (f.includes('RED')) li.classList.add('flag-red');
    else if (f.includes('YELLOW')) li.classList.add('flag-yellow');
    else if (f.includes('GREEN')) li.classList.add('flag-green');
  }
  feed.prepend(li);
  while (feed.children.length > 40) feed.removeChild(feed.lastChild);
  el('radioFreshness').textContent = 'MAJ ' + time;
}

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderTower(){
  const body = el('towerBody');
  if (!state.sessionKey || state.positions.size === 0){
    body.innerHTML = `<tr class="empty-row"><td colspan="7">${state.sessionKey ? 'Aucune position reçue pour le moment.' : 'Aucune session live en cours.'}</td></tr>`;
    return;
  }
  const rows = [...state.positions.entries()].sort((a,b) => a[1]-b[1]);
  body.innerHTML = '';
  rows.forEach(([num, pos]) => {
    const driver = state.drivers.get(num);
    const interval = state.intervals.get(num);
    const lap = state.laps.get(num);
    const stint = state.stints.get(num);
    const tr = document.createElement('tr');
    if (state.selectedDriver === num) tr.classList.add('selected');
    tr.innerHTML = `
      <td class="pos">${pos}</td>
      <td class="driver">
        <span class="team-bar" style="background:${driver?.team_colour ? '#'+driver.team_colour : '#3A414C'}"></span>
        ${driver ? escapeHtml(driver.name_acronym || driver.broadcast_name || ('#'+num)) : ('#'+num)}
      </td>
      <td class="mono">${valOrNA(fmtGap(interval?.gap_to_leader))}</td>
      <td class="mono">${valOrNA(fmtGap(interval?.interval))}</td>
      <td class="mono">${valOrNA(fmtLap(lap?.last))}</td>
      <td class="mono">${valOrNA(stint?.compound)}</td>
      <td class="mono">${stint?.stops ?? '<span class="na">—</span>'}</td>
    `;
    tr.addEventListener('click', () => {
      state.selectedDriver = num;
      renderTower();
      renderDetail();
    });
    body.appendChild(tr);
  });
  el('towerFreshness').textContent = 'MAJ ' + new Date().toLocaleTimeString('fr-FR');
}

function valOrNA(v){
  return (v === null || v === undefined || v === '') ? '<span class="na">—</span>' : v;
}

function renderDetail(){
  const num = state.selectedDriver;
  if (!num || !state.positions.has(num)){
    el('detailEmpty').classList.remove('hidden');
    el('detailBody').classList.add('hidden');
    return;
  }
  el('detailEmpty').classList.add('hidden');
  el('detailBody').classList.remove('hidden');

  const driver = state.drivers.get(num);
  const pos = state.positions.get(num);
  const interval = state.intervals.get(num);
  const lap = state.laps.get(num);
  const stint = state.stints.get(num);
  const loc = state.location.get(num);

  el('dNumber').textContent = num;
  el('dName').textContent = driver ? (driver.full_name || driver.broadcast_name || ('#'+num)) : ('#'+num);
  el('dTeam').textContent = driver?.team_name || '—';
  el('dPos').innerHTML = pos ?? '<span class="na">—</span>';
  el('dGap').innerHTML = valOrNA(fmtGap(interval?.gap_to_leader));
  el('dInt').innerHTML = valOrNA(fmtGap(interval?.interval));
  el('dLast').innerHTML = valOrNA(fmtLap(lap?.last));
  el('dBest').innerHTML = valOrNA(fmtLap(lap?.best));
  el('dS1').innerHTML = valOrNA(lap?.s1 ? lap.s1.toFixed(3) : null);
  el('dS2').innerHTML = valOrNA(lap?.s2 ? lap.s2.toFixed(3) : null);
  el('dS3').innerHTML = valOrNA(lap?.s3 ? lap.s3.toFixed(3) : null);
  el('dTyre').innerHTML = valOrNA(stint?.compound);
  el('dTyreAge').innerHTML = stint?.tyreAge !== null && stint?.tyreAge !== undefined ? stint.tyreAge + ' tours' : '<span class="na">—</span>';
  el('dStops').innerHTML = stint?.stops ?? '<span class="na">—</span>';
  el('dSpeed').innerHTML = loc ? '<span class="na">position brute (x,y) seulement</span>' : '<span class="na">—</span>';
  el('detailFreshness').textContent = 'MAJ ' + new Date().toLocaleTimeString('fr-FR');
}

function renderWeather(){
  const w = state.weather;
  el('wAir').textContent = w?.air_temperature !== undefined ? w.air_temperature + '°C' : '—';
  el('wTrack').textContent = w?.track_temperature !== undefined ? w.track_temperature + '°C' : '—';
  el('wWind').textContent = w?.wind_speed !== undefined ? w.wind_speed + ' m/s' : '—';
  el('wRain').textContent = w?.rainfall !== undefined ? (w.rainfall ? 'Oui' : 'Non') : '—';
}

function renderMap(){
  const svg = el('trackSvg');
  const empty = el('mapEmpty');
  if (state.location.size === 0){
    empty.classList.remove('hidden');
    svg.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');
  const points = [...state.location.values()];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 8;
  const scaleX = (100 - 2*pad) / (maxX - minX || 1);
  const scaleY = (100 - 2*pad) / (maxY - minY || 1);
  const scale = Math.min(scaleX, scaleY);

  const project = (x,y) => ({
    px: pad + (x - minX) * scale,
    py: pad + (maxY - y) * scale, // inverser Y pour un rendu écran naturel
  });

  let dots = '';
  state.location.forEach((loc, num) => {
    const driver = state.drivers.get(num);
    const {px, py} = project(loc.x, loc.y);
    const color = driver?.team_colour ? '#'+driver.team_colour : '#4C8DFF';
    const label = driver?.name_acronym || num;
    dots += `<circle class="driver-dot" cx="${px}" cy="${py}" r="2.2" fill="${color}"/>`;
    dots += `<text class="driver-label" x="${px}" y="${py+0.9}" text-anchor="middle">${escapeHtml(String(label))}</text>`;
  });
  svg.innerHTML = dots;
}

/* ---------- Status / freshness ---------- */

function setStatus(kind, label){
  const dot = el('statusDot');
  dot.className = 'status-dot ' + kind;
  el('statusLabel').textContent = label;
}

function tickFreshness(){
  const age = Date.now() - state.lastSuccessfulFetch;
  if (!state.lastSuccessfulFetch){
    setStatus('down', 'Aucune donnée');
  } else if (age < STALE_AFTER_MS){
    setStatus('live', 'Live');
  } else if (age < DOWN_AFTER_MS){
    setStatus('stale', `Données figées depuis ${Math.round(age/1000)}s`);
  } else {
    setStatus('down', 'Pas de signal');
  }
  el('lastFetch').textContent = state.lastSuccessfulFetch
    ? 'Dernière donnée reçue à ' + new Date(state.lastSuccessfulFetch).toLocaleTimeString('fr-FR')
    : 'Aucune donnée reçue';
}

/* ---------- Series handling ---------- */

function applySeriesNotice(){
  const notice = el('seriesNotice');
  if (state.series === 'f1'){
    notice.classList.add('hidden');
    return;
  }
  notice.classList.remove('hidden');
  notice.textContent = state.series === 'wec'
    ? "WEC : pas de source de timing live gratuite et fiable disponible actuellement. Aucune donnée n'est affichée pour éviter d'inventer des chiffres."
    : "IMSA : pas de source de timing live gratuite et fiable disponible actuellement. Aucune donnée n'est affichée pour éviter d'inventer des chiffres.";
}

el('seriesSelect').addEventListener('change', (e) => {
  state.series = e.target.value;
  applySeriesNotice();
  if (state.series !== 'f1'){
    state.positions.clear();
    state.location.clear();
    state.lastSuccessfulFetch = 0;
    renderTower(); renderMap(); renderDetail(); tickFreshness();
    el('sessionName').textContent = '—';
    el('sessionMeta').textContent = 'Série non couverte par une source live gratuite.';
  } else {
    loop();
  }
});

/* ---------- Main loop ---------- */

async function loop(){
  if (state.series !== 'f1') return;
  const session = await ensureSession();
  let gotSomething = false;
  if (session){
    await refreshDrivers();
    const posOk = await refreshPositions();
    await refreshIntervals();
    await refreshLaps();
    await refreshStints();
    const locOk = await refreshLocation();
    await refreshWeather();
    await refreshRaceControl();
    gotSomething = posOk || locOk;
  }
  if (gotSomething) state.lastSuccessfulFetch = Date.now();
  renderTower();
  renderDetail();
  renderMap();
  renderWeather();
  tickFreshness();
}

applySeriesNotice();
loop();
setInterval(loop, POLL_MS);
setInterval(tickFreshness, 1000);
