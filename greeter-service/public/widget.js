(() => {
  const script = document.currentScript;
  const claimId = script?.dataset.claim;
  const token = script?.dataset.token;
  if (!claimId || !token) return;
  const host = new URL(script.src).origin;
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;font:14px system-ui';
  root.innerHTML = '<button aria-label="Ask a question" style="background:#fb7b20;color:#071d29;border:0;border-radius:999px;padding:14px 18px;font-weight:800;cursor:pointer">Ask us</button><div hidden style="width:320px;margin-bottom:8px;background:#103444;color:#fff;border-radius:14px;padding:14px;box-shadow:0 12px 40px #0008"><div class="glog" style="min-height:120px;max-height:260px;overflow:auto"></div><form><input aria-label="Your question" placeholder="How can we help?" style="box-sizing:border-box;width:100%;padding:10px;margin-top:10px"><button style="margin-top:8px;background:#fb7b20;border:0;border-radius:6px;padding:9px 12px;font-weight:800">Send</button></form></div>';
  const [button, panel] = root.children; const log = panel.querySelector('.glog');
  button.onclick = () => { panel.hidden = !panel.hidden; };
  panel.querySelector('form').onsubmit = async (event) => { event.preventDefault(); const input = panel.querySelector('input'); const question = input.value.trim(); if (!question) return; log.innerHTML += `<p><b>You:</b> ${question.replace(/[<>&]/g, '')}</p>`; input.value = ''; const response = await fetch(`${host}/api/public-chat`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({claimId,token,question}) }); const body = await response.json(); log.innerHTML += `<p><b>Assistant:</b> ${(body.answer || body.error || 'Please contact our team.').replace(/[<>&]/g, '')}</p>`; log.scrollTop = log.scrollHeight; };
  document.body.append(root);
})();
