// MAIN world. Applies a list of field operations to the portal page using the
// page's own jQuery, so Chosen/select2 widgets update correctly (the isolated
// content-script world can't reach window.jQuery). Exposes window.__nfseApply.
//
// This file is the engine. It is deliberately free of any extension API so the
// exact same code can be validated against the real portal via Playwright
// (a private harness injects it verbatim).
(function () {
  const jq = () => window.jQuery || window.$;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function setText(sel, value) {
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, err: 'missing' };
    el.disabled = false;
    el.focus();
    el.value = value;
    for (const type of ['input', 'change', 'blur']) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
    return { sel, ok: el.value === String(value), got: el.value };
  }

  // Make sure <select> has the wanted <option> even when the portal would only
  // populate it via AJAX (município/CTN) — we know the valid value+text already.
  function ensureOption(el, value, text) {
    if (value == null) return;
    const has = Array.from(el.options).some((o) => o.value === String(value));
    if (!has && text) el.add(new Option(text, String(value), true, true));
  }

  function setChosen(sel, value, text) {
    const $ = jq();
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, err: 'missing' };
    el.disabled = false;
    ensureOption(el, value, text);
    if ($) {
      $(el).val(String(value)).trigger('change');
      $(el).trigger('chosen:updated');
    } else {
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { sel, ok: el.value === String(value), got: el.value };
  }

  function setSelect2(sel, value, text) {
    const $ = jq();
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, err: 'missing' };
    el.disabled = false;
    ensureOption(el, value, text);
    if ($) {
      $(el).val(String(value)).trigger('change');
    } else {
      el.value = String(value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { sel, ok: el.value === String(value), got: el.value };
  }

  function setRadio(name, value) {
    const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!r) return { name, ok: false, err: 'missing' };
    if (!r.checked) {
      r.disabled = false;
      r.click(); // real click fires the portal's reveal/cascade handlers
    }
    return { name, ok: r.checked, got: r.checked };
  }

  window.__nfseApply = async function (ops) {
    const results = [];
    for (const op of ops) {
      let res;
      try {
        if (op.t === 'text' || op.t === 'money') res = setText(op.sel, op.value);
        else if (op.t === 'chosen') res = setChosen(op.sel, op.value, op.text);
        else if (op.t === 'select2') res = setSelect2(op.sel, op.value, op.text);
        else if (op.t === 'radio') res = setRadio(op.name, op.value);
        else res = { ok: false, err: 'unknown op ' + op.t };
      } catch (e) {
        res = { ok: false, err: String((e && e.message) || e) };
      }
      results.push(Object.assign({ label: op.label || op.sel || op.name }, res));
      if (op.waitAfter) await sleep(op.waitAfter);
    }
    return results;
  };
})();
