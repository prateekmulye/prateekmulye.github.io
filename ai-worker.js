import { hybridMatches, validateQuery } from './search.js';

let extractor;
let records;
let vectors;
let busy = false;
const respond = (requestId, type, fields = {}) => self.postMessage({ type, requestId, ...fields });

self.onmessage = async ({ data }) => {
  if (!data || !['init', 'query'].includes(data.type) || !Number.isSafeInteger(data.requestId)) return;
  const { requestId, type } = data;
  if (busy) return respond(requestId, 'error', { code: 'busy', message: 'Search is already running.' });
  if (type === 'query') {
    const validation = validateQuery(data.query);
    if (!validation.valid) return respond(requestId, 'error', { code: validation.code, message: 'Use a public engineering topic, up to 600 characters.' });
    if (!extractor || !vectors) return respond(requestId, 'error', { code: 'not-ready', message: 'Enable on-device AI search first.' });
  }
  busy = true;
  try {
    if (type === 'init') {
      if (!extractor || !vectors) {
        respond(requestId, 'progress', { stage: 'download' });
        const { pipeline, env } = await import('./vendor/transformers.min.js');
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = new URL('./models/', self.location.href).href;
        env.useBrowserCache = true; // Only public model assets; no queries or results.
        env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', self.location.href).href;
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.proxy = false;
        const response = await fetch(new URL('./evidence.json', self.location.href));
        if (!response.ok) throw new Error('Corpus unavailable');
        records = await response.json();
        if (!Array.isArray(records) || records.length !== 7 || new Set(records.map((record) => record.id)).size !== 7) throw new Error('Invalid corpus');
        extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          dtype: 'q8', device: 'wasm',
          progress_callback: (event) => {
            if (event.status === 'progress') respond(requestId, 'progress', { stage: 'download', file: event.file, loaded: event.loaded, total: event.total, progress: event.progress });
          },
        });
        respond(requestId, 'progress', { stage: 'prepare' });
        const embedded = await extractor(records.map((record) => `${record.title}. ${record.text}`), { pooling: 'mean', normalize: true });
        vectors = embedded.tolist();
      }
      respond(requestId, 'ready');
    } else {
      const embedded = await extractor(data.query.trim(), { pooling: 'mean', normalize: true });
      respond(requestId, 'results', { recordIds: hybridMatches(data.query, embedded.tolist()[0], vectors, records) });
    }
  } catch {
    if (type === 'init') { extractor = undefined; vectors = undefined; }
    respond(requestId, 'error', { code: 'unavailable', message: 'On-device AI search is unavailable here. Keyword search still works.' });
  } finally { busy = false; }
};
