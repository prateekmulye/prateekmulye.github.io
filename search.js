export const MAX_QUERY_LENGTH = 600;
export const MIN_SIMILARITY = 0.28; // Development-set calibration; not factual confidence.

export function validateQuery(query) {
  if (typeof query !== 'string') return { valid: false, code: 'invalid-query' };
  if (query.length > MAX_QUERY_LENGTH) return { valid: false, code: 'query-too-long' };
  if (!query.trim()) return { valid: false, code: 'empty-query' };
  const text = query.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Supplemental boundary only: private records never enter the corpus.
  const privateTopic = /\b(?:relocat\w*|sponsor\w*|visa|immigra\w*|salary|compensation|work[- ]authori[sz]\w*|job[- ]search|seeking|hiring|job[- ]hunt\w*|home address|phone number)\b/.test(text) ||
    /\b(?:next job|next role|staff role|staff engineer|career plan|authorized to work|authorised to work)\b/.test(text) ||
    /\b(?:available for|open to|looking for)\b.{0,60}\b(?:work|roles?|jobs?|opportunit\w*|positions?|employment)\b/.test(text) ||
    /\b(?:where|when)\b.{0,60}\b(?:move|moving|work next|live next)\b/.test(text) ||
    /\b(?:will|would|can|could|does)\b.{0,20}\b(?:he|prateek)\b.{0,20}\b(?:move|moving)\b/.test(text) ||
    /\b(?:want|plan|intend|prefer)\w*\b.{0,60}\b(?:work|live|country|countries|city|cities|roles?|jobs?|europe|us|eu)\b/.test(text) ||
    /\b(?:country|countries|city|cities|destination)\b.{0,60}\b(?:prefer|plan|intend|next|target)\w*\b/.test(text);
  return privateTopic ? { valid: false, code: 'outside-scope' } : { valid: true };
}

const normalize = (text) => text.toLowerCase().replace(/\bpostgres\b/g, 'postgresql').replace(/\brag\b/g, 'retrieval').replace(/\bagents\b/g, 'agent').replace(/\bevals?\b/g, 'evaluation');
function keywordRanking(query, records) {
  const words = [...new Set(normalize(query).match(/[a-z0-9]+/g) ?? [])].filter((word) => word.length > 2 && !/^(the|and|for|was|has|his|her|how|what|who|why|where|when|does|did|can|you|about|with|this|that|prateek|mulye|show|tell|work|worked|evidence|records?)$/.test(word));
  const ranked = records.map((record) => {
    const terms = new Set(normalize(record.title + ' ' + record.text).match(/[a-z0-9]+/g) ?? []);
    if (record.id === 'ai-orchestration') terms.add('agent');
    return { id: record.id, score: words.filter((word) => terms.has(word)).length };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  return { ranked, termCount: words.length };
}

export function keywordSearch(query, records) {
  if (!validateQuery(query).valid) return [];
  return keywordRanking(query, records).ranked.slice(0, 3).map(({ id }) => id);
}

export function cosine(a, b) {
  if (!a.length || a.length !== b.length) return -1;
  let dot = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return -1;
    dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : -1;
}

export function semanticMatches(queryVector, documentVectors, records) {
  if (documentVectors.length !== records.length) throw new Error('Corpus/vector mismatch');
  const ranked = records.map((record, i) => ({ id: record.id, score: cosine(queryVector, documentVectors[i]) })).sort((a, b) => b.score - a.score);
  const best = ranked[0]?.score ?? -1;
  return ranked.filter(({ score }) => score >= MIN_SIMILARITY && score >= best - 0.10).slice(0, 3).map(({ id }) => id);
}

export function hybridMatches(query, queryVector, documentVectors, records) {
  if (!validateQuery(query).valid) return [];
  const semantic = semanticMatches(queryVector, documentVectors, records);
  const { ranked, termCount } = keywordRanking(query, records);
  const best = ranked[0];
  // Exact terminology can recover a record excluded by the semantic score gap.
  const strong = best && best.score >= 2 && best.score * 2 >= termCount && best.score > (ranked[1]?.score ?? 0);
  if (!strong || semantic.includes(best.id)) return semantic;
  return [...semantic.slice(0, 2), best.id];
}
