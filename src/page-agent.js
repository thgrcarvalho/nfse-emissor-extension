// MAIN world. Bridge between the isolated content script and the page-context
// engine (__nfseFillPlan + __nfseApply). Receives a fill request via window
// messaging, builds the plan, applies it, and posts the results back.
(function () {
  window.addEventListener('message', async (ev) => {
    const d = ev.data;
    if (!d || d.__nfse_req !== true || ev.source !== window) return;
    try {
      const ops = window.__nfseFillPlan(d.pageId, d.cfg, d.state);
      const results = await window.__nfseApply(ops);
      window.postMessage({ __nfse_res: true, id: d.id, ok: true, results }, '*');
    } catch (e) {
      window.postMessage({ __nfse_res: true, id: d.id, ok: false, err: String((e && e.message) || e) }, '*');
    }
  });
})();
