// ─── LW360 SIMRP Eligibility Calculator ────────────────────────────────────
// Uses BEFORE/AFTER bracket method for FIT (NOT flat marginal rate)
// 2026 Federal Tax Brackets

const SIMRP_PREMIUM_MONTHLY = 1173;
const SIMRP_PREMIUM_ANNUAL = SIMRP_PREMIUM_MONTHLY * 12; // $14,076
const SS_WAGE_BASE = 176100;
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

// 2026 Federal Tax Brackets by filing status
const TAX_BRACKETS = {
  Single: [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ],
  MFJ: [
    { min: 0, max: 23850, rate: 0.10 },
    { min: 23850, max: 96950, rate: 0.12 },
    { min: 96950, max: 206700, rate: 0.22 },
    { min: 206700, max: 394600, rate: 0.24 },
    { min: 394600, max: 501050, rate: 0.32 },
    { min: 501050, max: 751600, rate: 0.35 },
    { min: 751600, max: Infinity, rate: 0.37 },
  ],
  MFS: [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 375800, rate: 0.35 },
    { min: 375800, max: Infinity, rate: 0.37 },
  ],
  HoH: [
    { min: 0, max: 17000, rate: 0.10 },
    { min: 17000, max: 64850, rate: 0.12 },
    { min: 64850, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ],
};

const STANDARD_DEDUCTION = {
  Single: 15000,
  MFJ: 30000,
  MFS: 15000,
  HoH: 22500,
};

// Pay periods per year
const PAY_PERIODS = {
  'Weekly': 52,
  'Biweekly': 26,
  'Semi-Monthly': 24,
  'Monthly': 12,
};

// Fee per period for private sector
const PRIVATE_FEE_MONTHLY = 89.73;
const PRIVATE_FEE_SEMI_MONTHLY = 44.87;
const PRIVATE_FEE_BIWEEKLY = 41.42;
const PRIVATE_FEE_WEEKLY = 20.71;

const SCHOOL_FEE_MONTHLY = 80;
const SCHOOL_EMPLOYER_FEE_MONTHLY = 11;

function getPrivateFeePerPeriod(payFrequency) {
  switch (payFrequency) {
    case 'Weekly': return PRIVATE_FEE_WEEKLY;
    case 'Biweekly': return PRIVATE_FEE_BIWEEKLY;
    case 'Semi-Monthly': return PRIVATE_FEE_SEMI_MONTHLY;
    case 'Monthly': return PRIVATE_FEE_MONTHLY;
    default: return PRIVATE_FEE_SEMI_MONTHLY;
  }
}

function getSchoolFeePerPeriod(payFrequency) {
  const periods = PAY_PERIODS[payFrequency] || 24;
  return SCHOOL_FEE_MONTHLY * 12 / periods;
}

// Calculate FIT using bracket method (before/after)
export function calculateFIT(taxableIncome, filingStatus) {
  if (taxableIncome <= 0) return 0;
  const brackets = TAX_BRACKETS[filingStatus] || TAX_BRACKETS.Single;
  let tax = 0;
  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break;
    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min;
    tax += taxableInBracket * bracket.rate;
  }
  return tax;
}

// Find the top marginal bracket for a given taxable income
function getTopBracket(taxableIncome, filingStatus) {
  const brackets = TAX_BRACKETS[filingStatus] || TAX_BRACKETS.Single;
  for (let i = brackets.length - 1; i >= 0; i--) {
    if (taxableIncome > brackets[i].min) return brackets[i];
  }
  return brackets[0];
}

// Check if taxable income straddles a bracket boundary when premium is applied
function isStraddleZone(taxableBefore, taxableAfter, filingStatus) {
  const bracketBefore = getTopBracket(taxableBefore, filingStatus);
  const bracketAfter = getTopBracket(Math.max(0, taxableAfter), filingStatus);
  return bracketBefore.rate !== bracketAfter.rate;
}

// Main eligibility calculation
export function calculateEligibility(employee, orgSettings = {}) {
  const {
    annual_salary = 0,
    hourly_rate = 0,
    hours_per_week = 0,
    filing_status = 'Single',
    pay_frequency = 'Semi-Monthly',
    current_401k_per_period = 0,
    current_health_insurance_per_period = 0,
    current_hsa_per_period = 0,
    current_other_pretax_per_period = 0,
  } = employee;

  const {
    is_school_district = false,
    is_trs_district = false,
    employee_fee_monthly = null,
  } = orgSettings;

  const periodsPerYear = PAY_PERIODS[pay_frequency] || 24;

  // Step 1: Compute annual gross
  let annualGross = Number(annual_salary) || 0;
  if (!annualGross && hourly_rate && hours_per_week) {
    annualGross = Number(hourly_rate) * Number(hours_per_week) * 52;
  }

  // Step 2: Current pre-tax deductions per year
  const currentPretaxPerPeriod =
    Number(current_401k_per_period) +
    Number(current_health_insurance_per_period) +
    Number(current_hsa_per_period) +
    Number(current_other_pretax_per_period);
  const currentPretaxAnnual = currentPretaxPerPeriod * periodsPerYear;

  // Step 3: Standard deduction
  const standardDeduction = STANDARD_DEDUCTION[filing_status] || STANDARD_DEDUCTION.Single;

  // Step 4: Current taxable income
  const taxableIncomeBefore = Math.max(0, annualGross - standardDeduction - currentPretaxAnnual);

  // Step 5: Current FIT
  const fitBefore = calculateFIT(taxableIncomeBefore, filing_status);

  // Step 6: New pre-tax = current + premium
  const newPretaxAnnual = currentPretaxAnnual + SIMRP_PREMIUM_ANNUAL;

  // Step 7: New taxable income
  const taxableIncomeAfter = Math.max(0, annualGross - standardDeduction - newPretaxAnnual);

  // Step 8: New FIT
  const fitAfter = calculateFIT(taxableIncomeAfter, filing_status);

  // Step 9: FIT savings (before/after method)
  const fitSavingsAnnual = fitBefore - fitAfter;

  // Step 10: SS savings
  let ssSavingsAnnual = 0;
  if (!is_trs_district && annualGross <= SS_WAGE_BASE) {
    ssSavingsAnnual = SIMRP_PREMIUM_ANNUAL * SS_RATE;
  }

  // Step 11: Medicare savings
  const medicareSavingsAnnual = SIMRP_PREMIUM_ANNUAL * MEDICARE_RATE;

  // Step 12: Total tax savings
  const totalTaxSavingsAnnual = fitSavingsAnnual + ssSavingsAnnual + medicareSavingsAnnual;
  const totalTaxSavingsMonthly = totalTaxSavingsAnnual / 12;

  // Fee calculation
  let feeMonthly;
  if (employee_fee_monthly !== null) {
    feeMonthly = Number(employee_fee_monthly);
  } else if (is_school_district) {
    feeMonthly = SCHOOL_FEE_MONTHLY;
  } else {
    feeMonthly = PRIVATE_FEE_MONTHLY;
  }

  let feePerPeriod;
  if (is_school_district) {
    feePerPeriod = getSchoolFeePerPeriod(pay_frequency);
  } else {
    feePerPeriod = getPrivateFeePerPeriod(pay_frequency);
  }

  // Effective FIT rate (for buffer logic)
  const effectiveFitRate = annualGross > 0 ? fitBefore / annualGross : 0;

  // Buffer: $5/month only when FIT rate >= 3%
  const bufferMonthly = effectiveFitRate >= 0.03 ? 5 : 0;

  // Net benefit
  const netBenefitMonthly = totalTaxSavingsMonthly - feeMonthly;
  const netBenefitAnnual = netBenefitMonthly * 12;

  // Premium per period
  const premiumPerPeriod = SIMRP_PREMIUM_ANNUAL / periodsPerYear;

  // Per-period values
  const fitSavingsPerPeriod = fitSavingsAnnual / periodsPerYear;
  const ssSavingsPerPeriod = ssSavingsAnnual / periodsPerYear;
  const medicareSavingsPerPeriod = medicareSavingsAnnual / periodsPerYear;
  const totalTaxSavingsPerPeriod = totalTaxSavingsAnnual / periodsPerYear;
  const netBenefitPerPeriod = netBenefitAnnual / periodsPerYear;

  // Eligibility determination
  let isEligible = true;
  let ineligibleReason = null;

  if (is_school_district && fitBefore <= 0) {
    isEligible = false;
    ineligibleReason = '$0 FIT — cannot cover program fee';
  }

  // Sanity checks
  const warnings = [];
  if (fitSavingsAnnual > fitBefore + 0.01) {
    warnings.push('FIT savings exceeds current FIT liability');
  }
  if (is_school_district && netBenefitMonthly < 0 && isEligible) {
    isEligible = false;
    ineligibleReason = 'Net benefit is negative — fee exceeds savings';
  }
  if (totalTaxSavingsMonthly > 450) {
    warnings.push('Tax savings exceeds $450/month — flagged for review');
  }
  if (feeMonthly > (is_school_district ? 80 : 89.73)) {
    warnings.push('Fee exceeds maximum');
  }

  // Straddle zone detection
  const inStraddleZone = isStraddleZone(taxableIncomeBefore, taxableIncomeAfter, filing_status);

  return {
    // Inputs echoed back
    annual_gross: annualGross,
    filing_status,
    pay_frequency,
    periods_per_year: periodsPerYear,
    standard_deduction: standardDeduction,
    current_pretax_annual: currentPretaxAnnual,

    // Before premium
    taxable_income_before: taxableIncomeBefore,
    fit_before_annual: fitBefore,
    fit_before_monthly: fitBefore / 12,

    // After premium
    new_pretax_annual: newPretaxAnnual,
    taxable_income_after: taxableIncomeAfter,
    fit_after_annual: fitAfter,
    fit_after_monthly: fitAfter / 12,

    // Savings
    fit_savings_annual: fitSavingsAnnual,
    fit_savings_monthly: fitSavingsAnnual / 12,
    fit_savings_per_period: fitSavingsPerPeriod,

    ss_savings_annual: ssSavingsAnnual,
    ss_savings_monthly: ssSavingsAnnual / 12,
    ss_savings_per_period: ssSavingsPerPeriod,

    medicare_savings_annual: medicareSavingsAnnual,
    medicare_savings_monthly: medicareSavingsAnnual / 12,
    medicare_savings_per_period: medicareSavingsPerPeriod,

    total_tax_savings_annual: totalTaxSavingsAnnual,
    total_tax_savings_monthly: totalTaxSavingsMonthly,
    total_tax_savings_per_period: totalTaxSavingsPerPeriod,

    // Fees
    fee_monthly: feeMonthly,
    fee_per_period: feePerPeriod,
    buffer_monthly: bufferMonthly,

    // Net benefit
    net_benefit_monthly: netBenefitMonthly,
    net_benefit_annual: netBenefitAnnual,
    net_benefit_per_period: netBenefitPerPeriod,

    // Premium
    lw_premium_monthly: SIMRP_PREMIUM_MONTHLY,
    lw_premium_per_period: premiumPerPeriod,
    lw_reimbursement_per_period: premiumPerPeriod,

    // Eligibility
    is_eligible: isEligible,
    ineligible_reason: ineligibleReason,
    effective_fit_rate: effectiveFitRate,
    in_straddle_zone: inStraddleZone,
    warnings,

    // Org settings echo
    is_school_district,
    is_trs_district,
  };
}

// Run all 8 mandatory test cases — returns array of { name, passed, expected, actual, details }
export function runValidationTests() {
  const TOLERANCE = 0.02;
  const results = [];

  function assertClose(actual, expected, label) {
    const diff = Math.abs(actual - expected);
    if (diff > TOLERANCE) {
      return { passed: false, message: `${label}: expected ${expected}, got ${actual} (diff: ${diff.toFixed(4)})` };
    }
    return { passed: true, message: `${label}: ${actual.toFixed(2)} ✓` };
  }

  // Test Case 1: Single filer, $60K gross, no pre-tax
  {
    const r = calculateEligibility(
      { annual_salary: 60000, filing_status: 'Single', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.taxable_income_before, 45000, 'Taxable before'),
      assertClose(r.taxable_income_after, 30924, 'Taxable after'),
      assertClose(r.fit_before_annual, 5161.50, 'FIT before'),
      assertClose(r.fit_after_annual, 3472.38, 'FIT after'),
      assertClose(r.fit_savings_annual, 1689.12, 'FIT savings'),
      assertClose(r.fit_savings_monthly, 140.76, 'FIT savings/mo'),
      assertClose(r.ss_savings_annual, 872.71, 'SS savings'),
      assertClose(r.medicare_savings_annual, 204.10, 'Medicare savings'),
      assertClose(r.total_tax_savings_annual, 2765.93, 'Total savings'),
      assertClose(r.total_tax_savings_monthly, 230.49, 'Total savings/mo'),
      assertClose(r.net_benefit_monthly, 140.76, 'Net benefit/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 1: Single $60K no deductions (safe zone)',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 2: Single filer, $75K — straddle zone
  {
    const r = calculateEligibility(
      { annual_salary: 75000, filing_status: 'Single', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.taxable_income_before, 60000, 'Taxable before'),
      assertClose(r.taxable_income_after, 45924, 'Taxable after'),
      assertClose(r.fit_before_annual, 8114.00, 'FIT before'),
      assertClose(r.fit_after_annual, 5272.38, 'FIT after'),
      assertClose(r.fit_savings_annual, 2841.62, 'FIT savings'),
      assertClose(r.fit_savings_monthly, 236.80, 'FIT savings/mo'),
      assertClose(r.total_tax_savings_annual, 3918.43, 'Total savings'),
      assertClose(r.total_tax_savings_monthly, 326.54, 'Total savings/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 2: Single $75K straddle (12%/22%)',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 3: MFJ filer, $60K
  {
    const r = calculateEligibility(
      { annual_salary: 60000, filing_status: 'MFJ', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.taxable_income_before, 30000, 'Taxable before'),
      assertClose(r.taxable_income_after, 15924, 'Taxable after'),
      assertClose(r.fit_before_annual, 3123.00, 'FIT before'),
      assertClose(r.fit_after_annual, 1592.40, 'FIT after'),
      assertClose(r.fit_savings_annual, 1530.60, 'FIT savings'),
      assertClose(r.fit_savings_monthly, 127.55, 'FIT savings/mo'),
      assertClose(r.total_tax_savings_annual, 2607.41, 'Total savings'),
      assertClose(r.total_tax_savings_monthly, 217.28, 'Total savings/mo'),
      assertClose(r.net_benefit_monthly, 127.55, 'Net benefit/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 3: MFJ $60K (10%/12% straddle)',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 4: TRS school district teacher, $55K Single
  {
    const r = calculateEligibility(
      { annual_salary: 55000, filing_status: 'Single', pay_frequency: 'Semi-Monthly' },
      { is_school_district: true, is_trs_district: true }
    );
    const checks = [
      assertClose(r.taxable_income_before, 40000, 'Taxable before'),
      assertClose(r.taxable_income_after, 25924, 'Taxable after'),
      assertClose(r.fit_before_annual, 4561.50, 'FIT before'),
      assertClose(r.fit_after_annual, 2872.38, 'FIT after'),
      assertClose(r.fit_savings_annual, 1689.12, 'FIT savings'),
      assertClose(r.fit_savings_monthly, 140.76, 'FIT savings/mo'),
      assertClose(r.ss_savings_annual, 0, 'SS savings (TRS=0)'),
      assertClose(r.medicare_savings_annual, 204.10, 'Medicare savings'),
      assertClose(r.total_tax_savings_annual, 1893.22, 'Total savings'),
      assertClose(r.total_tax_savings_monthly, 157.77, 'Total savings/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 4: TRS School $55K Single',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 5: TRS school, $0 FIT — INELIGIBLE
  {
    const r = calculateEligibility(
      { annual_salary: 28000, filing_status: 'MFJ', pay_frequency: 'Semi-Monthly' },
      { is_school_district: true, is_trs_district: true }
    );
    const checks = [
      assertClose(r.taxable_income_before, 0, 'Taxable before'),
      assertClose(r.fit_before_annual, 0, 'FIT before'),
    ];
    const failed = checks.filter(c => !c.passed);
    const eligCheck = r.is_eligible === false;
    if (!eligCheck) failed.push({ message: 'Should be INELIGIBLE' });
    results.push({
      name: 'Test 5: TRS School $28K MFJ — INELIGIBLE',
      passed: failed.length === 0 && eligCheck,
      details: [...checks.map(c => c.message), `Eligible: ${r.is_eligible} (expected: false)`, `Reason: ${r.ineligible_reason}`],
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 6: Private sector $0 FIT — ELIGIBLE ($0 benefit)
  {
    const r = calculateEligibility(
      { annual_salary: 28000, filing_status: 'MFJ', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.taxable_income_before, 0, 'Taxable before'),
      assertClose(r.fit_before_annual, 0, 'FIT before'),
      assertClose(r.ss_savings_annual, 872.71, 'SS savings'),
      assertClose(r.medicare_savings_annual, 204.10, 'Medicare savings'),
      assertClose(r.total_tax_savings_monthly, 89.73, 'Total savings/mo'),
      assertClose(r.net_benefit_monthly, 0, 'Net benefit/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    const eligCheck = r.is_eligible === true;
    if (!eligCheck) failed.push({ message: 'Should be ELIGIBLE' });
    results.push({
      name: 'Test 6: Private $28K MFJ $0 FIT — ELIGIBLE ($0 benefit)',
      passed: failed.length === 0 && eligCheck,
      details: [...checks.map(c => c.message), `Eligible: ${r.is_eligible} (expected: true)`],
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 7: High earner $200K Single (above SS wage base)
  {
    const r = calculateEligibility(
      { annual_salary: 200000, filing_status: 'Single', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.taxable_income_before, 185000, 'Taxable before'),
      assertClose(r.taxable_income_after, 170924, 'Taxable after'),
      assertClose(r.fit_before_annual, 37247.00, 'FIT before'),
      assertClose(r.fit_after_annual, 33868.76, 'FIT after'),
      assertClose(r.fit_savings_annual, 3378.24, 'FIT savings'),
      assertClose(r.fit_savings_monthly, 281.52, 'FIT savings/mo'),
      assertClose(r.ss_savings_annual, 0, 'SS savings (above cap)'),
      assertClose(r.medicare_savings_annual, 204.10, 'Medicare savings'),
      assertClose(r.total_tax_savings_annual, 3582.34, 'Total savings'),
      assertClose(r.total_tax_savings_monthly, 298.53, 'Total savings/mo'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 7: Single $200K above SS wage base',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  // Test Case 8: Biweekly pay period conversion ($60K Single)
  {
    const r = calculateEligibility(
      { annual_salary: 60000, filing_status: 'Single', pay_frequency: 'Biweekly' },
      { is_school_district: false, is_trs_district: false }
    );
    const rSemiMonthly = calculateEligibility(
      { annual_salary: 60000, filing_status: 'Single', pay_frequency: 'Semi-Monthly' },
      { is_school_district: false, is_trs_district: false }
    );
    const checks = [
      assertClose(r.lw_premium_per_period, 541.38, 'Premium/pp biweekly'),
      assertClose(r.fee_per_period, 41.42, 'Fee/pp biweekly'),
      assertClose(r.net_benefit_monthly, rSemiMonthly.net_benefit_monthly, 'Monthly benefit matches semi-monthly'),
      assertClose(r.fit_savings_monthly, 140.76, 'FIT savings/mo same'),
    ];
    const failed = checks.filter(c => !c.passed);
    results.push({
      name: 'Test 8: Biweekly pay period conversion',
      passed: failed.length === 0,
      details: checks.map(c => c.message),
      eligible: r.is_eligible,
      straddle: r.in_straddle_zone,
    });
  }

  return results;
}

export default calculateEligibility;
