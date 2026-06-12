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
    return { name, ok: r.checked, got: r.checked, err: r.checked ? undefined : 'não ficou marcado' };
  }

  function applyOp(op) {
    // A null/undefined value means the profile lacks this field. Writing it would put
    // the literal string "undefined" in the form (and report ok) — fail the op instead.
    if (op.value == null) {
      return { sel: op.sel, name: op.name, ok: false, err: 'valor ausente no perfil — confira o cadastro' };
    }
    if (op.t === 'text' || op.t === 'money') return setText(op.sel, op.value);
    if (op.t === 'chosen') return setChosen(op.sel, op.value, op.text);
    if (op.t === 'select2') return setSelect2(op.sel, op.value, op.text);
    if (op.t === 'radio') return setRadio(op.name, op.value);
    return { ok: false, err: 'unknown op ' + op.t };
  }

  // Does the page still hold the value this op set? (A late AJAX rebuild can wipe it.)
  function selfHolds(op) {
    if (op.name) {
      const r = document.querySelector(`input[name="${op.name}"][value="${op.value}"]`);
      return !!(r && r.checked);
    }
    const el = op.sel && document.querySelector(op.sel);
    return !!(el && el.value === String(op.value));
  }

  // Is the next op's target usable yet? (Cascades disable/replace the dependent control.)
  function depReady(nextOp) {
    if (!nextOp) return true;
    if (nextOp.sel) {
      const el = document.querySelector(nextOp.sel);
      return !!el && !el.disabled;
    }
    if (nextOp.name) {
      const r = document.querySelector(`input[name="${nextOp.name}"][value="${nextOp.value}"]`);
      return !!r && !r.disabled;
    }
    return true;
  }

  window.__nfseApply = async function (ops) {
    const results = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      let res;
      try {
        res = applyOp(op);
      } catch (e) {
        res = { ok: false, err: String((e && e.message) || e) };
      }
      if (op.waitAfter) {
        // op.waitAfter is the calibrated worst-case settle time for the AJAX cascade
        // this op triggers. Poll instead of sleeping blind: exit early once the next
        // control is usable and our value is still in place; if a late rebuild wiped
        // the value, re-apply it once and honor the cascade it re-triggers.
        const until = Date.now() + op.waitAfter;
        while (Date.now() < until && !(depReady(ops[i + 1]) && selfHolds(op))) await sleep(100);
        if (!selfHolds(op)) {
          await sleep(400); // the rebuild may still be settling
          try {
            res = Object.assign(applyOp(op), { reapplied: true });
          } catch (e) {
            res = { ok: false, err: String((e && e.message) || e), reapplied: true };
          }
          await sleep(op.waitAfter);
        }
      }
      results.push(Object.assign({ label: op.label || op.sel || op.name }, res));
    }
    // Final coherence pass: a late cascade rebuild can wipe an EARLIER field after its
    // op already reported ok (e.g. complementar wiped by CTN's slow repopulation).
    // Re-check every value-bearing op against the page's real end state.
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (!results[i].ok || op.value == null || !(op.sel || op.name)) continue;
      if (!selfHolds(op)) {
        results[i].ok = false;
        results[i].err = 'valor não persistiu (a página o recarregou) — preencha de novo';
      }
    }
    return results;
  };
})();
