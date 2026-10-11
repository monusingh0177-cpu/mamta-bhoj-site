'use strict';
// Optional AI step. Four modes: openai (any OpenAI-compatible chat API), anthropic (Messages API),
// claude-cli, and none (report-only). The model only ever sees the minimal page/query context needed for one
// SEO decision - never .env, credentials, customer data, admin data, payroll data, uploads or data/ files.
// Its answer must be a JSON patch object; it is validated by lib/patch.js before anything is applied.
const { spawnSync } = require('child_process');
const { request } = require('./util');

const RULES = [
  'Company: Devmam Flourish Foods LLP, brand Mamta Bhoj. One flour mill at Chaubepur, Kanpur Nagar, Uttar Pradesh. Products: Fresh Chakki Atta, Tandoori Atta, Maida, Sooji/Rava, Besan, in 1 kg, 2 kg and 5 kg packs. Certifications: ISO 9001:2015 and an FSSAI State Licence only.',
  'Goal: qualified B2B enquiries. Write for people first; no keyword stuffing; no exact-match repetition.',
  'NEVER state or imply: prices, minimum order quantities, delivery times, capacity, other certifications, reviews/ratings, customer names, offices or locations other than Kanpur/Uttar Pradesh, private-label/OEM/contract manufacturing, or lab-verified claims (except the existing approved Chakki Atta wording).',
  'Change one thing only, in the smallest way that fixes the opportunity. Titles 25-60 characters, meta descriptions 110-160 characters.',
  'Reply with ONE JSON object and nothing else: {"decisions":[{"page":"/path","kind":"title|description|copy","file":"views/....js","find":"EXACT existing text, copied verbatim from the source block, occurring once","replace":"new text","rationale":"one sentence","confidence":0.0-1.0}]}. Return {"decisions":[]} if no safe improvement exists.',
];

function buildPrompt(ctx) {
  const o = ctx.opportunity; const pg = ctx.page;
  return [
    'You are an SEO copy assistant working under strict rules.', ...RULES.map((r) => '- ' + r), '',
    `Search opportunity: query "${o.query}" (${o.kind}), impressions ${o.impressions}, clicks ${o.clicks}, CTR ${o.ctr}, average position ${o.position}. Flags: ${o.flags.join(', ') || 'none'}.`,
    `Target page: ${ctx.path}`, `Current title: ${pg.title}`, `Current meta description: ${pg.description}`, `Current H1: ${pg.h1.join(' | ')}`, `Current H2/H3: ${(pg.headings || []).slice(0, 14).map((h) => h.text).join(' | ')}`, '',
    `Editable source block (file ${ctx.block.file}). "find" MUST be copied verbatim from this block:`, '"""', ctx.block.text.slice(0, 4000), '"""',
  ].join('\n');
}

function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (e) { /* try fenced or embedded */ }
  const m = t.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (e) { /* fallthrough */ } }
  return null;
}

async function propose(cfg, ctx) {
  const mode = cfg.ai.mode; const prompt = buildPrompt(ctx);
  if (mode === 'none' || !mode) return { skipped: true, reason: 'no AI integration configured (report-only)' };
  try {
    let text = '';
    if (mode === 'openai') {
      if (!cfg.ai.baseUrl || !cfg.ai.apiKey || !cfg.ai.model) return { skipped: true, reason: 'OpenAI-compatible mode needs AUTOPILOT_AI_BASE_URL, _MODEL and _API_KEY' };
      const r = await request(cfg.ai.baseUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.ai.apiKey}` }, timeoutMs: 120000, body: JSON.stringify({ model: cfg.ai.model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }) });
      if (r.status !== 200) return { error: `AI API HTTP ${r.status}` };
      text = (((JSON.parse(r.body).choices || [])[0] || {}).message || {}).content || '';
    } else if (mode === 'anthropic') {
      if (!cfg.ai.apiKey || !cfg.ai.model) return { skipped: true, reason: 'Anthropic mode needs AUTOPILOT_AI_API_KEY and AUTOPILOT_AI_MODEL' };
      const base = (cfg.ai.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
      const r = await request(base + '/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.ai.apiKey, 'anthropic-version': '2023-06-01' }, timeoutMs: 120000, body: JSON.stringify({ model: cfg.ai.model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }) });
      if (r.status !== 200) return { error: `AI API HTTP ${r.status}` };
      text = ((JSON.parse(r.body).content || [])[0] || {}).text || '';
    } else if (mode === 'claude-cli') {
      const r = spawnSync(cfg.ai.cliPath, ['-p', '--output-format', 'text'], { input: prompt, encoding: 'utf8', timeout: 180000, cwd: require('os').tmpdir(), env: Object.assign({}, process.env, { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '' }) });
      if (r.error || r.status !== 0) return { error: 'claude CLI is not installed/authenticated or failed' };
      text = r.stdout;
    } else return { skipped: true, reason: `unknown AI mode "${mode}"` };
    const j = extractJson(text);
    if (!j || !Array.isArray(j.decisions)) return { error: 'AI output was not the required JSON patch object' };
    return { decisions: j.decisions.slice(0, 3) };
  } catch (e) { return { error: `AI step failed: ${String(e.message).slice(0, 120)}` }; }
}

module.exports = { propose, buildPrompt, extractJson };
