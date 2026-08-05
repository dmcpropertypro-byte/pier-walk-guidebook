const env = process.env;
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'FROM_EMAIL'];
if (required.some((key) => !env[key])) throw new Error('Missing required reporting environment variables.');

const table = (name) => fetch(`${env.SUPABASE_URL}/rest/v1/${name}`, {
  headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
});
const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const claimsResponse = await table('greeter_claims?status=eq.approved&select=id,business_name,contact_email,human_escalation');
if (!claimsResponse.ok) throw new Error('Could not load approved greeters.');
const claims = await claimsResponse.json();

for (const claim of claims) {
  const q = await table(`greeter_questions?claim_id=eq.${claim.id}&created_at=gte.${since}&select=question,answer,created_at&order=created_at.desc`);
  if (!q.ok) continue;
  const questions = await q.json();
  const rows = questions.length
    ? questions.map((item) => `<li><strong>Question:</strong> ${escape(item.question)}<br><strong>Greeter:</strong> ${escape(item.answer)}</li>`).join('')
    : '<li>No questions this week.</li>';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [claim.contact_email],
      subject: `${claim.business_name}: your weekly Website Greeter report`,
      html: `<h1>Weekly Website Greeter report</h1><p>${questions.length} question${questions.length === 1 ? '' : 's'} this week.</p><ol>${rows}</ol><p>Use repeated questions to improve your approved context. Contact: ${escape(claim.human_escalation)}</p>`
    })
  });
}

function escape(value = '') { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
