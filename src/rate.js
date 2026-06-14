// Official foreign/BRL rate from the BCB Olinda PTAX API (the same numbers bcb.gov.br
// shows). Calibrated against a real nota: valor = moeda estrangeira × the *compra* rate
// of the *Fechamento PTAX* bulletin for the chosen Data de competência.
// If that date has no closing yet (weekend, holiday, or before ~13:15 BRT when the
// fechamento is published), it walks back day by day to the most recent bulletin and
// flags the result as not-exact so the popup can warn the user.
// PTAX serves 10 currencies daily (USD/EUR/GBP/JPY/CHF/CAD/AUD/DKK/NOK/SEK); the moeda
// is the ISO-4217 alpha symbol the caller passes (default USD).
(function () {
  const BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

  const pad = (n) => String(n).padStart(2, '0');
  const fmtUS = (d) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${d.getFullYear()}`; // Olinda: MM-DD-YYYY
  const fmtBR = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  async function bulletins(date, moeda) {
    const url =
      `${BASE}/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)` +
      `?@moeda='${moeda}'&@dataCotacao='${fmtUS(date)}'&$top=100&$format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`BCB PTAX HTTP ${res.status}`);
    return (await res.json()).value ?? [];
  }

  // dateBR: "dd/mm/aaaa" — the Data de competência. moedaAlpha: ISO-4217 symbol (e.g.
  // 'EUR'); defaults to USD. Returns { rate, tipoBoletim, cotacaoDateBR, exact }.
  async function getPtaxCompra(dateBR, moedaAlpha = 'USD') {
    const moeda = String(moedaAlpha || 'USD').toUpperCase();
    // The symbol goes straight into the OData URL — only accept a 3-letter alpha code.
    if (!/^[A-Z]{3}$/.test(moeda)) throw new Error('moeda inválida (use o símbolo de 3 letras)');
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dateBR || '').trim());
    if (!m) throw new Error('data de competência inválida (use dd/mm/aaaa)');
    const [dd, mm, yy] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const start = new Date(yy, mm - 1, dd);
    // Reject rolled-over dates (31/04 → 01/05): never quote a different day than asked.
    if (start.getDate() !== dd || start.getMonth() !== mm - 1 || start.getFullYear() !== yy) {
      throw new Error('data de competência inexistente');
    }
    for (let back = 0; back <= 7; back++) {
      const day = new Date(start);
      day.setDate(day.getDate() - back);
      const list = await bulletins(day, moeda);
      if (!list.length) continue;
      const fechamento = list.find((b) => /fechamento/i.test(b.tipoBoletim));
      const chosen = fechamento ?? list[list.length - 1];
      const rate = Number(chosen.cotacaoCompra);
      // Sanity-check the payload: only a finite positive number may price the nota.
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('cotação PTAX inválida na resposta do BCB');
      return {
        rate,
        tipoBoletim: chosen.tipoBoletim,
        cotacaoDateBR: fmtBR(day),
        exact: back === 0 && Boolean(fechamento),
      };
    }
    throw new Error('nenhum boletim PTAX nos 7 dias anteriores à competência');
  }

  window.fetchPtaxCompra = getPtaxCompra;
})();
