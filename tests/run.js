// Run with: node tests/run.js
const { Fmt, makeMetrics, computeDose, maintenanceMLPerHr, maxAllowableBloodLoss, Adult, Peds } = require('../calc.js');
const Data = require('../data.js');

let checks = 0, failures = 0;
function check(cond, msg) { checks++; if (!cond) { failures++; console.log('FAIL: ' + msg); } }
function near(a, b, msg, tol = 0.01) {
  checks++;
  if (a == null || Math.abs(a - b) > tol) { failures++; console.log(`FAIL: ${msg} — got ${a}, expected ${b}`); }
}
const med = (id, peds = false) => (peds ? Data.pediatric : Data.adult).find(m => m.id === (peds ? 'p_' + id : id));
const clone = (m, over) => Object.assign({}, m, over);

// Body metrics — 180 cm male, 100 kg
{
  const m = makeMetrics({ tbw: 100, heightCm: 180, sex: 'male', ageMonths: 480 });
  near(m.idealFormulaKg, 50 + 2.3 * (180 / 2.54 - 60), 'Devine male');
  near(m.ibw, 74.99, 'IBW');
  near(m.abw, 74.99 + 0.4 * (100 - 74.99), 'AdjBW');
  near(m.bmi, 30.86, 'BMI');
  near(m.bsa, 2.236, 'BSA', 0.001);
  near(m.lbw, 9270 * 100 / (6680 + 216 * 30.864), 'LBW male', 0.05);
  near(m.adultEBV, 7000, 'EBV male');
  check(!m.tbwBelowIdeal && m.ibwUnavailableReason === null, 'no flags');
}
{
  const m = makeMetrics({ tbw: 60, heightCm: 165, sex: 'female' });
  near(m.idealFormulaKg, 45.5 + 2.3 * (165 / 2.54 - 60), 'Devine female');
  near(m.lbw, 9270 * 60 / (8780 + 244 * (60 / 1.65 / 1.65)), 'LBW female', 0.05);
  near(m.adultEBV, 3900, 'EBV female');
}
{ // Underweight → IBW/AdjBW fall back to TBW
  const m = makeMetrics({ tbw: 50, heightCm: 180, sex: 'male' });
  near(m.ibw, 50, 'IBW capped'); near(m.abw, 50, 'AdjBW = TBW'); check(m.tbwBelowIdeal, 'below ideal flag');
}
{ // Missing inputs
  const w = makeMetrics({ tbw: 70 });
  check(w.ibw == null && w.abw == null && w.bmi == null && w.lbw == null, 'weight-only has no derived');
  check(w.weight('tbw') === 70 && w.weight('ibw') == null, 'weight()');
  check(w.ibwUnavailableReason === 'Enter height and sex for IBW / AdjBW', 'reason both');
  check(makeMetrics({ tbw: 70, heightCm: 170 }).ibwUnavailableReason === 'Select sex for IBW / AdjBW', 'reason sex');
  check(makeMetrics({ tbw: 70, sex: 'male' }).ibwUnavailableReason === 'Enter height for IBW / AdjBW', 'reason height');
  const kid = makeMetrics({ tbw: 20, heightCm: 115, sex: 'male' });
  check(kid.ibw == null && kid.ibwUnavailableReason.includes('140'), 'IBW blocked < 140 cm');
}

// Dose math
{
  let r = computeDose(med('propofol'), 80);
  near(r.doseLow, 120, 'propofol low'); near(r.doseHigh, 200, 'propofol high');
  near(r.volumeLow, 12, 'propofol vol low'); near(r.volumeHigh, 20, 'propofol vol high');

  r = computeDose(med('fentanyl'), 70);
  near(r.doseLow, 35, 'fent low'); near(r.doseHigh, 140, 'fent high');
  near(r.volumeLow, 0.7, 'fent vol low'); near(r.volumeHigh, 2.8, 'fent vol high');

  r = computeDose(med('neostigmine'), 100);
  near(r.doseLow, 3, 'neo low'); near(r.doseHigh, 5, 'neo capped');
  check(r.cappedHigh && !r.cappedLow, 'neo cap flags'); near(r.volumeHigh, 5, 'neo vol');

  r = computeDose(med('bupivacaine'), 60);
  near(r.doseHigh, 150, 'bupi 60 kg'); near(r.volumeHigh, 60, 'bupi vol');
  r = computeDose(med('bupivacaine'), 100);
  near(r.doseHigh, 175, 'bupi cap'); check(r.cappedHigh, 'bupi capped flag');

  r = computeDose(clone(med('propofol_inf'), { low: 100, high: 100 }), 70);
  near(r.doseLow, 7000, 'propofol inf mcg/min'); near(r.volumeLow, 42, 'propofol inf mL/hr');
  near(computeDose(clone(med('norepi_inf'), { low: 0.1, high: 0.1 }), 80).volumeLow, 30, 'norepi rate');
  near(computeDose(clone(med('dex_inf'), { low: 0.5, high: 0.5 }), 80).volumeLow, 10, 'dex rate');

  r = computeDose(clone(med('propofol'), { concentration: 20 }), 80);
  near(r.doseLow, 120, 'dose unchanged'); near(r.volumeLow, 6, 'volume halves at 20 mg/mL');

  r = computeDose(med('atropine', true), 5);
  near(r.doseLow, 0.1, 'atropine floor'); check(r.flooredLow, 'floor flag'); near(r.doseHigh, 0.1, 'atropine 0.02×5');
  r = computeDose(med('atropine', true), 40);
  near(r.doseHigh, 0.5, 'atropine cap'); check(r.cappedHigh, 'cap flag');

  r = computeDose(med('dantrolene'), 70);
  near(r.doseLow, 175, 'dantrolene mg'); near(r.volumeLow, 525, 'dantrolene mL', 0.1);

  near(computeDose(med('lipid'), 60).volumeLow, 90, 'lipid mL');
  near(computeDose(med('lipid'), 70).volumeLow, 100, 'lipid capped 100 mL');

  for (const m of Data.adult.concat(Data.pediatric)) {
    check(m.low > 0 && m.high >= m.low, m.id + ' range ordered');
    check(m.concentration > 0, m.id + ' conc > 0');
    check(m.presets.some(p => Math.abs(p - m.concentration) < 1e-9), m.id + ' default conc in presets');
    check(require('../calc.js').unitFactor(m.concUnit, m.doseUnit) != null, m.id + ' units compatible');
    check(Data.CATEGORIES.some(c => c.id === m.category), m.id + ' category known');
    check(['tbw', 'ibw', 'abw'].includes(m.basis), m.id + ' basis valid');
  }
  const ids = Data.adult.map(m => m.id), pids = Data.pediatric.map(m => m.id);
  check(new Set(ids).size === ids.length, 'adult ids unique');
  check(new Set(pids).size === pids.length && pids.every(i => i.startsWith('p_')), 'peds ids unique + prefixed');
}

// Formatting
{
  check(Fmt.number(120) === '120', 'fmt 120');
  check(Fmt.number(1234.5) === '1,235', 'fmt grouping: ' + Fmt.number(1234.5));
  check(Fmt.number(87.5) === '87.5', 'fmt 87.5');
  check(Fmt.number(2.345) === '2.35', 'fmt 2.35: ' + Fmt.number(2.345));
  check(Fmt.number(0.35) === '0.35', 'fmt 0.35');
  check(Fmt.number(0.0125) === '0.013', 'fmt 0.013: ' + Fmt.number(0.0125));
  check(Fmt.number(0) === '0', 'fmt 0');
  check(Fmt.range(12, 12) === '12', 'single range');
  check(Fmt.range(12, 20) === '12–20', 'range');
  check(Fmt.amount(1750, 10500, 'mcg') === '1.75–10.5 mg', 'mcg→mg: ' + Fmt.amount(1750, 10500, 'mcg'));
  check(Fmt.amount(35, 140, 'mcg') === '35–140 mcg', 'mcg stays');
  check(Fmt.concentration(5, 'mg', true) === '0.5% · 5 mg/mL', 'percent label');
  check(Fmt.perKg(med('propofol')) === '1.5–2.5 mg/kg', 'perKg');
  check(Fmt.perKg(med('norepi_inf')) === '0.01–0.3 mcg/kg/min', 'perKg infusion: ' + Fmt.perKg(med('norepi_inf')));
  check(Fmt.perKg(med('bupivacaine')) === 'Max 2.5 mg/kg', 'perKg max');
}

// Pediatrics
{
  near(Peds.estimatedWeightKg(0.5), 3.5, 'neonate wt'); near(Peds.estimatedWeightKg(6), 7, '6 mo wt');
  near(Peds.estimatedWeightKg(60), 18, '5 y wt'); near(Peds.estimatedWeightKg(144), 36, '12 y wt');

  let e = Peds.ett(60, 18);
  near(e.cuffed, 4.5, 'cuffed 5y'); near(e.uncuffed, 5.0, 'uncuffed 5y'); near(e.depthOralCm, 14.5, 'depth 5y');
  e = Peds.ett(96, 26);
  near(e.cuffed, 5.5, 'cuffed 8y'); near(e.uncuffed, 6.0, 'uncuffed 8y'); near(e.depthOralCm, 16, 'depth 8y');
  e = Peds.ett(24, 12);
  near(e.cuffed, 4.0, 'cuffed 2y'); near(e.uncuffed, 4.5, 'uncuffed 2y'); near(e.depthOralCm, 13, 'depth 2y');
  e = Peds.ett(0.3, 3.5);
  near(e.cuffed, 3.0, 'neonate cuffed'); near(e.uncuffed, 3.5, 'neonate uncuffed'); near(e.depthOralCm, 9.5, 'neonate depth');
  e = Peds.ett(0.1, 1.5);
  check(e.cuffed == null, 'no cuffed in preterm'); near(e.uncuffed, 3.0, '1.5 kg uncuffed');
  near(Peds.ett(0.1, 0.8).uncuffed, 2.5, '0.8 kg uncuffed');
  e = Peds.ett(9, 9);
  near(e.cuffed, 3.5, '9mo cuffed'); near(e.depthOralCm, 12, '9mo depth');
  near(Peds.ett(216, 70).cuffed, 8.0, 'ETT cap');
  near(Peds.roundToHalfDown(4.0), 4.0, 'round exact'); near(Peds.roundToHalfDown(4.3), 4.5, 'round 4.3');
  near(Peds.roundToHalfDown(4.2), 4.0, 'round 4.2');

  check(Peds.lma(4).size === '1' && Peds.lma(5).size === '1.5', 'lma boundaries');
  check(Peds.lma(18).size === '2' && Peds.lma(20).size === '2.5', 'lma 2/2.5');
  check(Peds.lma(65).size === '4' && Peds.lma(120).size === '6', 'lma large');
  check(Peds.lma(18).maxCuffML === 10, 'lma cuff vol');

  near(Peds.maintenanceMLPerHr(8), 32, '4-2-1 8kg'); near(Peds.maintenanceMLPerHr(15), 50, '4-2-1 15kg');
  near(Peds.maintenanceMLPerHr(30), 70, '4-2-1 30kg');
  near(Peds.ebvPerKg(0.3), 85, 'EBV neonate'); near(Peds.ebvPerKg(60), 75, 'EBV child');
  near(Peds.maxAllowableBloodLoss(1500, 36, 24), 600, 'MABL');
  check(Peds.maxAllowableBloodLoss(1500, 24, 30) == null, 'MABL invalid');

  near(Peds.vitals(60).lowSBP, 80, 'SBP 5y'); check(Peds.vitals(3).group === 'Infant', 'vitals infant');
  check(Peds.laryngoscopeBlade(60) === 'Miller 2 / Mac 2', 'blade 5y');
}

// Adult ventilation / airway / fluids / blood loss
{
  // ARDSNet: 6 ft (182.88 cm) male → ~77.6 kg PBW; 6 mL/kg ≈ 466 mL (matches the published worked example)
  near(Adult.pbw(182.88, 'male'), 50 + 0.91 * (182.88 - 152.4), 'PBW male');
  near(Adult.pbw(182.88, 'male'), 77.7, 'PBW male ≈ 77.7', 0.2);
  near(Adult.pbw(165, 'female'), 45.5 + 0.91 * 12.6, 'PBW female');
  near(Adult.tidalVolumeML(Adult.pbw(182.88, 'male'), 6), 466, 'TV 6 mL/kg', 2);
  check(Adult.pbw(null, 'male') === null && Adult.pbw(175, null) === null, 'PBW needs height and sex');
  check(Adult.pbw(110, 'male') === null, 'PBW rejects very short heights');
  // Same equation as uncapped Devine with rounded constants (0.91 kg/cm vs 2.3 kg/in = 0.9055 kg/cm): within ~0.15 kg.
  near(Adult.pbw(175, 'male'), makeMetrics({ tbw: 50, heightCm: 175, sex: 'male' }).idealFormulaKg, 'PBW ≈ uncapped Devine', 0.15);

  let d = Adult.ettDepth(175, 'male');
  check(d.ruleCm === 23, '23 cm rule male'); near(d.chulaCm, 21.5, 'Chula 175 cm');
  d = Adult.ettDepth(160, 'female');
  check(d.ruleCm === 21, '21 cm rule female'); near(d.chulaCm, 20, 'Chula 160 cm');
  d = Adult.ettDepth(null, null);
  check(d.ruleCm === null && d.chulaCm === null, 'ETT depth needs inputs');

  near(Adult.ebvPerKg('male'), 70, 'EBV/kg male'); near(Adult.ebvPerKg('female'), 65, 'EBV/kg female');
  check(Adult.ebvPerKg(null) === null, 'EBV/kg needs sex');

  near(maintenanceMLPerHr(70), 110, '4-2-1 70 kg'); near(maintenanceMLPerHr(100), 140, '4-2-1 100 kg');
  near(maintenanceMLPerHr(10), 40, '4-2-1 10 kg'); near(maintenanceMLPerHr(20), 60, '4-2-1 20 kg');

  // MABL by Hgb: 70 kg male, EBV 4900, Hgb 13 → 7: 4900 × 6 / 10 = 2940
  near(maxAllowableBloodLoss(4900, 13, 7), 2940, 'MABL Hgb 13→7');
  // Raising the threshold to 8 shrinks it: 4900 × 5 / 10.5 = 2333
  near(maxAllowableBloodLoss(4900, 13, 8), 2333.3, 'MABL Hgb 13→8', 0.1);
  check(maxAllowableBloodLoss(4900, 7, 7) === null, 'MABL none when start == threshold');
  check(maxAllowableBloodLoss(4900, 6, 7) === null, 'MABL none when start < threshold');
  check(maxAllowableBloodLoss(0, 13, 7) === null && maxAllowableBloodLoss(4900, 0, 7) === null, 'MABL rejects zeros');
  check(Peds.maxAllowableBloodLoss === maxAllowableBloodLoss, 'Peds shares MABL implementation');
}

// Home-screen induction drugs
{
  check(Data.home.length === 3, 'three home drugs');
  const ids = Data.home.map(m => m.id);
  check(new Set(ids).size === 3 && ids.every(i => i.startsWith('home_')), 'home ids unique + prefixed');
  const all = Data.adult.concat(Data.pediatric).map(m => m.id);
  check(ids.every(i => !all.includes(i)), 'home ids do not collide with list ids');
  for (const h of Data.home) {
    const base = Data.adult.find(m => m.id === h.baseId);
    check(!!base, h.id + ' has a base drug');
    check(h.concentration === base.concentration && h.presets === base.presets && h.concUnit === base.concUnit, h.id + ' shares concentration with base');
    check(h.low > 0 && h.high >= h.low, h.id + ' range ordered');
  }
  const [prop, roc, sux] = Data.home;
  // 70 kg: propofol 0.5–2 mg/kg @10 mg/mL → 35–140 mg, 3.5–14 mL
  let r = computeDose(prop, 70);
  near(r.doseLow, 35, 'home propofol low'); near(r.doseHigh, 140, 'home propofol high');
  near(r.volumeLow, 3.5, 'home propofol vol low'); near(r.volumeHigh, 14, 'home propofol vol high');
  // rocuronium 0.6 mg/kg @10 mg/mL → 42 mg, 4.2 mL
  r = computeDose(roc, 70); near(r.doseLow, 42, 'home roc mg'); near(r.volumeHigh, 4.2, 'home roc mL');
  // succinylcholine 1 mg/kg @20 mg/mL → 70 mg, 3.5 mL
  r = computeDose(sux, 70); near(r.doseLow, 70, 'home sux mg'); near(r.volumeHigh, 3.5, 'home sux mL');
  check(Fmt.perKg(prop) === '0.5–2 mg/kg' && Fmt.perKg(roc) === '0.6 mg/kg' && Fmt.perKg(sux) === '1 mg/kg', 'home per-kg labels');
  // 4–6 mL/kg tidal volume at PBW 75.1 kg
  near(Adult.tidalVolumeML(Adult.pbw(180, 'male'), 4), 300.5, 'TV 4 mL/kg', 0.5);
  near(Adult.tidalVolumeML(Adult.pbw(180, 'male'), 6), 450.7, 'TV 6 mL/kg @180', 0.5);
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
