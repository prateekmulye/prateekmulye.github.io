import { keywordSearch, validateQuery } from './search.js';

const $ = (id) => document.getElementById(id);
const input = $('query');
const status = $('search-status');
let records = [];
let worker;
let ready = false;
let operation;
let sequence = 0;
let deadline;
let manifestReady = false;

function controls() {
  $('mode').textContent = ready ? 'On-device AI search' : 'Keyword search';
  $('submit').disabled = operation?.type === 'query';
  $('enable-ai').disabled = !manifestReady || Boolean(operation) || ready;
  $('cancel').hidden = !operation;
  $('cancel').textContent = operation?.type === 'query' ? 'Cancel AI search' : 'Cancel AI setup';
  $('keyword').hidden = !ready && !operation;
}

function stopWorker() {
  clearTimeout(deadline);
  sequence += 1;
  worker?.terminate();
  worker = undefined;
  operation = undefined;
  ready = false;
  controls();
}

function fail(message) {
  stopWorker();
  status.textContent = message;
  $('enable-ai').textContent = 'Retry on-device AI setup';
}

function showResults(ids, mode) {
  const known = new Map(records.map((record) => [record.id, record]));
  const matches = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => known.has(id)).slice(0, 3);
  $('result-list').replaceChildren();
  for (const id of matches) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.textContent = known.get(id).title;
    item.append(link);
    $('result-list').append(item);
  }
  $('results').hidden = matches.length === 0;
  $('results-title').textContent = `Matching evidence · ${mode}`;
  status.textContent = matches.length ? `${matches.length} matching ${matches.length === 1 ? 'record' : 'records'} found using ${mode}. Follow a link to inspect its source and limits.` : `No matching record using ${mode}. Try another topic or browse the evidence.`;
}

function validatedQuery() {
  const validation = validateQuery(input.value);
  input.removeAttribute('aria-invalid');
  if (validation.valid) return input.value;
  const messages = {
    'empty-query': 'Enter a topic or browse the evidence below.',
    'query-too-long': 'Keep your topic within 600 characters.',
    'outside-scope': 'This index covers public engineering work. Browse the records below for other context.',
  };
  status.textContent = messages[validation.code] || 'Enter a public engineering topic, up to 600 characters.';
  input.setAttribute('aria-invalid', 'true');
  input.focus();
  return null;
}

function search() {
  const query = validatedQuery();
  if (query === null || operation?.type === 'query') return;
  if (!ready) {
    showResults(keywordSearch(query, records), 'keyword search');
    return;
  }
  operation = { type: 'query', id: ++sequence, query };
  status.textContent = 'Finding relevant evidence with on-device AI…';
  controls();
  worker.postMessage({ type: 'query', requestId: operation.id, query });
  deadline = setTimeout(() => fail('AI search timed out. Your previous results remain available. Use Find evidence for keyword search, or retry AI setup.'), 20_000);
}

function startAI() {
  if (!manifestReady || operation || ready) return;
  try {
    worker = new Worker('./ai-worker.js', { type: 'module' });
    operation = { type: 'init', id: ++sequence };
    status.textContent = 'Downloading the search model… You can keep browsing or use keyword search.';
    controls();
    worker.onmessage = ({ data }) => {
      if (!data || !operation || data.requestId !== operation.id) return;
      if (data.type === 'progress') {
        // Only real stages are announced. Per-file bytes are not a whole-download percentage.
        const message = data.stage === 'prepare' ? 'Preparing on-device search… Keyword search remains available.' : 'Downloading the search model… Keyword search remains available.';
        if (status.textContent !== message) status.textContent = message;
      } else if (data.type === 'ready' && operation.type === 'init') {
        clearTimeout(deadline);
        operation = undefined;
        ready = true;
        controls();
        status.textContent = 'On-device AI search ready. Enter a topic and choose Find evidence.';
      } else if (data.type === 'results' && operation.type === 'query') {
        const searchedQuery = operation.query;
        clearTimeout(deadline);
        operation = undefined;
        controls();
        if (searchedQuery === input.value) showResults(data.recordIds, 'on-device AI search');
      } else if (data.type === 'error') {
        fail('On-device AI search is unavailable here. Your previous results remain available. Use Find evidence for keyword search, or retry AI setup.');
      }
    };
    worker.onerror = () => fail('On-device AI search is unavailable here. Keyword search still works. You can retry AI setup.');
    worker.onmessageerror = () => fail('AI search could not return a result. Keyword search still works. You can retry AI setup.');
    worker.postMessage({ type: 'init', requestId: operation.id });
    deadline = setTimeout(() => fail('AI setup timed out. Keyword search still works. You can retry AI setup.'), 120_000);
  } catch {
    fail('On-device AI search is unavailable in this browser. Keyword search still works.');
  }
}

$('search-form').addEventListener('submit', (event) => { event.preventDefault(); search(); });
$('enable-ai').addEventListener('click', startAI);
$('cancel').addEventListener('click', () => {
  const setup = operation?.type === 'init';
  stopWorker();
  status.textContent = setup ? 'AI setup cancelled. The browser may finish requests already in progress. Keyword search is available.' : 'AI search cancelled. Keyword search is available.';
});
$('keyword').addEventListener('click', () => {
  stopWorker();
  status.textContent = 'Keyword search selected. Choose Find evidence to search your topic.';
});
$('clear').addEventListener('click', () => {
  if (operation?.type === 'query') stopWorker();
  input.value = '';
  input.removeAttribute('aria-invalid');
  $('result-list').replaceChildren();
  $('results').hidden = true;
  status.textContent = operation?.type === 'init' ? 'Search cleared. AI setup continues; Cancel AI setup is available.' : 'Search cleared. Enter a topic or browse the evidence below.';
  input.focus();
});
input.addEventListener('input', () => {
  input.removeAttribute('aria-invalid');
  if (operation?.type === 'query') {
    stopWorker();
    status.textContent = 'Previous AI search cancelled because your topic changed. Keyword search is available; you can enable AI again.';
  }
  if (!$('results').hidden) {
    $('results').hidden = true;
    $('result-list').replaceChildren();
  }
});

async function setup() {
  try {
    const response = await fetch('./evidence.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Evidence unavailable');
    const data = await response.json();
    if (!Array.isArray(data) || data.length !== 7 || new Set(data.map((record) => record.id)).size !== 7 || data.some((record) => !document.getElementById(record.id) || typeof record.title !== 'string' || typeof record.text !== 'string')) throw new Error('Evidence invalid');
    records = data;
    $('finder').hidden = false;
    const manifest = await fetch('./asset-manifest.json', { signal: AbortSignal.timeout(10_000) });
    if (!manifest.ok) throw new Error('Model manifest unavailable');
    const { downloadBytes } = await manifest.json();
    if (!Number.isSafeInteger(downloadBytes) || downloadBytes <= 0 || downloadBytes > 100_000_000) throw new Error('Download size unavailable');
    manifestReady = typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
    $('ai-help').textContent = manifestReady ? `Optional: downloads about ${(downloadBytes / 1_000_000).toFixed(1)} MB from this site. AI matches meaning and checks exact terms on your device. Setup may take time. No search history is saved. Public model files may be cached by your browser.` : 'This browser does not support on-device search. Keyword search is available.';
    controls();
  } catch {
    $('ai-help').textContent = 'On-device AI search is unavailable here. Keyword search and the records below remain available.';
  }
}

setup();
