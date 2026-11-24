import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000;

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('.error');

const incidents = new Map();
const rows = new Map();
const acked = new Set();
let loaded = false;

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
  if (acked.has(id)) {
    slot.innerHTML = '<span data-testid="acked" class="acked">✓ acked</span>';
    return;
  }
  if (slot.querySelector('[data-testid="ack"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-testid', 'ack');
  button.textContent = 'Ack';
  slot.replaceChildren(button);
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
}

list.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button) return;
  const li = button.closest('[data-testid="incident-row"]');
  const id = li.dataset.id;
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
