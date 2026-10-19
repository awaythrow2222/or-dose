/* OR Dose — UI. Depends on calc.js (ORCalc) and data.js (ORData). */
(function () {
  'use strict';
  const { Fmt, makeMetrics, computeDose, maintenanceMLPerHr, maxAllowableBloodLoss, Adult, Peds } = ORCalc;
  const Data = ORData;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ───────────────────────── Storage (never holds patient data) ─────────────────────────

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } },
  };

  const prefs = Object.assign({ keepAwake: true, appearance: 'system', showAllBases: true, metricsExpanded: false },
    store.get('prefs.v1', {}));
  const savePrefs = () => store.set('prefs.v1', prefs);

  const BASIS_LABEL = { tbw: 'TBW', ibw: 'IBW', abw: 'AdjBW' };

  const DISCLAIMER = [
    'OR Dose is a reference calculator for licensed anesthesia clinicians. It is not a medical device, is not FDA-cleared, and does not replace clinical judgment, institutional protocols, or manufacturer labeling.',
    'Default doses, concentrations and suggested weight bases are typical published values that have not been verified for your institution. Review and edit them to match your formulary before relying on them.',
    'Always independently confirm the drug, dose, concentration and volume before drawing up or administering any medication. Adjust for age, comorbidities, organ function, drug interactions and clinical context.',
  ];

  // ───────────────────────── Medication customization ─────────────────────────

  const allDefaults = Data.adult.concat(Data.pediatric, Data.home);
  const defaultMed = id => allDefaults.find(m => m.id === id);
  const goodNum = v => typeof v === 'number' && isFinite(v) && v > 0;

  const Meds = {
    overrides: store.get('medicationOverrides.v1', {}),
    /** Defaults with the user's edits applied. A home-screen drug (has baseId) takes its concentration from the base drug. */
    effective(m) {
      const o = this.overrides[m.id];
      const out = Object.assign({}, m);
      if (m.baseId) {
        const bo = this.overrides[m.baseId];
        if (bo && goodNum(bo.concentration)) out.concentration = bo.concentration;
      } else if (o && goodNum(o.concentration)) out.concentration = o.concentration;
      if (o) {
        if (goodNum(o.low)) out.low = o.low;
        if (goodNum(o.high)) out.high = o.high;
        if (BASIS_LABEL[o.basis]) out.basis = o.basis;
      }
      return out;
    },
    list(pediatric) { return (pediatric ? Data.pediatric : Data.adult).map(m => this.effective(m)); },
    home() { return Data.home.map(m => this.effective(m)); },
    isCustomized(id) {
      if (this.overrides[id]) return true;
      const d = defaultMed(id);
      return !!(d && d.baseId && this.overrides[d.baseId] && this.overrides[d.baseId].concentration);
    },
    count() { return Object.keys(this.overrides).length; },
    /** Stores only the fields that differ from the built-in default for `id`. */
    setFields(id, fields) {
      const base = defaultMed(id);
      if (!base) return;
      const cur = Object.assign({}, this.overrides[id]);
      for (const k of Object.keys(fields)) { if (fields[k] !== base[k]) cur[k] = fields[k]; else delete cur[k]; }
      if (Object.keys(cur).length) this.overrides[id] = cur; else delete this.overrides[id];
    },
    save(edited) {
      if (!defaultMed(edited.id)) return;
      const own = { low: edited.low, high: edited.high, basis: edited.basis };
      if (edited.baseId) this.setFields(edited.baseId, { concentration: edited.concentration }); // shared with the Adult list
      else own.concentration = edited.concentration;
      this.setFields(edited.id, own);
      this.persist();
    },
    reset(id) {
      delete this.overrides[id];
      const d = defaultMed(id);
      const bo = d && d.baseId && this.overrides[d.baseId];
      if (bo) { delete bo.concentration; if (!Object.keys(bo).length) delete this.overrides[d.baseId]; }
      this.persist();
    },
    resetAll() { this.overrides = {}; this.persist(); },
    persist() { store.set('medicationOverrides.v1', this.overrides); },
  };

  // ───────────────────────── Patient state (memory only) ─────────────────────────

  const P = { age: '', ageUnit: 'years', weight: '', weightUnit: 'kg', height: '', heightUnit: 'cm', hgb: '', npo: '', sex: null, weightIsEstimate: false };
  const MONTHS_PER = { years: 12, months: 1, days: 1 / 30.4375 };
  const KG_PER = { kg: 1, lb: 0.45359237 };
  const CM_PER = { cm: 1, inches: 2.54 };
  const RANGE = { kg: [0.3, 500], cm: [25, 250], months: [0, 1440], hgb: [3, 25], npo: [0, 72] };

  function parse(text) {
    const c = String(text).trim().replace(',', '.');
    if (!c || !/^\d*\.?\d*$/.test(c)) return null;
    const v = Number(c);
    return isFinite(v) ? v : null;
  }
  const within = (v, [lo, hi]) => v != null && v >= lo && v <= hi;
  function ageMonths() { const v = parse(P.age); if (v == null) return null; const m = v * MONTHS_PER[P.ageUnit]; return within(m, RANGE.months) ? m : null; }
  function weightKg() { const v = parse(P.weight); if (v == null) return null; const k = v * KG_PER[P.weightUnit]; return within(k, RANGE.kg) ? k : null; }
  function heightCm() { const v = parse(P.height); if (v == null) return null; const c = v * CM_PER[P.heightUnit]; return within(c, RANGE.cm) ? c : null; }
  function hgbValue() { const v = parse(P.hgb); return within(v, RANGE.hgb) ? v : null; }
  function npoHours() { const v = parse(P.npo); return within(v, RANGE.npo) ? v : null; }
  function metrics() {
    const w = weightKg();
    return w == null ? null : makeMetrics({ tbw: w, heightCm: heightCm(), sex: P.sex, ageMonths: ageMonths() });
  }
  function estimatedWeight() { const m = ageMonths(); return m == null ? null : Peds.estimatedWeightKg(m); }

  function fieldWarnings() {
    const out = [];
    if (P.weight.trim() && weightKg() == null) out.push('Weight looks out of range (0.3–500 kg) — doses are hidden until it is corrected.');
    if (P.height.trim() && heightCm() == null) out.push('Height looks out of range (25–250 cm) and is being ignored.');
    if (P.age.trim() && ageMonths() == null) out.push('Age looks out of range and is being ignored.');
    if (P.hgb.trim() && hgbValue() == null) out.push('Hemoglobin looks out of range (3–25 g/dL) and is being ignored.');
    if (P.npo.trim() && npoHours() == null) out.push('NPO time looks out of range (0–72 hours) and is being ignored.');
    return out;
  }

  // ───────────────────────── Entry card wiring ─────────────────────────

  const el = {
    age: $('#in-age'), weight: $('#in-weight'), height: $('#in-height'), hgb: $('#in-hgb'), npo: $('#in-npo'),
    segAge: $('#seg-age'), segWeight: $('#seg-weight'), segHeight: $('#seg-height'), segSex: $('#seg-sex'),
  };

  function setSeg(seg, value) { $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === value)); }
  function syncInputs() {
    el.age.value = P.age; el.weight.value = P.weight; el.height.value = P.height; el.hgb.value = P.hgb; el.npo.value = P.npo;
    setSeg(el.segAge, P.ageUnit); setSeg(el.segWeight, P.weightUnit); setSeg(el.segHeight, P.heightUnit); setSeg(el.segSex, P.sex);
  }

  el.age.addEventListener('input', () => { P.age = el.age.value; update(); });
  el.weight.addEventListener('input', () => { P.weight = el.weight.value; P.weightIsEstimate = false; update(); });
  el.height.addEventListener('input', () => { P.height = el.height.value; update(); });
  el.hgb.addEventListener('input', () => { P.hgb = el.hgb.value; update(); });
  el.npo.addEventListener('input', () => { P.npo = el.npo.value; update(); });

  // Switching a unit converts what is already typed.
  el.segAge.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === P.ageUnit) return;
    const v = parse(P.age);
    if (v != null) P.age = Fmt.fixed(v * MONTHS_PER[P.ageUnit] / MONTHS_PER[b.dataset.v], b.dataset.v === 'days' ? 0 : 2);
    P.ageUnit = b.dataset.v; syncInputs(); update();
  });
  el.segWeight.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === P.weightUnit) return;
    const v = parse(P.weight);
    if (v != null) P.weight = Fmt.fixed(v * KG_PER[P.weightUnit] / KG_PER[b.dataset.v], 1);
    P.weightUnit = b.dataset.v; syncInputs(); update();
  });
  el.segHeight.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === P.heightUnit) return;
    const v = parse(P.height);
    if (v != null) P.height = Fmt.fixed(v * CM_PER[P.heightUnit] / CM_PER[b.dataset.v], b.dataset.v === 'cm' ? 0 : 1);
    P.heightUnit = b.dataset.v; syncInputs(); update();
  });
  el.segSex.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    P.sex = b.dataset.v; setSeg(el.segSex, P.sex); update();
  });

  // Dismiss the keyboard when tapping empty space (decimal keypads have no Done key).
  document.addEventListener('click', e => {
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !e.target.closest('input, textarea, label, dialog')) a.blur();
  });

  $('#new-patient').addEventListener('click', () => {
    if (!confirm('Clear all patient data and start a new patient?')) return;
    Object.assign(P, { age: '', ageUnit: 'years', weight: '', weightUnit: 'kg', height: '', heightUnit: 'cm', hgb: '', npo: '', sex: null, weightIsEstimate: false });
    hct.start = ''; hct.min = ''; resetCalc();
    syncInputs(); update();
    window.scrollTo(0, 0);
  });

  // ───────────────────────── Shared fragments ─────────────────────────

  const vrow = (label, value, detail, em) =>
    `<div class="vrow"><div><div class="lab">${esc(label)}</div>${detail ? `<div class="det">${esc(detail)}</div>` : ''}</div>` +
    `<div class="val${em ? ' em' : ''}">${esc(value)}</div></div>`;
  const card = (title, sub, body) =>
    `<section class="card"><h2 class="h">${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}${body}</section>`;
  const banner = (html, cls) => `<div class="banner ${cls || ''}"><span aria-hidden="true">${cls === 'info' ? 'ℹ️' : '⚠️'}</span><div>${html}</div></div>`;

  // ───────────────────────── Summary bar & warnings ─────────────────────────

  function renderSummary(m, tab) {
    const box = $('#summary');
    if (!m || tab === 'info') { box.hidden = true; box.innerHTML = ''; return; }
    const item = (l, v) => `<div class="it"><small>${l}</small><b class="${v == null ? 'na' : ''}">${v == null ? '—' : Fmt.fixed(v, 1) + ' kg'}</b></div>`;
    let html = item('TBW', m.tbw);
    if (tab !== 'peds') html += item('IBW', m.ibw) + item('AdjBW', m.abw);
    if (tab !== 'peds' && m.bmi != null) html += `<div class="it"><small>BMI</small><b>${Fmt.fixed(m.bmi, 1)}</b></div>`;
    if (P.weightIsEstimate) html += '<div class="est">⚠ Estimated</div>';
    box.innerHTML = html; box.hidden = false;
  }

  function renderWarnings(tab) {
    const msgs = fieldWarnings().map(t => banner(esc(t)));
    const am = ageMonths();
    if ((tab === 'home' || tab === 'adult') && am != null && am < 18 * 12) {
      msgs.push(banner("Patient is under 18. Adult ideal-weight and tidal-volume formulas aren't valid for children — use the Pediatrics tab for weight-based dosing and equipment sizes."));
    }
    $('#warnings').innerHTML = msgs.join('');
  }

  // ───────────────────────── Medication list ─────────────────────────

  function doseText(m, r) {
    const sfx = Fmt.perKgSuffix(m.kind);
    if (m.doseUnit === 'mcg' && Math.max(r.doseLow, r.doseHigh) >= 1000) return Fmt.range(r.doseLow / 1000, r.doseHigh / 1000) + ' mg' + sfx;
    return Fmt.range(r.doseLow, r.doseHigh) + ' ' + m.doseUnit + sfx;
  }

  function medCardHTML(m, mt, ped, showAll) {
    const rate = m.kind !== 'bolus';
    let bases;
    if (ped) bases = ['tbw'];
    else if (showAll) bases = ['tbw', 'ibw', 'abw'];
    else bases = mt.weight(m.basis) == null ? [m.basis, 'tbw'] : [m.basis];

    const rows = bases.map(b => {
      const w = mt.weight(b);
      const sugg = !ped && b === m.basis;
      const lead = `<div class="basis"><b>${BASIS_LABEL[b]}</b><span>${w == null ? '—' : Fmt.fixed(w, 1) + ' kg'}</span></div>`;
      if (w == null) return `<div class="mrow${sugg ? ' sugg' : ''}">${lead}<div class="na">${esc(mt.ibwUnavailableReason || 'Unavailable')}</div></div>`;
      const r = computeDose(m, w);
      const flag = r.anyCapped || r.anyFloored
        ? ` <span class="warn-ic" title="${r.anyCapped ? 'Per-dose ceiling applied' : 'Per-dose minimum applied'}" aria-label="${r.anyCapped ? 'Per-dose ceiling applied' : 'Per-dose minimum applied'}">⚠</span>` : '';
      return `<div class="mrow${sugg ? ' sugg' : ''}">${lead}<div class="dose">${esc(doseText(m, r))}${flag}</div>` +
        `<div class="vol">${esc(Fmt.range(r.volumeLow, r.volumeHigh))} ${rate ? 'mL/hr' : 'mL'}</div></div>`;
    }).join('');

    let foot = '';
    if (m.kind === 'bolus' && m.cap != null) foot += `<div class="foot warnline">⤒ Per-dose ceiling: ${esc(Fmt.amount(m.cap, m.cap, m.doseUnit))}</div>`;
    if (m.kind === 'bolus' && m.floor != null) foot += `<div class="foot warnline">⤓ Per-dose minimum: ${esc(Fmt.amount(m.floor, m.floor, m.doseUnit))}</div>`;
    if (m.note) foot += `<div class="foot">${esc(m.note)}</div>`;

    return `<article class="med">
      <div class="med-head">
        <div>
          <div class="med-name">${esc(m.name)}</div>
          <div class="med-dose">${esc(Fmt.perKg(m))}${Meds.isCustomized(m.id) ? '<span class="edited">EDITED</span>' : ''}</div>
        </div>
        <button type="button" class="conc-btn" data-id="${esc(m.id)}" aria-label="Edit ${esc(m.name)} concentration and dose">
          <span>${esc(Fmt.concentration(m.concentration, m.concUnit, m.showPercent))}</span>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 17v2h6v-2zM3 5v2h10V5zm10 16v-2h8v-2h-8v-2h-2v6zM7 9v2H3v2h4v2h2V9zm14 4v-2H11v2zm-6-4h2V7h4V5h-4V3h-2z"/></svg>
        </button>
      </div>
      <hr>
      <div class="cols"><span>${ped ? 'Weight' : 'Basis'}</span><span>Dose</span><span>${rate ? 'Pump rate' : 'Volume'}</span></div>
      <div>${rows}</div>${foot}
    </article>`;
  }

  /** Searchable, category-filtered list. The toolbar is built once so typing never loses focus. */
  function createMedList(root, ped) {
    root.innerHTML = `<div class="medlist">
      <h2 class="title">Medications</h2>
      <div class="search"><span aria-hidden="true">🔍</span><input type="search" placeholder="Search medications" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Search medications"><button type="button" class="clear" aria-label="Clear search" hidden>×</button></div>
      <div class="chips" role="group" aria-label="Category"></div>
      ${ped ? '' : '<div class="seg wide rows-seg" role="group" aria-label="Rows"><button type="button" data-v="all">All weights</button><button type="button" data-v="sugg">Suggested only</button></div>'}
      <p class="muted small">${ped ? 'Doses use total body weight. Tap a concentration to change it.' : 'Highlighted row = suggested weight basis. Tap a concentration to change it.'}</p>
      <div class="cards"></div>
    </div>`;
    const input = $('input', root), clear = $('.clear', root), chips = $('.chips', root), cards = $('.cards', root);
    let query = '', category = null, currentMetrics = null;
    const list = Meds.list(ped);
    const present = Data.CATEGORIES.filter(c => list.some(m => m.category === c.id));

    function drawChips() {
      chips.innerHTML = [`<button type="button" class="chip${category == null ? ' on' : ''}" data-c="">All</button>`]
        .concat(present.map(c => `<button type="button" class="chip${category === c.id ? ' on' : ''}" data-c="${c.id}">${esc(c.chip)}</button>`)).join('');
    }
    function render(mt) {
      if (mt) currentMetrics = mt;
      if (!currentMetrics) return;
      const q = query.trim().toLowerCase();
      const meds = Meds.list(ped).filter(m => (category == null || m.category === category) && (!q || m.name.toLowerCase().includes(q)));
      let html = '';
      for (const c of Data.CATEGORIES) {
        const items = meds.filter(m => m.category === c.id);
        if (!items.length) continue;
        html += `<div class="group-title">${esc(c.name)}</div>` + items.map(m => medCardHTML(m, currentMetrics, ped, prefs.showAllBases)).join('');
      }
      cards.innerHTML = html || '<div class="none">No medications match.</div>';
      const rs = $('.rows-seg', root);
      if (rs) setSeg(rs, prefs.showAllBases ? 'all' : 'sugg');
    }

    input.addEventListener('input', () => { query = input.value; clear.hidden = !query; render(); });
    clear.addEventListener('click', () => { query = ''; input.value = ''; clear.hidden = true; render(); input.focus(); });
    chips.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      category = b.dataset.c && category !== b.dataset.c ? b.dataset.c : null;
      drawChips(); render();
    });
    const rs = $('.rows-seg', root);
    if (rs) rs.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      prefs.showAllBases = b.dataset.v === 'all'; savePrefs(); render();
    });
    cards.addEventListener('click', e => {
      const b = e.target.closest('.conc-btn'); if (!b) return;
      const m = Meds.list(ped).find(x => x.id === b.dataset.id);
      if (m) openEditor(m, ped);
    });
    drawChips();
    return { render };
  }

  const adultList = createMedList($('#adult-meds'), false);
  const pedsList = createMedList($('#peds-meds'), true);

  // ───────────────────────── Medication editor ─────────────────────────

  function openEditor(med, ped) {
    const dlg = $('#editor');
    const perKgUnit = med.doseUnit + '/kg' + Fmt.perKgSuffix(med.kind);
    let conc = med.concentration, concText = Fmt.number(med.concentration), basis = med.basis;
    let lowText = Fmt.number(med.low), highText = Fmt.number(med.high);

    dlg.innerHTML = `<form method="dialog" class="ed" novalidate>
      <div class="ed-head">
        <button type="button" class="btn" data-act="cancel">Cancel</button>
        <h2 id="ed-title">${esc(med.name)}</h2>
        <button type="button" class="btn" data-act="save" style="font-weight:700">Save</button>
      </div>
      <div class="ed-body">
        <div class="ed-sec"><div class="cap">Concentration</div><div class="box">
          <div class="presets">${med.presets.map(p => `<button type="button" class="preset" data-p="${p}">${esc(Fmt.concentration(p, med.concUnit, med.showPercent))}</button>`).join('')}</div>
          <div class="ed-row" style="margin-top:8px"><span>Custom</span><input id="ed-conc" type="text" inputmode="decimal" autocomplete="off"><span class="unit">${esc(med.concUnit)}/mL</span></div>
          <div class="err" id="err-conc" hidden>Enter a number greater than zero.</div>
        </div></div>
        <div class="ed-sec"><div class="cap">Dose (${esc(perKgUnit)})</div><div class="box">
          ${med.isMaximum
            ? `<div class="ed-row"><span>Maximum</span><input id="ed-high" type="text" inputmode="decimal" autocomplete="off"><span class="unit">${esc(perKgUnit)}</span></div>`
            : `<div class="ed-row"><span>Low</span><input id="ed-low" type="text" inputmode="decimal" autocomplete="off"><span class="unit">${esc(perKgUnit)}</span></div>
               <div class="ed-row"><span>High</span><input id="ed-high" type="text" inputmode="decimal" autocomplete="off"><span class="unit">${esc(perKgUnit)}</span></div>`}
          <div class="err" id="err-dose" hidden></div>
        </div></div>
        ${ped ? '' : `<div class="ed-sec"><div class="cap">Highlighted weight</div><div class="box">
          <div class="seg wide" id="ed-basis" role="group" aria-label="Suggested weight basis">${['tbw', 'ibw', 'abw'].map(b => `<button type="button" data-v="${b}">${BASIS_LABEL[b]}</button>`).join('')}</div>
          <p class="muted small" style="margin-top:8px">All three weights are always shown; this only sets which row is highlighted.</p>
        </div></div>`}
        ${med.note ? `<div class="ed-sec"><div class="cap">Note</div><div class="box small">${esc(med.note)}</div></div>` : ''}
        ${Meds.isCustomized(med.id) ? '<button type="button" class="btn danger" data-act="restore">Restore defaults</button>' : ''}
      </div></form>`;

    const inConc = $('#ed-conc', dlg), inLow = $('#ed-low', dlg), inHigh = $('#ed-high', dlg);
    const saveBtn = $('[data-act="save"]', dlg);
    inConc.value = concText; inHigh.value = highText; if (inLow) inLow.value = lowText;

    function paint() {
      $$('.preset', dlg).forEach(b => b.classList.toggle('on', goodNum(parse(concText)) && Math.abs(Number(b.dataset.p) - conc) < 1e-9));
      if (!ped) setSeg($('#ed-basis', dlg), basis);
    }
    function validate() {
      const c = parse(concText), hi = parse(highText), lo = med.isMaximum ? hi : parse(lowText);
      const concOk = goodNum(c), doseOk = goodNum(hi) && goodNum(lo) && (med.isMaximum || lo <= hi);
      if (concOk) conc = c;
      $('#err-conc', dlg).hidden = concOk;
      const err = $('#err-dose', dlg);
      err.hidden = doseOk;
      err.textContent = (goodNum(hi) && goodNum(lo)) ? 'Low must not exceed high.' : 'Enter numbers greater than zero.';
      saveBtn.disabled = !(concOk && doseOk);
      paint();
    }
    inConc.addEventListener('input', () => { concText = inConc.value; validate(); });
    inHigh.addEventListener('input', () => { highText = inHigh.value; validate(); });
    if (inLow) inLow.addEventListener('input', () => { lowText = inLow.value; validate(); });
    $('.presets', dlg).addEventListener('click', e => {
      const b = e.target.closest('.preset'); if (!b) return;
      conc = Number(b.dataset.p); concText = Fmt.number(conc); inConc.value = concText; validate();
    });
    if (!ped) $('#ed-basis', dlg).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      basis = b.dataset.v; paint();
    });
    dlg.onclick = e => {
      if (e.target === dlg) { dlg.close(); return; }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'cancel') dlg.close();
      if (act.dataset.act === 'restore') { Meds.reset(med.id); dlg.close(); update(); refreshInfo(); }
      if (act.dataset.act === 'save' && !act.disabled) {
        const hi = parse(highText), lo = med.isMaximum ? hi : parse(lowText);
        Meds.save(Object.assign({}, med, { concentration: parse(concText), low: lo, high: hi, basis }));
        dlg.close(); update(); refreshInfo();
      }
    };
    validate();
    dlg.showModal();
  }

  // ───────────────────────── Adult tab ─────────────────────────

  function bmiCategory(b) {
    return b < 18.5 ? 'Underweight' : b < 25 ? 'Normal' : b < 30 ? 'Overweight' : b < 40 ? 'Obese' : 'Severe obesity';
  }

  function renderAdult(m) {
    $('#adult-empty').hidden = !!m;
    $('#adult-body').hidden = !m;
    if (!m) return;

    const tile = (l, v, unit, sub) =>
      `<div class="tile"><div class="l">${esc(l)}</div><div class="v${v == null ? ' na' : ''}">${v == null ? '—' : esc(v) + `<small>${esc(unit)}</small>`}</div>${sub && v != null ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
    $('#metrics-grid').innerHTML =
      tile('Total (TBW)', Fmt.fixed(m.tbw, 1), 'kg') +
      tile('Ideal (IBW)', m.ibw == null ? null : Fmt.fixed(m.ibw, 1), 'kg', 'Devine') +
      tile('Adjusted (AdjBW)', m.abw == null ? null : Fmt.fixed(m.abw, 1), 'kg', 'IBW + 0.4 × (TBW − IBW)') +
      tile('Lean (LBW)', m.lbw == null ? null : Fmt.fixed(m.lbw, 1), 'kg', 'Janmahasatian') +
      tile('BMI', m.bmi == null ? null : Fmt.fixed(m.bmi, 1), 'kg/m²', m.bmi == null ? '' : bmiCategory(m.bmi)) +
      tile('BSA', m.bsa == null ? null : Fmt.fixed(m.bsa, 2), 'm²', 'Mosteller');
    let notes = '';
    if (m.ibwUnavailableReason) notes += `<div class="note-line">ⓘ ${esc(m.ibwUnavailableReason)}</div>`;
    if (m.tbwBelowIdeal) notes += '<div class="note-line">ⓘ Weight is at or below ideal — IBW and AdjBW are set equal to TBW.</div>';
    $('#metrics-notes').innerHTML = notes;
    $('#metrics-summary').textContent = [m.lbw != null ? 'LBW ' + Fmt.fixed(m.lbw, 1) : null, m.bsa != null ? 'BSA ' + Fmt.fixed(m.bsa, 2) : null].filter(Boolean).join(' · ');

    adultList.render(m);
  }

  const metricsCard = $('#metrics-card');
  metricsCard.open = !!prefs.metricsExpanded;
  metricsCard.addEventListener('toggle', () => { prefs.metricsExpanded = metricsCard.open; savePrefs(); $('#metrics-summary').hidden = metricsCard.open; });

  // ───────────────────────── Shared adult calculations ─────────────────────────

  const DEFAULT_THRESHOLD = 7;
  const calc = { thresh: DEFAULT_THRESHOLD, ebvPerKg: '' };
  const resetCalc = () => Object.assign(calc, { thresh: DEFAULT_THRESHOLD, ebvPerKg: '' });

  function pbwReason(m) {
    return m.heightCm != null && m.heightCm < 120 ? 'Height under 120 cm — predicted body weight formula not valid.'
      : m.heightCm == null && !m.sex ? 'Enter height and select sex to calculate tidal volumes.'
      : m.heightCm == null ? 'Enter height to calculate tidal volumes.' : 'Select sex to calculate tidal volumes.';
  }

  /** Tidal volume card. opts.rows: mL/kg rows to list; opts.summary: lead with a low–high range. */
  function ventHTML(m, opts) {
    const pbw = Adult.pbw(m.heightCm, m.sex);
    if (pbw == null) return card('Tidal volume', 'Based on predicted body weight', `<div class="msg">${esc(pbwReason(m))}</div>`);
    const rows = opts.rows, lo = rows[0], hi = rows[rows.length - 1];
    const lead = opts.summary
      ? vrow(`${lo}–${hi} mL/kg`, `${Fmt.range(Adult.tidalVolumeML(pbw, lo), Adult.tidalVolumeML(pbw, hi))} mL`, `Predicted body weight ${Fmt.fixed(pbw, 1)} kg`, true) + '<hr class="sep">'
      : vrow('Predicted body weight', Fmt.fixed(pbw, 1) + ' kg', m.sex === 'male' ? '50 + 0.91 × (height cm − 152.4)' : '45.5 + 0.91 × (height cm − 152.4)', true) + '<hr class="sep">';
    return card('Tidal volume', 'Based on predicted body weight (PBW)',
      lead + rows.map(k => vrow(k + ' mL/kg', Fmt.number(Adult.tidalVolumeML(pbw, k)) + ' mL', k === 10 ? 'Upper end of the usual range' : '')).join('') +
      `<div class="fine">${opts.fine}</div>`);
  }

  function ettDepthHTML(m, brief) {
    const d = Adult.ettDepth(m.heightCm, m.sex);
    if (d.ruleCm == null && d.chulaCm == null) {
      return card('Endotracheal tube depth', 'Oral, at the teeth/lips', '<div class="msg">Enter height and select sex to estimate tube depth.</div>');
    }
    return card('Endotracheal tube depth', 'Oral, at the teeth/lips',
      (d.chulaCm != null ? vrow('Height-based estimate', Fmt.fixed(d.chulaCm, 1) + ' cm', '0.1 × height (cm) + 4 (Chula formula)', true) : vrow('Height-based estimate', '—', 'Enter height')) +
      (d.ruleCm != null ? vrow('Rule of thumb', d.ruleCm + ' cm', m.sex === 'male' ? '23 cm for men' : '21 cm for women') : vrow('Rule of thumb', '—', 'Select sex')) +
      (brief ? '<div class="fine">Estimates only; nasal adds about 2–3 cm. Confirm placement clinically.</div>'
        : '<div class="fine">Nasal: add about 2–3 cm. These are estimates and the reference landmark differs between sources. Confirm placement clinically (auscultation, capnography, imaging as indicated).</div>'));
  }

  function thresholdHTML() {
    return `<div class="slider-wrap"><div class="slider-head"><span class="lab">Transfusion threshold</span><span class="val thr-val">${Fmt.fixed(calc.thresh, 1)}<small>g/dL</small></span></div>` +
      `<input class="thr" type="range" min="5" max="10" step="0.5" value="${calc.thresh}" aria-label="Transfusion threshold hemoglobin, g/dL">` +
      '<div class="ticks" aria-hidden="true"><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span></div>' +
      `<button type="button" class="link-btn thr-reset"${calc.thresh === DEFAULT_THRESHOLD ? ' hidden' : ''}>Reset to ${DEFAULT_THRESHOLD}</button></div>`;
  }

  /** Output of the blood-loss calculator; redrawn on its own so inputs and the slider keep focus. */
  function mablAdultHTML(m) {
    const typed = parse(calc.ebvPerKg);
    const perKg = goodNum(typed) ? typed : Adult.ebvPerKg(m.sex);
    const hgb = hgbValue();
    if (perKg == null) return '<div class="msg warn">Select sex above, or enter an estimated blood volume in mL/kg.</div>';
    if (calc.ebvPerKg.trim() && !goodNum(typed)) return '<div class="msg warn">Enter blood volume as a number of mL/kg greater than zero.</div>';
    if (!P.hgb.trim()) return '<div class="msg">Enter a starting Hgb above to calculate.</div>';
    if (hgb == null) return '<div class="msg warn">Hemoglobin looks out of range (3–25 g/dL).</div>';
    const thr = calc.thresh;
    if (hgb <= thr) return `<div class="msg warn">Starting Hgb (${Fmt.fixed(hgb, 1)} g/dL) is at or below the ${Fmt.fixed(thr, 1)} g/dL transfusion threshold, so there is no allowable blood loss.</div>`;
    const ebv = m.tbw * perKg, loss = maxAllowableBloodLoss(ebv, hgb, thr);
    return vrow('Estimated blood volume', Fmt.number(ebv) + ' mL', `${Fmt.fixed(m.tbw, 1)} kg × ${Fmt.number(perKg)} mL/kg`) +
      vrow('Max allowable blood loss', Fmt.number(loss) + ' mL', `Until Hgb falls from ${Fmt.fixed(hgb, 1)} to ${Fmt.fixed(thr, 1)} g/dL`, true) +
      vrow('Share of blood volume', Fmt.fixed(loss / ebv * 100, 0) + '%');
  }

  /** Wires the threshold slider (and the blood-volume box, where present) inside `root`. */
  function wireMabl(root, m) {
    const out = $('.mabl-out', root), slider = $('.thr', root), reset = $('.thr-reset', root), val = $('.thr-val', root), ebvIn = $('.ebv-in', root);
    const redraw = () => { out.innerHTML = mablAdultHTML(m); };
    const sync = () => { val.innerHTML = Fmt.fixed(calc.thresh, 1) + '<small>g/dL</small>'; reset.hidden = calc.thresh === DEFAULT_THRESHOLD; redraw(); };
    slider.addEventListener('input', () => { calc.thresh = Number(slider.value); sync(); });
    reset.addEventListener('click', () => { calc.thresh = DEFAULT_THRESHOLD; slider.value = DEFAULT_THRESHOLD; sync(); });
    if (ebvIn) ebvIn.addEventListener('input', () => { calc.ebvPerKg = ebvIn.value; redraw(); });
  }

  // ───────────────────────── Adult → Calcs ─────────────────────────

  function maintRowsHTML(m) {
    const hours = npoHours();
    return ['tbw', 'ibw', 'abw'].map(b => {
      const w = m.weight(b);
      const lead = `<div class="basis"><b>${BASIS_LABEL[b]}</b><span>${w == null ? '—' : Fmt.fixed(w, 1) + ' kg'}</span></div>`;
      if (w == null) return `<div class="mrow plain">${lead}<div class="na">${esc(m.ibwUnavailableReason || 'Unavailable')}</div></div>`;
      const rate = maintenanceMLPerHr(w);
      return `<div class="mrow plain">${lead}<div class="dose">${Fmt.fixed(rate, 1)} mL/hr<br><span class="muted small">${Fmt.number(rate * 24)} mL/day</span></div>` +
        `<div class="vol">${hours != null ? Fmt.number(rate * hours) + ' mL' : '—'}</div></div>`;
    }).join('');
  }

  function fluidsHTML(m) {
    const hours = npoHours();
    return card('Maintenance fluids', '4-2-1 rule',
      `<div class="msg">${hours == null ? 'Enter NPO time above to see a deficit.' : `NPO ${Fmt.fixed(hours, 1)} h (from the entry above)`}</div>` +
      '<div class="cols"><span>Basis</span><span>Maintenance</span><span>NPO deficit</span></div>' +
      `<div>${maintRowsHTML(m)}</div>` +
      '<div class="fine">4 mL/kg/hr for the first 10 kg, 2 mL/kg/hr for the next 10 kg, 1 mL/kg/hr thereafter. Consider ideal or adjusted weight when actual weight is well above ideal. The NPO deficit is maintenance rate × hours NPO; replacement strategy and goals vary.</div>');
  }

  function bloodHTML(m) {
    const def = Adult.ebvPerKg(m.sex);
    const obese = m.bmi != null && m.bmi >= 30;
    return card('Maximum allowable blood loss', 'Uses the starting Hgb entered above',
      `<div class="inline-field one"><div><label for="calc-ebv">Blood volume (mL/kg)</label><input id="calc-ebv" class="ebv-in" type="text" inputmode="decimal" autocomplete="off" placeholder="${def == null ? '—' : def}" value="${esc(calc.ebvPerKg)}"></div></div>` +
      thresholdHTML() + '<hr class="sep">' +
      `<div class="mabl-out">${mablAdultHTML(m)}</div>` +
      '<div class="fine">MABL = EBV × (starting Hgb − threshold) ÷ average of the two. Assumes blood loss is replaced to keep the volume constant. Blood volume uses actual weight at 70 mL/kg (male) or 65 mL/kg (female) unless you enter a value' +
      (obese ? '; it is lower per kg in obesity, so consider entering a smaller mL/kg' : '') + '.</div>');
  }

  function renderCalcs(m) {
    const box = $('#calcs-body');
    if (!m) { box.innerHTML = emptyPrompt('Enter a weight', 'Ventilation, airway, fluid and blood-loss values are calculated from the patient entry above.'); return; }
    box.innerHTML =
      ventHTML(m, { rows: [6, 7, 8, 10], fine: 'Tidal volume is based on height and sex, not actual weight. Lung-protective ventilation typically uses 6–8 mL/kg PBW. Adjust to the patient, surgery and plateau pressure.' }) +
      ettDepthHTML(m) + fluidsHTML(m) + bloodHTML(m);
    wireMabl(box, m);
  }

  // ───────────────────────── Home screen ─────────────────────────

  const homeBody = $('#home-body');

  /** Children get the age-based pediatric depth; everyone else the adult height-based estimates. */
  function homeAirwayHTML(m) {
    const am = ageMonths();
    if (am == null || am >= 18 * 12) return ettDepthHTML(m, true);
    const e = Peds.ett(am, m.tbw), f1 = x => Fmt.fixed(x, 1);
    return card('Endotracheal tube depth', 'Pediatric estimate, oral at the lip',
      vrow('Depth, oral', f1(e.depthOralCm) + ' cm', `${e.depthRule} · nasal ≈ ${f1(e.depthNasalCm)} cm`, true) +
      (e.cuffed != null ? vrow('Cuffed tube (ID)', f1(e.cuffed) + ' mm') : '') +
      (e.uncuffed != null ? vrow('Uncuffed tube (ID)', f1(e.uncuffed) + ' mm') : '') +
      '<div class="fine">Age-based estimates; more sizes are on the Pediatrics tab. Confirm placement clinically.</div>');
  }

  function homeFluidsHTML(m) {
    const rate = maintenanceMLPerHr(m.tbw), hours = npoHours(), n = Fmt.number;
    let h = vrow('Maintenance rate', Fmt.fixed(rate, 1) + ' mL/hr', `4-2-1 on ${Fmt.fixed(m.tbw, 1)} kg TBW · ${n(rate * 24)} mL/day`, true);
    h += hours == null
      ? vrow('Estimated fluid deficit', '—', P.npo.trim() ? 'NPO time is out of range' : 'Enter NPO time above')
      : vrow('Estimated fluid deficit', n(rate * hours) + ' mL', `${n(rate)} mL/hr × ${Fmt.fixed(hours, 1)} h NPO`, true);
    if (m.ibw != null && m.abw != null) {
      const alt = (label, w) => `${label} (${Fmt.fixed(w, 1)} kg): ${n(maintenanceMLPerHr(w))} mL/hr${hours != null ? `, deficit ${n(maintenanceMLPerHr(w) * hours)} mL` : ''}`;
      h += `<div class="fine">${esc(alt('On IBW', m.ibw))}<br>${esc(alt('On AdjBW', m.abw))}</div>`;
    }
    return card('Fluids', 'Maintenance and NPO deficit',
      h + '<div class="fine">Deficit = maintenance rate × hours NPO. Replacement strategy and goals vary.</div>');
  }

  function homeMedsHTML(m) {
    const seg = `<div class="seg wide home-rows" role="group" aria-label="Rows"><button type="button" data-v="all"${prefs.showAllBases ? ' class="on"' : ''}>All weights</button><button type="button" data-v="sugg"${prefs.showAllBases ? '' : ' class="on"'}>Suggested only</button></div>`;
    return `<div class="home-sec-title">Induction doses</div>${seg}` +
      `<div class="cards">${Meds.home().map(med => medCardHTML(med, m, false, prefs.showAllBases)).join('')}</div>` +
      '<p class="sub-note">Highlighted row = suggested weight basis. Tap a concentration to change it; concentrations are shared with the Adult medication list.</p>';
  }

  function homeBloodHTML(m) {
    return card('Maximum allowable blood loss', 'Uses the starting Hgb entered above',
      thresholdHTML() + '<hr class="sep">' + `<div class="mabl-out">${mablAdultHTML(m)}</div>` +
      '<div class="fine">Blood volume is assumed 70 mL/kg (male) or 65 mL/kg (female) of actual weight; change it under Adult → Calcs.</div>');
  }

  function renderHome(m) {
    $('#home-empty').hidden = !!m;
    homeBody.hidden = !m;
    if (!m) return;
    homeBody.innerHTML = homeAirwayHTML(m) + homeFluidsHTML(m) +
      ventHTML(m, { rows: [4, 5, 6], summary: true, fine: 'Based on predicted body weight from height and sex, not actual weight.' }) +
      homeMedsHTML(m) + homeBloodHTML(m);
    wireMabl(homeBody, m);
  }

  homeBody.addEventListener('click', e => {
    const b = e.target.closest('.conc-btn');
    if (b) { const med = Meds.home().find(x => x.id === b.dataset.id); if (med) openEditor(med, false); return; }
    const r = e.target.closest('.home-rows button');
    if (r) { prefs.showAllBases = r.dataset.v === 'all'; savePrefs(); update(); }
  });

  // ───────────────────────── Pediatrics tab ─────────────────────────

  let pedsSection = 'airway';
  const hct = { start: '', min: '' };

  $('#seg-peds').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pedsSection = b.dataset.v; update();
  });

  function renderPedsEstimate() {
    const box = $('#peds-estimate');
    const est = estimatedWeight();
    if (!P.weight.trim() && est != null) {
      box.innerHTML = `<div class="banner info"><button type="button" id="use-est"><div class="t">Use age-based weight estimate: ${Fmt.fixed(est, 1)} kg</div><div class="small">Only if the patient cannot be weighed.</div></button></div>`;
      $('#use-est').addEventListener('click', () => { P.weightUnit = 'kg'; P.weight = Fmt.fixed(est, 1); P.weightIsEstimate = true; syncInputs(); update(); });
    } else if (P.weightIsEstimate) {
      box.innerHTML = banner('Weight is an age-based estimate. Weigh the patient when possible — real weights can differ substantially.');
    } else box.innerHTML = '';
  }

  function emptyPrompt(title, msg) { return `<div class="empty"><div class="empty-icon" aria-hidden="true">⚖</div><h2>${esc(title)}</h2><p>${esc(msg)}</p></div>`; }

  function renderPedsAirway() {
    const box = $('#peds-airway');
    const am = ageMonths();
    if (am == null) { box.innerHTML = emptyPrompt('Enter an age', 'Tube and airway sizes are estimated from age (and weight for neonates and LMA size).'); return; }
    const w = weightKg() != null ? weightKg() : estimatedWeight();
    const assumed = weightKg() == null;
    const e = Peds.ett(am, w);
    const f1 = x => Fmt.fixed(x, 1);
    const adj = x => `Try ${f1(x - 0.5)} and ${f1(x + 0.5)} too`;
    const suctionSize = e.cuffed != null ? e.cuffed : e.uncuffed != null ? e.uncuffed : 3.5;
    const lma = Peds.lma(w);

    let h = card('Endotracheal tube', 'Internal diameter, mm',
      (e.cuffed != null ? vrow('Cuffed', f1(e.cuffed), adj(e.cuffed), true) : '') +
      (e.uncuffed != null ? vrow('Uncuffed', f1(e.uncuffed), adj(e.uncuffed), e.cuffed == null) : '') +
      '<hr class="sep">' +
      vrow('Depth, oral (at lip)', f1(e.depthOralCm) + ' cm', e.depthRule) +
      vrow('Depth, nasal', f1(e.depthNasalCm) + ' cm', 'Oral + ~2.5 cm') +
      (e.note ? `<div class="fine">${esc(e.note)}</div>` : '') +
      '<div class="fine">Cuffed: age/4 + 3.5. Uncuffed: age/4 + 4. Keep cuff pressure ≤ 20–25 cm H₂O. Confirm placement clinically.</div>');
    h += card('Airway devices', '',
      vrow('LMA (classic)', 'Size ' + lma.size, `Max cuff ${lma.maxCuffML} mL · by weight${assumed ? ' (estimated)' : ''}`, true) +
      vrow('Laryngoscope blade', Peds.laryngoscopeBlade(am)) +
      vrow('Oral airway', Peds.oralAirway(am), 'Corner of mouth to angle of jaw'));
    h += card('Tubes & catheters', 'Rough age-based estimates',
      vrow('OG / NG tube', Peds.ogNgFr(am)) +
      vrow('Suction catheter', '≈ ' + Fmt.fixed(Peds.suctionFr(suctionSize), 0) + ' Fr', '2 × ETT size') +
      vrow('Foley catheter', Peds.foleyFr(am)) +
      vrow('Chest tube', Peds.chestTubeFr(am), 'Larger for hemothorax') +
      vrow('IV catheter', Peds.ivGauge(am)));
    h += '<p class="muted small">Estimates only. Always confirm size selection against the patient and have adjacent sizes available.</p>';
    box.innerHTML = h;
  }

  function mablHTML(ebv) {
    const s = parse(hct.start), mn = parse(hct.min);
    if (s == null || mn == null) return '';
    const v = Peds.maxAllowableBloodLoss(ebv, s, mn);
    return v == null
      ? '<div class="err">Starting Hct must be higher than the lowest acceptable Hct.</div>'
      : vrow('MABL', Fmt.number(v) + ' mL', '', true);
  }

  function renderPedsFluids(m) {
    const box = $('#peds-fluids');
    if (!m) { box.innerHTML = emptyPrompt('Enter a weight', 'Fluid, blood and resuscitation values are calculated from weight.'); return; }
    const w = m.tbw, am = ageMonths(), n = Fmt.number;
    const hr = Peds.maintenanceMLPerHr(w);
    let h = card('Maintenance fluid', '4-2-1 rule',
      vrow('Rate', Fmt.fixed(hr, 1) + ' mL/hr', n(hr * 24) + ' mL/day', true) +
      vrow('Bolus 10 mL/kg', n(w * 10) + ' mL') + vrow('Bolus 20 mL/kg', n(w * 20) + ' mL'));

    if (am != null) {
      const perKg = Peds.ebvPerKg(am), ebv = perKg * w;
      h += card('Blood volume', '',
        vrow('Estimated blood volume', n(ebv) + ' mL', n(perKg) + ' mL/kg', true) +
        vrow('10% of EBV', n(ebv * 0.1) + ' mL') + vrow('20% of EBV', n(ebv * 0.2) + ' mL') + vrow('30% of EBV', n(ebv * 0.3) + ' mL') +
        '<hr class="sep"><div class="lab" style="font-weight:650">Maximum allowable blood loss</div>' +
        `<div class="hct"><div><label for="hct-start">Starting Hct %</label><input id="hct-start" type="text" inputmode="decimal" autocomplete="off" placeholder="—" value="${esc(hct.start)}"></div>` +
        `<div><label for="hct-min">Lowest acceptable %</label><input id="hct-min" type="text" inputmode="decimal" autocomplete="off" placeholder="—" value="${esc(hct.min)}"></div></div>` +
        `<div id="mabl-out">${mablHTML(ebv)}</div>`);
    } else {
      h += card('Blood volume', '', '<p class="muted">Enter an age to estimate blood volume.</p>');
    }

    h += card('Blood products', 'Typical volumes',
      vrow('PRBC 10–15 mL/kg', `${n(w * 10)}–${n(w * 15)} mL`, '10 mL/kg raises Hgb by ~2–3 g/dL') +
      vrow('FFP 10–15 mL/kg', `${n(w * 10)}–${n(w * 15)} mL`) +
      vrow('Platelets 5–10 mL/kg', `${n(w * 5)}–${n(w * 10)} mL`));
    h += card('Resuscitation energy', '',
      vrow('Defibrillation, first (2 J/kg)', n(w * 2) + ' J', '', true) +
      vrow('Defibrillation, repeat (4 J/kg)', n(w * 4) + ' J', 'Up to 10 J/kg or adult dose') +
      vrow('Synchronized cardioversion', `${n(w * 0.5)}–${n(w * 1)} J`, `0.5–1 J/kg, then 2 J/kg (${n(w * 2)} J)`) +
      '<div class="fine">Emergency drug doses (epinephrine, adenosine, amiodarone, calcium, dantrolene, lipid) are under Meds → Emergency.</div>');
    if (am != null) {
      const v = Peds.vitals(am);
      h += card('Normal vitals — ' + v.group, 'Awake ranges',
        vrow('Heart rate', v.heartRate + ' /min') + vrow('Respiratory rate', v.respRate + ' /min') +
        vrow('Hypotension if SBP below', Fmt.fixed(v.lowSBP, 0) + ' mmHg', am >= 12 && am < 156 ? '70 + 2 × age (years)' : ''));
    }
    box.innerHTML = h;

    if (am != null) {
      const ebv = Peds.ebvPerKg(am) * w;
      const onHct = () => {
        hct.start = $('#hct-start').value; hct.min = $('#hct-min').value;
        $('#mabl-out').innerHTML = mablHTML(ebv);
      };
      $('#hct-start').addEventListener('input', onHct);
      $('#hct-min').addEventListener('input', onHct);
    }
  }

  function renderPeds(m) {
    renderPedsEstimate();
    setSeg($('#seg-peds'), pedsSection);
    $('#peds-airway').hidden = pedsSection !== 'airway';
    $('#peds-meds').hidden = pedsSection !== 'meds';
    $('#peds-fluids').hidden = pedsSection !== 'fluids';
    if (pedsSection === 'airway') renderPedsAirway();
    if (pedsSection === 'meds') {
      if (m) { $('.medlist', $('#peds-meds')).hidden = false; $('#peds-meds-empty') && $('#peds-meds-empty').remove(); pedsList.render(m); }
      else {
        $('.medlist', $('#peds-meds')).hidden = true;
        if (!$('#peds-meds-empty')) $('#peds-meds').insertAdjacentHTML('beforeend', `<div id="peds-meds-empty">${emptyPrompt('Enter a weight', 'Pediatric doses are calculated from total body weight.')}</div>`);
      }
    }
    if (pedsSection === 'fluids') {
      // Skip a full redraw while the user is typing in the Hct boxes (patient input can't change then).
      renderPedsFluids(m);
    }
  }

  // ───────────────────────── Info tab ─────────────────────────

  function refreshInfo() {
    const n = Meds.count();
    $('#custom-count').textContent = n === 0 ? 'No medications have been edited.' : `${n} medication${n === 1 ? '' : 's'} edited.`;
    $('#reset-all').disabled = n === 0;
  }
  $('#reset-all').addEventListener('click', () => {
    if (confirm('Restore all default doses and concentrations?')) { Meds.resetAll(); refreshInfo(); update(); }
  });
  const discHTML = DISCLAIMER.map(t => `<p>${esc(t)}</p>`).join('');
  $('#disclaimer-text').innerHTML = discHTML;
  $('#gate-text').innerHTML = discHTML;

  // Display preferences
  function applyTheme() {
    if (prefs.appearance === 'light' || prefs.appearance === 'dark') document.documentElement.dataset.theme = prefs.appearance;
    else delete document.documentElement.dataset.theme;
    setSeg($('#seg-theme'), prefs.appearance);
  }
  $('#seg-theme').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    prefs.appearance = b.dataset.v; savePrefs(); applyTheme();
  });

  let wakeLock = null;
  async function applyWake() {
    if (!('wakeLock' in navigator)) { $('#awake-note').textContent = "This browser doesn't support keeping the screen awake; adjust Auto-Lock in your device settings."; return; }
    try {
      if (prefs.keepAwake && !wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!prefs.keepAwake && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (err) { wakeLock = null; }
  }
  const awake = $('#pref-awake');
  awake.checked = !!prefs.keepAwake;
  awake.addEventListener('change', () => { prefs.keepAwake = awake.checked; savePrefs(); applyWake(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyWake(); });
  document.addEventListener('pointerdown', () => { if (prefs.keepAwake && !wakeLock) applyWake(); }, { passive: true });

  // ───────────────────────── Tabs & main update ─────────────────────────

  let tab = 'home';
  let adultSection = 'meds';
  const TITLES = { home: 'OR Dose', adult: 'Adult', peds: 'Pediatrics', info: 'Info' };

  $('#seg-adult').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    adultSection = b.dataset.v; update();
  });

  function setTab(next) {
    tab = next;
    document.body.dataset.tab = tab;
    $('#page-title').textContent = TITLES[tab];
    ['home', 'adult', 'peds', 'info'].forEach(t => { $('#tab-' + t).hidden = t !== tab; });
    $$('.tabbar button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    update();
  }
  $('.tabbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });

  // Keep the sticky weights bar flush under the header, whatever the device's safe-area inset is.
  function syncHeaderHeight() { document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px'); }
  window.addEventListener('resize', syncHeaderHeight);

  function update() {
    const m = metrics();
    $('#new-patient').disabled = !(P.age || P.weight || P.height || P.hgb || P.npo || P.sex);
    $('#field-weight').classList.toggle('missing', !P.weight.trim());
    renderSummary(m, tab);
    renderWarnings(tab);
    if (tab === 'home') renderHome(m);
    else if (tab === 'adult') {
      setSeg($('#seg-adult'), adultSection);
      $('#adult-meds-panel').hidden = adultSection !== 'meds';
      $('#adult-calcs-panel').hidden = adultSection !== 'calcs';
      if (adultSection === 'meds') renderAdult(m); else renderCalcs(m);
    } else if (tab === 'peds') renderPeds(m);
    else refreshInfo();
  }

  // ───────────────────────── First-run disclaimer ─────────────────────────

  const gate = $('#gate');
  if (!store.get('acceptedDisclaimerV1', false)) {
    gate.hidden = false;
    $('#gate-accept').focus();
  }
  $('#gate-accept').addEventListener('click', () => { store.set('acceptedDisclaimerV1', true); gate.hidden = true; applyWake(); });

  // ───────────────────────── Offline support ─────────────────────────

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      $('#offline-status').textContent = 'Ready to work offline once this page has loaded.';
    }).catch(() => { $('#offline-status').textContent = 'Offline mode is unavailable in this browser.'; });
  } else {
    $('#offline-status').textContent = location.protocol === 'file:' ? '' : 'Offline mode needs a secure (https) connection.';
  }

  applyTheme();
  syncHeaderHeight();
  syncInputs();
  update();
  applyWake();
})();
