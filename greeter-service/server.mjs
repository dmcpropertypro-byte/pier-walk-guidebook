import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const env = process.env;
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'RESEND_API_KEY', 'FROM_EMAIL', 'GREETER_SIGNING_SECRET'];
const configured = required.every((key) => Boolean(env[key]));
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const text = (res, status, body, type = 'text/html; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
const table = async (name, options = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${name}`, { ...options, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) } });
const previewToken = (claimId) => createHmac('sha256', env.GREETER_SIGNING_SECRET).update(`preview:${claimId}`).digest('hex');
const readBody = async (req) => new Promise((resolve, reject) => { let raw = ''; req.on('data', c => raw += c); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); });
const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendPreviewEmail(claim) {
  const base = env.PUBLIC_BASE_URL || `https://${env.RENDER_EXTERNAL_HOSTNAME}`;
  const preview = `${base}/preview/${claim.id}?token=${claim.preview_token || previewToken(claim.id)}`;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.FROM_EMAIL, to: [claim.contact_email], subject: `Your ${claim.business_name} Website Greeter preview`, html: `<p>Your private greeter preview is ready.</p><p><a href="${preview}">Test your preview</a></p><p>It is not live on your site. Review it first, then approve the embed from the preview page.</p>` }) });
}

async function askGreeter(claim, question) {
  const system = `You are the website greeter for ${claim.business_name}. Use ONLY the approved context below. Never invent facts. If the answer is missing, uncertain, sensitive, asks about customer-specific data, price not explicitly supplied, or a transaction, say you do not have that information and direct them to ${claim.human_escalation}. End with the approved next step: ${claim.primary_cta}. Approved context:\n${claim.approved_context}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5-mini', input: [{ role: 'system', content: system }, { role: 'user', content: question }] }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'AI response failed');
  return body.output_text || 'Please contact our team for help.';
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS' && url.pathname === '/api/public-chat') {
    const origin = req.headers.origin || '';
    res.writeHead(204, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' });
    return res.end();
  }
  if (url.pathname === '/health') return json(res, 200, { ok: true, configured });
  if (url.pathname === '/claim') return text(res, 200, await readFile(new URL('./public/claim.html', import.meta.url)));
  if (url.pathname === '/widget.js') return text(res, 200, await readFile(new URL('./public/widget.js', import.meta.url)), 'application/javascript; charset=utf-8');
  if (!configured) return json(res, 503, { error: 'The greeter service is not configured yet.' });

  try {
    if (req.method === 'POST' && url.pathname === '/api/claims') {
      const data = await readBody(req);
      const requiredFields = ['businessName', 'websiteUrl', 'contactEmail', 'humanEscalation', 'primaryCta', 'approvedContext'];
      if (requiredFields.some(k => !String(data[k] || '').trim())) return json(res, 400, { error: 'Please complete all required fields.' });
      let parsedUrl;
      try { parsedUrl = new URL(data.websiteUrl.trim()); } catch { return json(res, 400, { error: 'Please enter a complete website URL, including https://.' }); }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) return json(res, 400, { error: 'Please enter a public http(s) website URL.' });
      const claim = { id: randomUUID(), business_name: data.businessName.trim(), website_url: parsedUrl.href, contact_name: (data.contactName || '').trim(), contact_email: data.contactEmail.trim(), human_escalation: data.humanEscalation.trim(), primary_cta: data.primaryCta.trim(), public_source_url: (data.publicSourceUrl || '').trim(), approved_context: data.approvedContext.trim(), preview_token: randomUUID(), widget_token: randomUUID(), status: 'preview_ready' };
      const inserted = await table('greeter_claims', { method: 'POST', body: JSON.stringify(claim) });
      if (!inserted.ok) throw new Error('Unable to save the claim.');
      await sendPreviewEmail(claim);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/public-chat') {
      const data = await readBody(req);
      if (!data.claimId || !data.token || !String(data.question || '').trim()) return json(res, 403, { error: 'Invalid greeter request.' });
      const lookup = await table(`greeter_claims?id=eq.${data.claimId}&select=*`); const [claim] = await lookup.json();
      if (!claim || claim.status !== 'approved' || data.token !== claim.widget_token) return json(res, 404, { error: 'This greeter is not active.' });
      const expectedHost = new URL(claim.website_url).host;
      const origin = req.headers.origin;
      let originHost = '';
      try { originHost = origin ? new URL(origin).host : ''; } catch { return json(res, 403, { error: 'This greeter is not authorized for this website.' }); }
      if (originHost !== expectedHost) return json(res, 403, { error: 'This greeter is not authorized for this website.' });
      const answer = await askGreeter(claim, data.question.trim());
      await table('greeter_questions', { method: 'POST', body: JSON.stringify({ claim_id: claim.id, question: data.question.trim(), answer }) });
      res.setHeader('access-control-allow-origin', origin);
      return json(res, 200, { answer });
    }
    if (req.method === 'POST' && url.pathname === '/api/approve') {
      const data = await readBody(req);
      if (!data.claimId || !data.token) return json(res, 403, { error: 'Invalid approval request.' });
      const lookup = await table(`greeter_claims?id=eq.${data.claimId}&select=*`); const [claim] = await lookup.json();
      if (!claim || data.token !== (claim.preview_token || previewToken(data.claimId))) return json(res, 403, { error: 'Invalid approval request.' });
      const updated = await table(`greeter_claims?id=eq.${data.claimId}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() }) });
      if (!updated.ok) throw new Error('Unable to approve greeter.');
      const base = env.PUBLIC_BASE_URL || `https://${env.RENDER_EXTERNAL_HOSTNAME}`;
      return json(res, 200, { embed: `<script src="${base}/widget.js" data-claim="${data.claimId}" data-token="${claim.widget_token}" defer></script>` });
    }
    const previewMatch = url.pathname.match(/^\/preview\/([\w-]+)$/);
    if (previewMatch) {
      const lookup = await table(`greeter_claims?id=eq.${previewMatch[1]}&select=*`);
      const [claim] = await lookup.json();
      if (!claim || claim.status === 'disabled' || url.searchParams.get('token') !== (claim.preview_token || previewToken(claim.id))) return text(res, 404, 'Preview unavailable', 'text/plain');
      return text(res, 200, `<!doctype html><title>${escape(claim.business_name)} preview</title><style>body{font:16px system-ui;background:#071d29;color:#fff;max-width:720px;margin:3rem auto;padding:1rem}#chat{min-height:260px;background:#103444;padding:1rem;border-radius:12px}input,button,textarea{padding:12px;font:inherit}input{width:68%}button{background:#fb7b20;border:0;border-radius:6px;font-weight:bold;margin:4px}textarea{width:100%;min-height:90px}</style><h1>Private preview: ${escape(claim.business_name)}</h1><p>Test this before installation. It uses only your approved context. Nothing becomes live until you approve it.</p><div id="chat"></div><p><input id="q" placeholder="Ask a customer question"><button onclick="ask()">Ask</button></p><hr><button onclick="approve()">Approve and get my embed</button><textarea id="embed" hidden readonly></textarea><script>const previewToken='${claim.preview_token || previewToken(claim.id)}';async function ask(){const q=document.querySelector('#q'),c=document.querySelector('#chat');if(!q.value)return;c.innerHTML+=\`<p><b>You:</b> \${q.value}</p>\`;const r=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({claimId:'${claim.id}',token:previewToken,question:q.value})});const b=await r.json();c.innerHTML+=\`<p><b>Greeter:</b> \${b.answer||b.error}</p>\`;q.value=''}async function approve(){const r=await fetch('/api/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({claimId:'${claim.id}',token:previewToken})});const b=await r.json();const e=document.querySelector('#embed');e.hidden=false;e.value=b.embed||b.error}</script>`);
    }
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const data = await readBody(req);
      if (!data.claimId || !data.token || !String(data.question || '').trim()) return json(res, 403, { error: 'Invalid preview request.' });
      const lookup = await table(`greeter_claims?id=eq.${data.claimId}&select=*`); const [claim] = await lookup.json();
      if (!claim || claim.status === 'disabled' || data.token !== (claim.preview_token || previewToken(claim.id))) return json(res, 404, { error: 'Preview unavailable.' });
      const answer = await askGreeter(claim, data.question.trim());
      await table('greeter_questions', { method: 'POST', body: JSON.stringify({ claim_id: claim.id, question: data.question.trim(), answer }) });
      return json(res, 200, { answer });
    }
    return text(res, 404, 'Not found', 'text/plain');
  } catch (error) { console.error(error); return json(res, 500, { error: 'The request could not be completed. Please try again.' }); }
}).listen(Number(env.PORT || 3000));
