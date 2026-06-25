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

  function setText(sel, value, digitsOnly) {
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, err: 'missing' };
    el.disabled = false;
    el.focus();
    el.value = value;
    for (const type of ['input', 'change', 'blur']) {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    }
    // A masked field (telefone, CPF/CNPJ) reformats what was set — the digits are
    // the value; the punctuation belongs to the page.
    const ok = digitsOnly
      ? el.value.replace(/\D/g, '') === String(value).replace(/\D/g, '')
      : el.value === String(value);
    return { sel, ok, got: el.value };
  }

  // Make sure <select> has the wanted <option> even when the portal would only
  // populate it via AJAX (município/CTN) — we know the valid value+text already.
  function ensureOption(el, value, text) {
    if (value == null) return;
    const has = Array.from(el.options).some((o) => o.value === String(value));
    if (!has && text) el.add(new Option(text, String(value), true, true));
  }

  // Normalize a label so the value stored in the profile matches the portal's own
  // <option>/radio text: case/accents folded, spaces around . / , ; dropped, trailing
  // punctuation removed. Bridges the small rendering gaps between the issued nota
  // ("Adm. Pública…", "…IOF;", "Estados Unidos da América") and the live dropdowns
  // ("Adm.Pública…", "…IOF", "Estados Unidos").
  function normLabel(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*([./,;])\s*/g, '$1')
      .replace(/[;.,]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Resolve a profile value to an option value that actually exists on the portal's own
  // control. The value may already be an option CODE (bundled config: "4", "US") or the
  // nota's DISPLAY TEXT (extracted profile: "Consumo no Exterior", "Estados Unidos da
  // América"). Returns the matching code, or null when it can't pin down exactly one
  // option — the caller then fails loud instead of guessing a code on a fiscal document.
  function resolveOption(options, raw) {
    const opts = Array.from(options).filter((o) => o.value !== '');
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const byCode = opts.find((o) => o.value === s);
    if (byCode) return byCode.value;
    const n = normLabel(s);
    if (!n) return null;
    const exact = opts.filter((o) => normLabel(o.text) === n);
    if (exact.length === 1) return exact[0].value;
    if (exact.length > 1) return null; // ambiguous → fail loud
    // País: the nota address ("Estados Unidos da América") is longer than the dropdown
    // ("Estados Unidos"). Accept a unique prefix match in either direction; bail if >1.
    const pref = opts.filter((o) => {
      const on = normLabel(o.text);
      return on && (n === on || n.startsWith(on) || on.startsWith(n));
    });
    return pref.length === 1 ? pref[0].value : null;
  }

  function radioOptions(radios) {
    return radios.map((r) => {
      let label = r.id ? (document.querySelector(`label[for="${r.id}"]`) || {}).textContent || '' : '';
      if (!label && r.parentElement) label = r.parentElement.textContent;
      return { value: r.value, text: (label || '').replace(/\s+/g, ' ').trim() };
    });
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

  // Like setChosen, but resolves a code-or-text value against the control's EXISTING
  // options (no ensureOption injection — the portal already lists every país/mecanismo).
  // For fields read from the nota as display text. Fails loud on no/ambiguous match
  // rather than write a guessed code.
  function setResolved(sel, raw) {
    const $ = jq();
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, err: 'missing' };
    el.disabled = false;
    const code = resolveOption(el.options, raw);
    if (code == null)
      return { sel, ok: false, err: `não consegui mapear "${raw}" no portal — selecione manualmente` };
    if ($) {
      $(el).val(code).trigger('change');
      $(el).trigger('chosen:updated');
    } else {
      el.value = code;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { sel, ok: el.value === code, got: el.value };
  }

  function setResolvedRadio(name, raw) {
    const radios = Array.from(document.querySelectorAll(`input[name="${name}"]`));
    if (!radios.length) return { name, ok: false, err: 'missing' };
    const code = resolveOption(radioOptions(radios), raw);
    if (code == null)
      return { name, ok: false, err: `não consegui mapear "${raw}" no portal — selecione manualmente` };
    const r = radios.find((x) => x.value === code);
    if (r && !r.checked) {
      r.disabled = false;
      r.click();
    }
    return { name, ok: !!(r && r.checked), got: !!(r && r.checked) };
  }

  function applyOp(op) {
    // A null/undefined value means the profile lacks this field. Writing it would put
    // the literal string "undefined" in the form (and report ok) — fail the op instead.
    if (op.value == null) {
      return { sel: op.sel, name: op.name, ok: false, err: 'valor ausente no perfil — confira o cadastro' };
    }
    // money/chosen/select2 values are never legitimately blank (unlike optional text
    // fields like telefone/complemento, which use ''); money must also be numeric. An
    // empty string would otherwise be written and report ok ('' === '') — a silent
    // partial fill of a required field. Fail closed, the same way the null guard does.
    if (['money', 'chosen', 'select2', 'resolve', 'resolveRadio'].includes(op.t)) {
      const s = String(op.value).trim();
      if (s === '' || (op.t === 'money' && !/[0-9]/.test(s))) {
        return {
          sel: op.sel,
          name: op.name,
          ok: false,
          err: 'valor ausente/inválido no perfil — confira o cadastro',
        };
      }
    }
    if (op.t === 'text' || op.t === 'money') return setText(op.sel, op.value, op.digits);
    if (op.t === 'chosen') return setChosen(op.sel, op.value, op.text);
    if (op.t === 'select2') return setSelect2(op.sel, op.value, op.text);
    if (op.t === 'resolve') return setResolved(op.sel, op.value);
    if (op.t === 'resolveRadio') return setResolvedRadio(op.name, op.value);
    if (op.t === 'radio') return setRadio(op.name, op.value);
    return { ok: false, err: 'unknown op ' + op.t };
  }

  // Does the page still hold the value this op set? (A late AJAX rebuild can wipe it.)
  function selfHolds(op) {
    if (op.name) {
      let v = op.value;
      if (op.t === 'resolveRadio') {
        v = resolveOption(
          radioOptions(Array.from(document.querySelectorAll(`input[name="${op.name}"]`))),
          op.value,
        );
        if (v == null) return false;
      }
      const r = document.querySelector(`input[name="${op.name}"][value="${v}"]`);
      return !!(r && r.checked);
    }
    const el = op.sel && document.querySelector(op.sel);
    if (!el) return false;
    if (op.t === 'resolve') {
      const code = resolveOption(el.options, op.value);
      return code != null && el.value === code;
    }
    if (op.digits) return el.value.replace(/\D/g, '') === String(op.value).replace(/\D/g, '');
    return el.value === String(op.value);
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
      if (op.settleMin) {
        // Unconditional settle: this op triggers a cascade with no DOM-observable
        // signal (e.g. the cadastro lookup after the tomador CPF/CNPJ), so the
        // waitAfter poll below would exit immediately — sleep the calibrated minimum.
        await sleep(op.settleMin);
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
