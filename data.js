/* OR Dose — default drug table.
 * Doses are commonly cited adult / pediatric anesthesia ranges and are starting points only. Every value
 * (dose range, concentration, suggested weight basis) can be edited in the app, and the table must be
 * reviewed against your local formulary and protocols before clinical use.
 */
(function (root) {
  'use strict';

  const CATEGORIES = [
    { id: 'induction', name: 'Induction & Sedation', chip: 'Induction' },
    { id: 'opioid', name: 'Opioids', chip: 'Opioids' },
    { id: 'nmb', name: 'Neuromuscular Blockers', chip: 'NMB' },
    { id: 'reversal', name: 'Reversal & Anticholinergics', chip: 'Reversal' },
    { id: 'vasoactive', name: 'Hemodynamics', chip: 'Hemodynamics' },
    { id: 'infusion', name: 'Infusions', chip: 'Infusions' },
    { id: 'adjunct', name: 'Adjuncts & Antiemetics', chip: 'Adjuncts' },
    { id: 'heme', name: 'Antibiotics & Hematologic', chip: 'Abx / Heme' },
    { id: 'local', name: 'Local Anesthetics', chip: 'Local' },
    { id: 'emergency', name: 'Emergency', chip: 'Emergency' },
  ];

  /** o: basis, conc, presets, concUnit, floor, cap, max, percent, peds, label, note */
  function bolus(id, name, category, unit, low, high, o) {
    return {
      id: o.peds ? 'p_' + id : id, name, category, kind: 'bolus',
      doseUnit: unit, concUnit: o.concUnit || unit, low, high,
      isMaximum: !!o.max, cap: o.cap == null ? null : o.cap, floor: o.floor == null ? null : o.floor,
      basis: o.basis, concentration: o.conc, presets: o.presets,
      showPercent: !!o.percent, doseLabel: o.label || null, note: o.note || null, pediatric: !!o.peds,
    };
  }

  function infusion(id, name, unit, kind, low, high, o) {
    return {
      id, name, category: 'infusion', kind,
      doseUnit: unit, concUnit: o.concUnit || unit, low, high,
      isMaximum: false, cap: null, floor: null,
      basis: o.basis, concentration: o.conc, presets: o.presets,
      showPercent: false, doseLabel: null, note: o.note || null, pediatric: false,
    };
  }

  const adult = [
    // Induction & sedation
    bolus('propofol', 'Propofol', 'induction', 'mg', 1.5, 2.5, { basis: 'ibw', conc: 10, presets: [10, 20],
      note: 'Induction dose scales with lean mass. Reduce for elderly, frail or hemodynamically unstable patients.' }),
    bolus('etomidate', 'Etomidate', 'induction', 'mg', 0.2, 0.3, { basis: 'ibw', conc: 2, presets: [2] }),
    bolus('ketamine', 'Ketamine', 'induction', 'mg', 1, 2, { basis: 'ibw', conc: 10, presets: [10, 50, 100],
      note: 'Induction. Sub-dissociative analgesia is ~0.1–0.5 mg/kg.' }),
    bolus('midazolam', 'Midazolam', 'induction', 'mg', 0.02, 0.05, { basis: 'tbw', conc: 1, presets: [1, 2, 5],
      note: 'Anxiolysis / premedication.' }),
    bolus('dexmedetomidine', 'Dexmedetomidine (load)', 'induction', 'mcg', 0.5, 1, { basis: 'ibw', conc: 4, presets: [4, 8, 100],
      note: 'Give loading dose over at least 10 min.' }),

    // Opioids
    bolus('fentanyl', 'Fentanyl', 'opioid', 'mcg', 0.5, 2, { basis: 'ibw', conc: 50, presets: [10, 50] }),
    bolus('remifentanil', 'Remifentanil (bolus)', 'opioid', 'mcg', 0.5, 1, { basis: 'ibw', conc: 50, presets: [20, 25, 50, 100],
      note: 'Give slowly over 30–60 s.' }),
    bolus('hydromorphone', 'Hydromorphone', 'opioid', 'mg', 0.005, 0.02, { basis: 'ibw', conc: 0.2, presets: [0.2, 1, 2, 10] }),
    bolus('morphine', 'Morphine', 'opioid', 'mg', 0.05, 0.1, { basis: 'ibw', conc: 1, presets: [1, 2, 4, 10] }),
    bolus('methadone', 'Methadone', 'opioid', 'mg', 0.1, 0.2, { basis: 'ibw', conc: 10, presets: [10], cap: 20,
      note: 'Long-acting; protocols vary. Use ideal weight.' }),

    // Neuromuscular blockers
    bolus('rocuronium', 'Rocuronium', 'nmb', 'mg', 0.6, 1.2, { basis: 'ibw', conc: 10, presets: [10],
      note: '0.6 mg/kg standard intubating; 1.0–1.2 mg/kg for RSI.' }),
    bolus('succinylcholine', 'Succinylcholine', 'nmb', 'mg', 1, 1.5, { basis: 'tbw', conc: 20, presets: [20, 100],
      note: 'Dose on total body weight.' }),
    bolus('vecuronium', 'Vecuronium', 'nmb', 'mg', 0.08, 0.1, { basis: 'ibw', conc: 1, presets: [1, 2] }),
    bolus('cisatracurium', 'Cisatracurium', 'nmb', 'mg', 0.1, 0.2, { basis: 'ibw', conc: 2, presets: [2, 10] }),

    // Reversal & anticholinergics
    bolus('sugammadex', 'Sugammadex', 'reversal', 'mg', 2, 4, { basis: 'tbw', conc: 100, presets: [100],
      note: '2 mg/kg for TOF count ≥2; 4 mg/kg for deep block (PTC 1–2); 16 mg/kg for immediate reversal after rocuronium.' }),
    bolus('neostigmine', 'Neostigmine', 'reversal', 'mg', 0.03, 0.07, { basis: 'ibw', conc: 1, presets: [0.5, 1], cap: 5,
      note: 'Maximum 5 mg. Give with an anticholinergic.' }),
    bolus('glycopyrrolate', 'Glycopyrrolate', 'reversal', 'mg', 0.004, 0.01, { basis: 'tbw', conc: 0.2, presets: [0.2], cap: 0.4,
      note: 'With neostigmine: about 0.2 mg per 1 mg neostigmine.' }),
    bolus('atropine', 'Atropine', 'reversal', 'mg', 0.01, 0.02, { basis: 'tbw', conc: 0.4, presets: [0.1, 0.4, 1], cap: 1,
      note: 'Bradycardia; typical adult dose 0.5–1 mg.' }),

    // Hemodynamics (bolus)
    bolus('phenylephrine', 'Phenylephrine', 'vasoactive', 'mcg', 0.5, 2, { basis: 'tbw', conc: 100, presets: [40, 100],
      note: 'Typical adult bolus 50–200 mcg.' }),
    bolus('ephedrine', 'Ephedrine', 'vasoactive', 'mg', 0.05, 0.15, { basis: 'tbw', conc: 5, presets: [5, 50],
      note: 'Typical adult bolus 5–10 mg.' }),
    bolus('epi_bolus', 'Epinephrine (bolus)', 'vasoactive', 'mcg', 0.05, 0.15, { basis: 'tbw', conc: 10, presets: [10, 100],
      note: 'Small-dose hypotension/bronchospasm bolus. Anaphylaxis: titrate 10–100 mcg IV.' }),
    bolus('labetalol', 'Labetalol', 'vasoactive', 'mg', 0.1, 0.25, { basis: 'tbw', conc: 5, presets: [5], cap: 20,
      note: 'Titrate in small increments.' }),
    bolus('esmolol', 'Esmolol (bolus)', 'vasoactive', 'mg', 0.5, 1, { basis: 'tbw', conc: 10, presets: [10, 20] }),

    // Infusions
    infusion('propofol_inf', 'Propofol infusion', 'mcg', 'infusionPerMin', 25, 150, { basis: 'tbw', conc: 10, concUnit: 'mg', presets: [10, 20],
      note: 'Maintenance (TIVA/sedation). Sedation is typically 25–75 mcg/kg/min.' }),
    infusion('remi_inf', 'Remifentanil infusion', 'mcg', 'infusionPerMin', 0.05, 0.3, { basis: 'ibw', conc: 50, presets: [20, 25, 40, 50, 100] }),
    infusion('dex_inf', 'Dexmedetomidine infusion', 'mcg', 'infusionPerHour', 0.2, 1, { basis: 'ibw', conc: 4, presets: [4, 8] }),
    infusion('ketamine_inf', 'Ketamine infusion', 'mg', 'infusionPerHour', 0.1, 0.5, { basis: 'ibw', conc: 1, presets: [1, 2, 5, 10],
      note: 'Sub-dissociative analgesic dosing.' }),
    infusion('lido_inf', 'Lidocaine infusion', 'mg', 'infusionPerHour', 1, 2, { basis: 'ibw', conc: 4, presets: [4, 8],
      note: 'Use ideal weight; stop if signs of toxicity.' }),
    infusion('phenylephrine_inf', 'Phenylephrine infusion', 'mcg', 'infusionPerMin', 0.25, 1, { basis: 'tbw', conc: 100, presets: [40, 100, 200] }),
    infusion('norepi_inf', 'Norepinephrine infusion', 'mcg', 'infusionPerMin', 0.01, 0.3, { basis: 'tbw', conc: 16, presets: [4, 8, 16, 32, 64],
      note: '4 mg/250 mL = 16 mcg/mL; 8 mg/250 mL = 32 mcg/mL.' }),
    infusion('epi_inf', 'Epinephrine infusion', 'mcg', 'infusionPerMin', 0.01, 0.1, { basis: 'tbw', conc: 4, presets: [4, 8, 16],
      note: '1 mg/250 mL = 4 mcg/mL; 4 mg/250 mL = 16 mcg/mL.' }),
    infusion('esmolol_inf', 'Esmolol infusion', 'mcg', 'infusionPerMin', 50, 200, { basis: 'tbw', conc: 10, concUnit: 'mg', presets: [10, 20] }),
    infusion('dobutamine_inf', 'Dobutamine infusion', 'mcg', 'infusionPerMin', 2, 20, { basis: 'tbw', conc: 1, concUnit: 'mg', presets: [0.5, 1, 2, 4] }),

    // Adjuncts & antiemetics
    bolus('ondansetron', 'Ondansetron', 'adjunct', 'mg', 0.05, 0.1, { basis: 'tbw', conc: 2, presets: [2], cap: 4 }),
    bolus('dexamethasone', 'Dexamethasone', 'adjunct', 'mg', 0.05, 0.15, { basis: 'tbw', conc: 10, presets: [4, 10], cap: 10,
      note: 'PONV prophylaxis typically 4–8 mg.' }),
    bolus('acetaminophen', 'Acetaminophen IV', 'adjunct', 'mg', 15, 15, { basis: 'tbw', conc: 10, presets: [10], cap: 1000,
      note: 'Adults ≥50 kg: 1,000 mg. Max 75 mg/kg/day (4 g).' }),
    bolus('ketorolac', 'Ketorolac', 'adjunct', 'mg', 0.25, 0.5, { basis: 'tbw', conc: 30, presets: [15, 30], cap: 30,
      note: 'Check renal function, bleeding risk and surgeon preference.' }),
    bolus('lidocaine_iv', 'Lidocaine IV bolus', 'adjunct', 'mg', 1, 1.5, { basis: 'ibw', conc: 20, presets: [10, 20] }),

    // Antibiotics & hematologic
    bolus('txa', 'Tranexamic acid', 'heme', 'mg', 10, 15, { basis: 'tbw', conc: 100, presets: [100],
      note: 'Loading dose; infuse over 10–20 min.' }),
    bolus('heparin', 'Heparin (systemic)', 'heme', 'units', 70, 100, { basis: 'tbw', conc: 1000, presets: [1000, 5000, 10000],
      note: 'Vascular: ~70–100 units/kg, then titrate to ACT. Cardiac bypass: 300–400 units/kg.' }),

    // Local anesthetics (maximum single doses)
    bolus('bupivacaine', 'Bupivacaine (plain)', 'local', 'mg', 2.5, 2.5, { basis: 'ibw', conc: 2.5, presets: [2.5, 5, 7.5], cap: 175, max: true, percent: true,
      note: 'Max single dose 2.5 mg/kg (175 mg). Lower for vascular sites, elderly, hepatic or cardiac disease.' }),
    bolus('bupivacaine_epi', 'Bupivacaine + epinephrine', 'local', 'mg', 3, 3, { basis: 'ibw', conc: 2.5, presets: [2.5, 5, 7.5], cap: 225, max: true, percent: true,
      note: 'Max single dose 3 mg/kg (225 mg).' }),
    bolus('lidocaine_plain', 'Lidocaine (plain)', 'local', 'mg', 4.5, 4.5, { basis: 'ibw', conc: 10, presets: [5, 10, 20], cap: 300, max: true, percent: true,
      note: 'Max single dose 4.5 mg/kg (300 mg).' }),
    bolus('lidocaine_epi', 'Lidocaine + epinephrine', 'local', 'mg', 7, 7, { basis: 'ibw', conc: 10, presets: [5, 10, 20], cap: 500, max: true, percent: true,
      note: 'Max single dose 7 mg/kg (500 mg).' }),
    bolus('ropivacaine', 'Ropivacaine', 'local', 'mg', 3, 3, { basis: 'ibw', conc: 5, presets: [2, 5, 7.5, 10], cap: 200, max: true, percent: true,
      note: 'Max single dose ~3 mg/kg (200 mg).' }),

    // Emergency
    bolus('dantrolene', 'Dantrolene (malignant hyperthermia)', 'emergency', 'mg', 2.5, 2.5, { basis: 'tbw', conc: 20 / 60, presets: [20 / 60, 50],
      note: 'Initial bolus; repeat until symptoms resolve, up to 10 mg/kg. Dantrium/Revonto: 20 mg vial in 60 mL sterile water (0.33 mg/mL). Ryanodex: 250 mg in 5 mL (50 mg/mL).' }),
    bolus('lipid', 'Lipid emulsion 20% (LAST)', 'emergency', 'mg', 300, 300, { basis: 'ibw', conc: 200, presets: [200], cap: 20000,
      label: '1.5 mL/kg of 20% (300 mg/kg)',
      note: 'Bolus over 2–3 min (≈100 mL max), then 0.25 mL/kg/min. Use lean body weight.' }),
    bolus('bicarb', 'Sodium bicarbonate', 'emergency', 'mEq', 1, 1, { basis: 'tbw', conc: 1, presets: [0.5, 1], cap: 100,
      note: '8.4% = 1 mEq/mL; 4.2% = 0.5 mEq/mL.' }),
  ];

  // Pediatric (dosed on total body weight)
  const P = { peds: true, basis: 'tbw' };
  function ped(o) { return Object.assign({}, P, o); }

  const pediatric = [
    // Induction & sedation
    bolus('propofol', 'Propofol', 'induction', 'mg', 2.5, 3.5, ped({ conc: 10, presets: [10, 20],
      note: 'Younger children need higher mg/kg; reduce if unstable.' })),
    bolus('etomidate', 'Etomidate', 'induction', 'mg', 0.2, 0.4, ped({ conc: 2, presets: [2] })),
    bolus('ketamine', 'Ketamine IV', 'induction', 'mg', 1, 2, ped({ conc: 10, presets: [10, 50] })),
    bolus('ketamine_im', 'Ketamine IM', 'induction', 'mg', 4, 5, ped({ conc: 50, presets: [50, 100] })),
    bolus('midazolam_iv', 'Midazolam IV', 'induction', 'mg', 0.05, 0.1, ped({ conc: 1, presets: [1, 5], cap: 5 })),
    bolus('midazolam_po', 'Midazolam PO premed', 'induction', 'mg', 0.25, 0.5, ped({ conc: 2, presets: [2], cap: 20,
      note: 'Oral syrup 2 mg/mL; give 20–30 min before induction.' })),
    bolus('dexmedetomidine', 'Dexmedetomidine IV', 'induction', 'mcg', 0.5, 1, ped({ conc: 4, presets: [4, 8],
      note: 'Load over ≥10 min.' })),
    bolus('dexmedetomidine_in', 'Dexmedetomidine intranasal', 'induction', 'mcg', 2, 3, ped({ conc: 100, presets: [100],
      note: 'Use an atomizer; split between nares.' })),

    // Opioids
    bolus('fentanyl', 'Fentanyl', 'opioid', 'mcg', 1, 2, ped({ conc: 10, presets: [10, 50],
      note: 'Commonly diluted to 10 mcg/mL for small patients.' })),
    bolus('morphine', 'Morphine', 'opioid', 'mg', 0.05, 0.1, ped({ conc: 1, presets: [1, 2] })),
    bolus('hydromorphone', 'Hydromorphone', 'opioid', 'mg', 0.005, 0.015, ped({ conc: 0.2, presets: [0.2, 1] })),

    // Neuromuscular blockers
    bolus('rocuronium', 'Rocuronium', 'nmb', 'mg', 0.6, 1.2, ped({ conc: 10, presets: [10] })),
    bolus('succinylcholine', 'Succinylcholine IV', 'nmb', 'mg', 1, 2, ped({ conc: 20, presets: [20, 100],
      note: 'Infants toward the upper end. IM dose 4–5 mg/kg. Rule out contraindications (hyperkalemia risk, myopathy).' })),
    bolus('vecuronium', 'Vecuronium', 'nmb', 'mg', 0.1, 0.1, ped({ conc: 1, presets: [1, 2] })),
    bolus('cisatracurium', 'Cisatracurium', 'nmb', 'mg', 0.1, 0.15, ped({ conc: 2, presets: [2, 10] })),

    // Reversal & anticholinergics
    bolus('sugammadex', 'Sugammadex', 'reversal', 'mg', 2, 4, ped({ conc: 100, presets: [100],
      note: 'US labeling: age 2 years and older. 2 mg/kg moderate block; 4 mg/kg deep.' })),
    bolus('neostigmine', 'Neostigmine', 'reversal', 'mg', 0.03, 0.07, ped({ conc: 1, presets: [0.5, 1], cap: 5 })),
    bolus('glycopyrrolate', 'Glycopyrrolate', 'reversal', 'mg', 0.004, 0.01, ped({ conc: 0.2, presets: [0.2], cap: 0.4,
      note: 'With neostigmine: about 0.2 mg per 1 mg neostigmine.' })),
    bolus('atropine', 'Atropine', 'reversal', 'mg', 0.01, 0.02, ped({ conc: 0.1, presets: [0.1, 0.4], floor: 0.1, cap: 0.5,
      note: 'Minimum 0.1 mg. Maximum 0.5 mg in children; adolescents up to 1 mg.' })),

    // Hemodynamics
    bolus('phenylephrine', 'Phenylephrine', 'vasoactive', 'mcg', 0.5, 2, ped({ conc: 10, presets: [10, 100] })),
    bolus('ephedrine', 'Ephedrine', 'vasoactive', 'mg', 0.1, 0.3, ped({ conc: 5, presets: [5] })),

    // Adjuncts & antiemetics
    bolus('ondansetron', 'Ondansetron', 'adjunct', 'mg', 0.05, 0.1, ped({ conc: 2, presets: [2], cap: 4 })),
    bolus('dexamethasone', 'Dexamethasone', 'adjunct', 'mg', 0.1, 0.15, ped({ conc: 10, presets: [4, 10], cap: 8,
      note: 'PONV. Airway edema protocols use higher doses (up to 0.5 mg/kg).' })),
    bolus('acetaminophen', 'Acetaminophen IV', 'adjunct', 'mg', 12.5, 15, ped({ conc: 10, presets: [10], cap: 1000,
      note: 'Neonates 10–12.5 mg/kg. Watch cumulative daily dose.' })),
    bolus('ketorolac', 'Ketorolac', 'adjunct', 'mg', 0.25, 0.5, ped({ conc: 15, presets: [15, 30], cap: 30,
      note: 'Confirm age eligibility, renal function and surgical bleeding risk.' })),
    bolus('lidocaine_iv', 'Lidocaine IV', 'adjunct', 'mg', 1, 1.5, ped({ conc: 10, presets: [10, 20] })),

    // Antibiotics & hematologic
    bolus('cefazolin', 'Cefazolin', 'heme', 'mg', 30, 30, ped({ conc: 100, presets: [100, 200], cap: 2000,
      note: 'Max 2 g (3 g if ≥120 kg). Give within 60 min before incision.' })),
    bolus('txa', 'Tranexamic acid', 'heme', 'mg', 10, 15, ped({ conc: 100, presets: [100],
      note: 'Spine, craniofacial and cardiac protocols use higher loading and infusion doses.' })),

    // Local anesthetics (maximum single doses)
    bolus('bupivacaine', 'Bupivacaine (plain)', 'local', 'mg', 2.5, 2.5, ped({ conc: 2.5, presets: [1.25, 2.5, 5], cap: 175, max: true, percent: true,
      note: 'Max 2.5 mg/kg. Lower in neonates and young infants.' })),
    bolus('lidocaine_plain', 'Lidocaine (plain)', 'local', 'mg', 4.5, 4.5, ped({ conc: 10, presets: [5, 10, 20], cap: 300, max: true, percent: true })),
    bolus('lidocaine_epi', 'Lidocaine + epinephrine', 'local', 'mg', 7, 7, ped({ conc: 10, presets: [5, 10, 20], cap: 500, max: true, percent: true })),
    bolus('ropivacaine', 'Ropivacaine', 'local', 'mg', 3, 3, ped({ conc: 2, presets: [2, 5], cap: 200, max: true, percent: true,
      note: 'Max single dose ~3 mg/kg.' })),

    // Emergency
    bolus('epi_arrest', 'Epinephrine (cardiac arrest)', 'emergency', 'mg', 0.01, 0.01, ped({ conc: 0.1, presets: [0.1, 1], cap: 1,
      label: '0.01 mg/kg (10 mcg/kg)',
      note: '0.1 mg/mL (1:10,000) IV/IO every 3–5 min. Max 1 mg.' })),
    bolus('adenosine', 'Adenosine', 'emergency', 'mg', 0.1, 0.2, ped({ conc: 3, presets: [3], cap: 12,
      note: 'First dose 0.1 mg/kg (max 6 mg); second 0.2 mg/kg (max 12 mg). Rapid push with flush.' })),
    bolus('amiodarone', 'Amiodarone', 'emergency', 'mg', 5, 5, ped({ conc: 50, presets: [50], cap: 300 })),
    bolus('cacl', 'Calcium chloride', 'emergency', 'mg', 10, 20, ped({ conc: 100, presets: [100], cap: 1000,
      note: '10% = 100 mg/mL. Central line preferred.' })),
    bolus('cagluconate', 'Calcium gluconate', 'emergency', 'mg', 30, 60, ped({ conc: 100, presets: [100], cap: 3000,
      note: '10% = 100 mg/mL.' })),
    bolus('bicarb', 'Sodium bicarbonate', 'emergency', 'mEq', 1, 1, ped({ conc: 0.5, presets: [0.5, 1], cap: 100,
      note: '4.2% = 0.5 mEq/mL (infants/children); 8.4% = 1 mEq/mL.' })),
    bolus('dextrose', 'Dextrose (hypoglycemia)', 'emergency', 'mg', 500, 1000, ped({ conc: 100, presets: [100, 250, 500], cap: 25000,
      note: 'D10 = 100 mg/mL (5–10 mL/kg); D25 = 250 mg/mL; D50 = 500 mg/mL.' })),
    bolus('dantrolene', 'Dantrolene (malignant hyperthermia)', 'emergency', 'mg', 2.5, 2.5, ped({ conc: 20 / 60, presets: [20 / 60, 50],
      note: 'Repeat until symptoms resolve, up to 10 mg/kg. 20 mg vial in 60 mL sterile water (0.33 mg/mL); Ryanodex 250 mg in 5 mL (50 mg/mL).' })),
    bolus('lipid', 'Lipid emulsion 20% (LAST)', 'emergency', 'mg', 300, 300, ped({ conc: 200, presets: [200], cap: 20000,
      label: '1.5 mL/kg of 20% (300 mg/kg)',
      note: 'Bolus over 2–3 min, then 0.25 mL/kg/min.' })),
  ];

  // Home-screen induction drugs. They carry their own dose range (and highlighted weight) but always take their
  // concentration from the matching drug in the Adult list (baseId), so a drug can never show two concentrations.
  function homeVariant(baseId, low, high) {
    const base = adult.find(m => m.id === baseId);
    return Object.assign({}, base, { id: 'home_' + baseId, baseId, low, high });
  }
  const home = [
    homeVariant('propofol', 0.5, 2),
    homeVariant('rocuronium', 0.6, 0.6),
    homeVariant('succinylcholine', 1, 1),
  ];

  const api = { CATEGORIES, adult, pediatric, home };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORData = api;
})(typeof self !== 'undefined' ? self : this);
