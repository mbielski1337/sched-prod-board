import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('.error');
const board = document.querySelector('[data-testid="board"]');

const incidents = new Map();
const rows = new Map();
const acked = new Set();
let loaded = false;
let selectedId = null;
let panel = null;

const timeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function localTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : timeFormat.format(date);
}

function esc(value) {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}

function buildRow(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.setAttribute('data-testid', 'incident-row');
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  li.tabIndex = 0;
  li.innerHTML = `
    <span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
    <span class="action"></span>`;
  return li;
}

function setAction(li, id) {
  const slot = li.querySelector('.action');
  const has = slot.querySelector('[data-testid="acked"]');
  if (acked.has(id) && !has) {
    slot.innerHTML = '<span data-testid="acked" class="acked">✓ acked</span>';
  }
  li.classList.toggle('selected', id === selectedId);
}

function closePanel() {
  selectedId = null;
  if (panel) panel.remove();
  panel = null;
  for (const li of rows.values()) li.classList.remove('selected');
}

function renderPanel() {
  const i = selectedId && incidents.get(selectedId);
  if (!i) {
    if (panel) closePanel();
    return;
  }
  if (!panel) {
    panel = document.createElement('aside');
    panel.setAttribute('data-testid', 'incident-panel');
    panel.className = 'panel';
    board.append(panel);
  }
  if (panel.dataset.id !== i.id) {
    panel.dataset.id = i.id;
    panel.innerHTML = `
      <h2>${esc(i.id)}</h2>
      <p class="meta">${esc(i.severity)} · ${esc(i.service)} · ${esc(i.region)}</p>
      <p class="summary">${esc(i.summary)}</p>
      <p class="meta">opened <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time></p>
      <p class="buttons">
        <button type="button" data-testid="panel-ack" class="primary">Ack ${esc(i.id)}</button>
        <button type="button" class="close">Close</button>
      </p>`;
  }
  const button = panel.querySelector('[data-testid="panel-ack"]');
  const done = acked.has(i.id);
  button.disabled = done;
  button.textContent = done ? `${i.id} acked` : `Ack ${i.id}`;
}

function select(id) {
  selectedId = id;
  renderPanel();
  render();
}

function render() {
  const sorted = [...incidents.values()].sort(
    (a, b) => new Date(b.openedAt) - new Date(a.openedAt),
  );
  const ordered = sorted.map((i) => {
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      rows.set(i.id, li);
    }
    setAction(li, i.id);
    return li;
  });
  const same =
    list.children.length === ordered.length &&
    ordered.every((li, n) => list.children[n] === li);
  if (!same) list.replaceChildren(...ordered);
  loader.hidden = loaded;
  empty.hidden = !loaded || ordered.length > 0;
  renderPanel();
}

list.addEventListener('click', (event) => {
  const li = event.target.closest('[data-testid="incident-row"]');
  if (li) select(li.dataset.id);
});

list.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const li = event.target.closest('[data-testid="incident-row"]');
  if (!li) return;
  event.preventDefault();
  select(li.dataset.id);
});

board.addEventListener('click', async (event) => {
  if (event.target.closest('.close')) {
    closePanel();
    return;
  }
  const button = event.target.closest('[data-testid="panel-ack"]');
  if (!button || !panel) return;
  const id = panel.dataset.id;
  button.disabled = true;
  try {
    await ack(id);
    acked.add(id);
    errorBox.hidden = true;
    render();
  } catch (err) {
    button.disabled = false;
    errorBox.textContent = `Ack failed: ${err.message}`;
    errorBox.hidden = false;
  }
});

async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) incidents.set(i.id, i);
    loaded = true;
    if (errorBox.textContent.startsWith('Could not')) errorBox.hidden = true;
    render();
  } catch (err) {
    errorBox.textContent = `Could not refresh: ${err.message}`;
    errorBox.hidden = false;
  } finally {
    setTimeout(refresh, REFRESH_MS);
  }
}

refresh();
