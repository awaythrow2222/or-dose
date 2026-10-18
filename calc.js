/* OR Dose — calculation core. No DOM access, so it runs unchanged in the browser and in Node tests. */
(function (root) {
  'use strict';

  // ───────────────────────── Formatting ─────────────────────────

  const Fmt = (() => {
    function roundTo(x, d) {
      const p = Math.pow(10, d);
      return Math.round(x * p + (x >= 0 ? 1e-9 : -1e-9)) / p;
    }
    function str(x, d) {
      return roundTo(x, d).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
    }
    /** More precision for small numbers, none for large ones. */
    function number(x) {
      const a = Math.abs(x);
      const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 ? 2 : 3;
      return str(x, d);
    }
    function fixed(x, d) { return str(x, Math.min(Math.max(d === undefined ? 1 : d, 0), 3)); }
    function range(lo, hi) {
      const a = number(lo), b = number(hi);
      return a === b ? a : a + '–' + b;
    }
    /** Range with unit; mcg quantities of 1000 or more are shown in mg. */
    function amount(lo, hi, unit) {
      if (unit === 'mcg' && Math.max(lo, hi) >= 1000) return range(lo / 1000, hi / 1000) + ' mg';
      return range(lo, hi) + ' ' + unit;
    }
    function concentration(c, unit, percent) {
      const base = number(c) + ' ' + unit + '/mL';
      if (!percent || unit !== 'mg') return base;
      return number(c / 10) + '% · ' + base;
    }
    function perKgSuffix(kind) {
      return kind === 'infusionPerMin' ? '/min' : kind === 'infusionPerHour' ? '/hr' : '';
    }
    function perKg(med) {
      if (med.doseLabel) return med.doseLabel;
      const unit = med.doseUnit + '/kg' + perKgSuffix(med.kind);
      if (med.isMaximum) return 'Max ' + number(med.high) + ' ' + unit;
      return range(med.low, med.high) + ' ' + unit;
    }
    return { number, fixed, range, amount, concentration, perKg, perKgSuffix };
  })();

  // ───────────────────────── Body metrics ─────────────────────────

  const MIN_HEIGHT_FOR_IBW_CM = 140;
  const ADJUSTMENT_FACTOR = 0.4;

  /** Body-size values for one patient. Weight is required; derived values are null when inputs are missing. */
  function makeMetrics(input) {
    const tbw = input.tbw;
    const heightCm = input.heightCm == null ? null : input.heightCm;
    const sex = input.sex || null; // 'male' | 'female'
    const ageMonths = input.ageMonths == null ? null : input.ageMonths;

    // Devine, uncapped: 50 (M) / 45.5 (F) kg + 2.3 kg per inch over 5 ft.
    const idealFormulaKg = (heightCm != null && sex && heightCm >= MIN_HEIGHT_FOR_IBW_CM)
      ? (sex === 'male' ? 50 : 45.5) + 2.3 * (heightCm / 2.54 - 60)
      : null;

    const ibw = idealFormulaKg == null ? null : Math.min(idealFormulaKg, tbw);
    const abw = idealFormulaKg == null ? null
      : (tbw > idealFormulaKg ? idealFormulaKg + ADJUSTMENT_FACTOR * (tbw - idealFormulaKg) : tbw);
    const bmi = heightCm != null && heightCm > 0 ? tbw / Math.pow(heightCm / 100, 2) : null;
    const bsa = heightCm != null && heightCm > 0 ? Math.sqrt(heightCm * tbw / 3600) : null; // Mosteller
    let lbw = null; // Janmahasatian
    if (bmi != null && sex) {
      lbw = sex === 'male' ? 9270 * tbw / (6680 + 216 * bmi) : 9270 * tbw / (8780 + 244 * bmi);
    }
    const adultEBV = sex ? tbw * (sex === 'male' ? 70 : 65) : null;

    let ibwUnavailableReason = null;
    if (idealFormulaKg == null) {
      if (heightCm != null && heightCm < MIN_HEIGHT_FOR_IBW_CM && sex) ibwUnavailableReason = 'Height under 140 cm — adult IBW formula not valid';
      else if (heightCm == null && !sex) ibwUnavailableReason = 'Enter height and sex for IBW / AdjBW';
      else if (heightCm == null) ibwUnavailableReason = 'Enter height for IBW / AdjBW';
      else ibwUnavailableReason = 'Select sex for IBW / AdjBW';
    }

    return {
      tbw, heightCm, sex, ageMonths,
      idealFormulaKg, ibw, abw, bmi, bsa, lbw, adultEBV,
      tbwBelowIdeal: idealFormulaKg != null && tbw <= idealFormulaKg,
      ibwUnavailableReason,
      weight(basis) { return basis === 'tbw' ? tbw : basis === 'ibw' ? ibw : abw; },
    };
  }

  // ───────────────────────── Dose math ─────────────────────────

  const UNIT_FACTOR = { 'mg>mcg': 1000, 'mcg>mg': 0.001 };
  function unitFactor(from, to) {
    if (from === to) return 1;
    const f = UNIT_FACTOR[from + '>' + to];
    return f === undefined ? null : f;
  }
  /** Concentration expressed in the dose unit per mL. */
  function concInDoseUnits(med) {
    return med.concentration * (unitFactor(med.concUnit, med.doseUnit) || 1);
  }

  function computeDose(med, weight) {
    const isBolus = med.kind === 'bolus';
    function dose(perKg) {
      let d = perKg * weight, capped = false, floored = false;
      if (isBolus) {
        if (med.cap != null && d > med.cap) { d = med.cap; capped = true; }
        if (med.floor != null && d < med.floor) { d = med.floor; floored = true; }
      }
      return { d, capped, floored };
    }
    function volume(d) {
      const perUnit = d / concInDoseUnits(med);
      return med.kind === 'infusionPerMin' ? perUnit * 60 : perUnit; // mL, or mL/hr for infusions
    }
    const lo = dose(med.low), hi = dose(med.high);
    return {
      doseLow: lo.d, doseHigh: hi.d,
      volumeLow: volume(lo.d), volumeHigh: volume(hi.d),
      cappedLow: lo.capped, cappedHigh: hi.capped,
      flooredLow: lo.floored, flooredHigh: hi.floored,
      anyCapped: lo.capped || hi.capped,
      anyFloored: lo.floored || hi.floored,
    };
  }

  // ───────────────────────── Fluids & blood loss (shared by adult and pediatric) ─────────────────────────

  /** 4-2-1 rule, mL/hr. */
  function maintenanceMLPerHr(w) {
    if (w <= 10) return 4 * w;
    if (w <= 20) return 40 + 2 * (w - 10);
    return 60 + (w - 20);
  }

  /** Maximum allowable blood loss, mL: EBV × (start − threshold) / mean(start, threshold). Works for Hgb or Hct. */
  function maxAllowableBloodLoss(ebv, start, threshold) {
    if (!(ebv > 0) || !(start > 0) || !(threshold > 0) || !(start > threshold)) return null;
    return ebv * (start - threshold) / ((start + threshold) / 2);
  }

  // ───────────────────────── Adult ventilation / airway ─────────────────────────

  const Adult = {
    /** ARDSNet predicted body weight (Devine, uncapped) — the weight tidal volumes are based on. */
    pbw(heightCm, sex) {
      if (heightCm == null || !sex || heightCm < 120) return null;
      return (sex === 'male' ? 50 : 45.5) + 0.91 * (heightCm - 152.4);
    },
    tidalVolumeML(pbw, mlPerKg) { return pbw * mlPerKg; },

    /** Oral ETT depth estimates in cm: the 21 (F) / 23 (M) rule, and the Chula height formula (0.1 × height + 4). */
    ettDepth(heightCm, sex) {
      return {
        ruleCm: sex ? (sex === 'male' ? 23 : 21) : null,
        chulaCm: heightCm != null && heightCm >= 120 ? heightCm / 10 + 4 : null,
      };
    },

    /** Estimated blood volume per kg of actual weight, by sex. */
    ebvPerKg(sex) { return sex ? (sex === 'male' ? 70 : 65) : null; },
  };

  // ───────────────────────── Pediatric estimates ─────────────────────────
  // Population rules of thumb for choosing a starting size; always have adjacent sizes available.

  const Peds = {
    /** APLS-style weight estimate from age. */
    estimatedWeightKg(m) {
      const y = m / 12;
      if (m < 1) return 3.5;
      if (m < 12) return m / 2 + 4;
      if (y <= 10) return 2 * (y + 4);
      return 3 * y;
    },

    /** Nearest 0.5 mm, ties rounded down (the smaller tube is the safer first attempt). */
    roundToHalfDown(x) { return Math.ceil(x * 2 - 0.5) / 2; },

    ett(m, weightKg) {
      const y = m / 12;
      let cuffed = null, uncuffed = null, note = null;
      if (m < 1 && weightKg != null && weightKg < 3) {
        uncuffed = weightKg < 1 ? 2.5 : weightKg < 2 ? 3.0 : 3.5;
        note = 'By weight (<3 kg). Cuffed tubes are generally not used.';
      } else if (m < 6) { cuffed = 3.0; uncuffed = 3.5; }
      else if (m < 12) { cuffed = 3.5; uncuffed = 4.0; }
      else {
        cuffed = Math.min(Peds.roundToHalfDown(y / 4 + 3.5), 8.0);
        uncuffed = Math.min(Peds.roundToHalfDown(y / 4 + 4), 8.0);
      }
      let depthOralCm, depthRule;
      if (m < 1) { depthOralCm = (weightKg == null ? 3.5 : weightKg) + 6; depthRule = 'Weight (kg) + 6'; }
      else if (m < 12) { depthOralCm = 3 * (uncuffed == null ? 3.5 : uncuffed); depthRule = '3 × ETT size'; }
      else { depthOralCm = y / 2 + 12; depthRule = 'Age / 2 + 12'; }
      return { cuffed, uncuffed, depthOralCm, depthNasalCm: depthOralCm + 2.5, depthRule, note };
    },

    /** LMA Classic by weight. */
    lma(w) {
      if (w < 5) return { size: '1', maxCuffML: 4 };
      if (w < 10) return { size: '1.5', maxCuffML: 7 };
      if (w < 20) return { size: '2', maxCuffML: 10 };
      if (w < 30) return { size: '2.5', maxCuffML: 14 };
      if (w < 50) return { size: '3', maxCuffML: 20 };
      if (w < 70) return { size: '4', maxCuffML: 30 };
      if (w < 100) return { size: '5', maxCuffML: 40 };
      return { size: '6', maxCuffML: 50 };
    },

    laryngoscopeBlade(m) {
      const y = m / 12;
      if (m < 1) return 'Miller 0–1';
      if (m < 12) return 'Miller 1';
      if (y < 2) return 'Miller 1 / Mac 1';
      if (y < 6) return 'Miller 2 / Mac 2';
      if (y < 12) return 'Mac 2–3 / Miller 2';
      return 'Mac 3 (Miller 2–3)';
    },
    oralAirway(m) {
      const y = m / 12;
      if (m < 3) return '00 (40 mm)';
      if (m < 12) return '0 (50 mm)';
      if (y < 3) return '1 (60 mm)';
      if (y < 8) return '2 (70 mm)';
      if (y < 12) return '3 (80 mm)';
      return '3–4 (80–90 mm)';
    },
    ogNgFr(m) {
      const y = m / 12;
      if (m < 12) return '6–8 Fr';
      if (y < 5) return '8–10 Fr';
      if (y < 10) return '10–12 Fr';
      if (y < 14) return '12–14 Fr';
      return '14–16 Fr';
    },
    foleyFr(m) {
      const y = m / 12;
      if (m < 1) return '5 Fr (feeding tube)';
      if (m < 12) return '6–8 Fr';
      if (y < 4) return '8 Fr';
      if (y < 9) return '8–10 Fr';
      if (y < 13) return '10–12 Fr';
      return '12–14 Fr';
    },
    chestTubeFr(m) {
      const y = m / 12;
      if (m < 1) return '10–14 Fr';
      if (m < 12) return '12–16 Fr';
      if (y < 5) return '16–20 Fr';
      if (y < 9) return '20–24 Fr';
      if (y < 13) return '24–32 Fr';
      return '28–36 Fr';
    },
    ivGauge(m) {
      const y = m / 12;
      if (m < 1) return '24 G';
      if (m < 12) return '22–24 G';
      if (y < 6) return '22 G';
      if (y < 12) return '20–22 G';
      return '18–20 G';
    },
    /** Suction catheter ≈ twice the ETT internal diameter, in French. */
    suctionFr(ettSize) { return ettSize * 2; },

    maintenanceMLPerHr,

    /** Estimated blood volume, mL/kg, by age. */
    ebvPerKg(m) {
      if (m < 1) return 85;
      if (m < 12) return 80;
      if (m < 12 * 18) return 75;
      return 70;
    },

    maxAllowableBloodLoss,

    /** Awake normal ranges (PALS) and the systolic hypotension threshold. */
    vitals(m) {
      const y = m / 12;
      if (m < 1) return { group: 'Neonate', heartRate: '100–205', respRate: '30–53', lowSBP: 60 };
      if (m < 12) return { group: 'Infant', heartRate: '100–180', respRate: '30–53', lowSBP: 70 };
      if (y < 3) return { group: 'Toddler', heartRate: '98–140', respRate: '22–37', lowSBP: 70 + 2 * y };
      if (y < 6) return { group: 'Preschool', heartRate: '80–120', respRate: '20–28', lowSBP: 70 + 2 * y };
      if (y < 12) return { group: 'School age', heartRate: '75–118', respRate: '18–25', lowSBP: 70 + 2 * y };
      return { group: 'Adolescent', heartRate: '60–100', respRate: '12–20', lowSBP: 90 };
    },
  };

  const api = { Fmt, makeMetrics, computeDose, concInDoseUnits, unitFactor, maintenanceMLPerHr, maxAllowableBloodLoss, Adult, Peds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ORCalc = api;
})(typeof self !== 'undefined' ? self : this);
