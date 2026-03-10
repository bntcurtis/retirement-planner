(function (global) {
  'use strict';

  function nearlyEqual(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  function testCases(Engine) {
    return [
      // ── Existing tests ───────────────────────────────────────────
      {
        name: 'Current net worth uses current retirement balances and mortgage debt',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].retirementBalanceToday = 200000;
          plan.assumptions.startingCashWorth = 100000;
          plan.properties = [
            {
              id: 1,
              name: 'Home',
              currentValue: 500000,
              appreciationRate: 0.02,
              monthlyRentalIncome: 0,
              rentalEndYear: null,
              mortgageBalanceToday: 350000,
              monthlyMortgage: 2000,
              mortgageEndYear: Engine.CURRENT_YEAR + 20,
              sellAtYear: null,
            },
          ];

          var result = Engine.currentNetWorth(plan);
          if (!nearlyEqual(result, 450000, 0.01)) {
            throw new Error('Expected current net worth to be $450,000, got ' + result);
          }
        },
      },
      {
        name: 'Taxes apply when income is pension and Social Security only',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 4000;
          plan.people[0].pensionStartAge = 65;
          plan.people[0].socialSecurityMonthly = 2500;
          plan.people[0].socialSecurityStartAge = 67;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.taxRate = 0.25;

          var row = Engine.buildProjection(plan, 'base')[0];
          if (!(row.taxes > 0)) {
            throw new Error('Expected taxes to be positive when pension and Social Security are present.');
          }
        },
      },
      {
        name: 'Legacy retirement balance is migrated into today\'s balance',
        run: function () {
          var legacy = Engine.createDefaultPlan();
          legacy.includePerson2 = false;
          delete legacy.people[0].retirementBalanceToday;
          legacy.people[0].retirementSavingsAt65 = 300000;

          var migrated = Engine.migratePlan(legacy).plan;
          if (!nearlyEqual(migrated.people[0].retirementBalanceToday, 300000, 0.01)) {
            throw new Error('Expected legacy retirement balance to map into retirementBalanceToday.');
          }
        },
      },
      {
        name: 'Target end age stops a person\'s Social Security cash flow',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = true;

          plan.people[0].name = 'Older';
          plan.people[0].currentAge = 60;
          plan.people[0].retirementAge = 60;
          plan.people[0].targetEndAge = 60;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].socialSecurityMonthly = 2000;
          plan.people[0].socialSecurityStartAge = 60;

          plan.people[1].name = 'Younger';
          plan.people[1].currentAge = 58;
          plan.people[1].retirementAge = 60;
          plan.people[1].targetEndAge = 62;
          plan.people[1].currentSalary = 0;
          plan.people[1].retirementBalanceToday = 0;
          plan.people[1].socialSecurityMonthly = 0;
          plan.people[1].pensionMonthly = 0;

          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;

          var projection = Engine.buildProjection(plan, 'base');
          if (!(projection[0].socialSecurityIncome > 0)) {
            throw new Error('Expected Social Security income in the first year.');
          }
          if (projection[1].socialSecurityIncome !== 0) {
            throw new Error('Expected Social Security income to stop after the person reaches target end age.');
          }
        },
      },
      {
        name: 'UBI starts at the configured age and is inactive before then',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 60;
          plan.people[0].retirementAge = 60;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 1500;
          plan.people[0].ubiStartAge = 62;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;

          var projection = Engine.buildProjection(plan, 'base');
          if (projection[0].ubiIncome !== 0) {
            throw new Error('Expected UBI to be inactive before the start age.');
          }
          if (!nearlyEqual(projection[2].ubiIncome, 18000, 0.01)) {
            throw new Error('Expected UBI to start at age 62.');
          }
        },
      },
      {
        name: 'Expense change applies permanently once the configured age is reached',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 70;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 100000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.expenseChangeAge = 52;
          plan.assumptions.expenseChangePercent = -0.2;

          var projection = Engine.buildProjection(plan, 'base');
          if (!nearlyEqual(projection[0].livingExpenses, 100000, 0.01)) {
            throw new Error('Expected expenses to stay unchanged before the trigger age.');
          }
          if (!nearlyEqual(projection[2].livingExpenses, 80000, 0.01)) {
            throw new Error('Expected a 20% expense decrease at the trigger age.');
          }
          if (!nearlyEqual(projection[3].livingExpenses, 80000, 0.01)) {
            throw new Error('Expected the expense change to remain in effect afterward.');
          }
        },
      },
      {
        name: 'Projection rows reconcile inflows, outflows, and net cash flow',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          var row = Engine.buildProjection(plan, 'base')[0];
          if (!nearlyEqual(row.grossInflows - row.totalOutflows, row.netCashFlow, 0.01)) {
            throw new Error('Row net cash flow does not equal inflows minus outflows.');
          }
        },
      },
      {
        name: 'Selling an underwater property creates negative sale proceeds',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.properties = [
            {
              id: 1,
              name: 'Underwater',
              currentValue: 100000,
              appreciationRate: 0,
              monthlyRentalIncome: 0,
              rentalEndYear: null,
              mortgageBalanceToday: 150000,
              monthlyMortgage: 0,
              mortgageEndYear: null,
              sellAtYear: Engine.CURRENT_YEAR,
            },
          ];

          var row = Engine.buildProjection(plan, 'base')[0];
          if (!(row.propertySaleProceeds < 0)) {
            throw new Error('Expected negative sale proceeds for an underwater property sale.');
          }
        },
      },
      {
        name: 'Social Security reduction stress test removes benefits when set to 100%',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 67;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.stressTests.socialSecurityReductionEnabled = true;
          plan.stressTests.socialSecurityReductionPercent = 1;
          plan.stressTests.socialSecurityReductionYear = Engine.CURRENT_YEAR;

          var row = Engine.buildProjection(plan, 'base')[0];
          if (row.socialSecurityIncome !== 0) {
            throw new Error('Expected Social Security stress test to reduce benefits to zero.');
          }
        },
      },

      // ── New tests ────────────────────────────────────────────────

      {
        name: 'Market crash stress test reduces liquid, retirement, and property values',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 100000;
          plan.assumptions.startingCashWorth = 100000;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.properties = [{
            id: 1, name: 'Home', currentValue: 200000, appreciationRate: 0,
            monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, monthlyMortgage: 0, mortgageEndYear: null, sellAtYear: null,
          }];
          plan.stressTests.marketCrashEnabled = true;
          plan.stressTests.marketCrashYear = Engine.CURRENT_YEAR;
          plan.stressTests.marketCrashLiquidDropPercent = 0.3;
          plan.stressTests.marketCrashRetirementDropPercent = 0.4;
          plan.stressTests.marketCrashPropertyDropPercent = 0.2;

          var row = Engine.buildProjection(plan, 'base')[0];
          if (!nearlyEqual(row.stressLosses.liquid, 30000, 1)) {
            throw new Error('Expected liquid loss of $30,000, got ' + row.stressLosses.liquid);
          }
          if (!nearlyEqual(row.stressLosses.retirement, 40000, 1)) {
            throw new Error('Expected retirement loss of $40,000, got ' + row.stressLosses.retirement);
          }
          if (!nearlyEqual(row.stressLosses.property, 40000, 1)) {
            throw new Error('Expected property loss of $40,000, got ' + row.stressLosses.property);
          }
        },
      },
      {
        name: 'Inflation spike stress test overrides base inflation for the configured period',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 100000;
          plan.assumptions.inflationRate = 0.03;
          plan.stressTests.inflationSpikeEnabled = true;
          plan.stressTests.inflationSpikeStartYear = Engine.CURRENT_YEAR + 1;
          plan.stressTests.inflationSpikeDurationYears = 2;
          plan.stressTests.inflationSpikeRate = 0.08;

          var projection = Engine.buildProjection(plan, 'base');
          // Year 0: base inflation (3%), expenses at base
          if (!nearlyEqual(projection[0].inflationRateUsed, 0.03, 0.001)) {
            throw new Error('Expected base inflation in year 0, got ' + projection[0].inflationRateUsed);
          }
          // Year 1: spike (8%)
          if (!nearlyEqual(projection[1].inflationRateUsed, 0.08, 0.001)) {
            throw new Error('Expected spike inflation in year 1, got ' + projection[1].inflationRateUsed);
          }
          // Year 2: spike (8%)
          if (!nearlyEqual(projection[2].inflationRateUsed, 0.08, 0.001)) {
            throw new Error('Expected spike inflation in year 2, got ' + projection[2].inflationRateUsed);
          }
          // Year 3: back to base (3%)
          if (!nearlyEqual(projection[3].inflationRateUsed, 0.03, 0.001)) {
            throw new Error('Expected base inflation in year 3, got ' + projection[3].inflationRateUsed);
          }
        },
      },
      {
        name: 'Part-time income reduces salary by the configured ratio',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 55;
          plan.people[0].currentSalary = 100000;
          plan.people[0].salaryGrowthRate = 0;
          plan.people[0].partTimeAge = 52;
          plan.people[0].partTimeRatio = 0.6;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;

          var projection = Engine.buildProjection(plan, 'base');
          // Year 0 (age 50): full salary
          if (!nearlyEqual(projection[0].salaryIncome, 100000, 1)) {
            throw new Error('Expected full salary at age 50, got ' + projection[0].salaryIncome);
          }
          // Year 2 (age 52): part-time
          if (!nearlyEqual(projection[2].salaryIncome, 60000, 1)) {
            throw new Error('Expected part-time salary (60%) at age 52, got ' + projection[2].salaryIncome);
          }
          // Year 5 (age 55): retired, no salary
          if (projection[5].salaryIncome !== 0) {
            throw new Error('Expected zero salary at retirement age 55.');
          }
        },
      },
      {
        name: 'Charitable giving deducts from taxable income',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 100000;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.25;
          plan.assumptions.charitableEnabled = true;
          plan.assumptions.charitableType = 'amount';
          plan.assumptions.charitableAmount = 10000;

          var row = Engine.buildProjection(plan, 'base')[0];
          // Taxable income is salary ($100k), deduction is charitable ($10k)
          // Taxes should be 0.25 * (100000 - 10000) = $22,500
          if (!nearlyEqual(row.ordinaryTaxes, 22500, 1)) {
            throw new Error('Expected ordinary taxes of $22,500 with charitable deduction, got ' + row.ordinaryTaxes);
          }
          if (!nearlyEqual(row.charitableDonation, 10000, 1)) {
            throw new Error('Expected charitable donation of $10,000, got ' + row.charitableDonation);
          }
        },
      },
      {
        name: 'Retirement contribution type "amount" uses fixed annual amount',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 100000;
          plan.people[0].retirementContributionType = 'amount';
          plan.people[0].retirementContributionAmount = 20000;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;

          var row = Engine.buildProjection(plan, 'base')[0];
          if (!nearlyEqual(row.retirementContributionTotal, 20000, 1)) {
            throw new Error('Expected fixed contribution of $20,000, got ' + row.retirementContributionTotal);
          }
        },
      },
      {
        name: 'Two-person plan distributes retirement withdrawals proportionally',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = true;

          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 300000;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;

          plan.people[1].currentAge = 68;
          plan.people[1].retirementAge = 65;
          plan.people[1].targetEndAge = 80;
          plan.people[1].currentSalary = 0;
          plan.people[1].retirementBalanceToday = 100000;
          plan.people[1].retirementContributionAmount = 0;
          plan.people[1].pensionMonthly = 0;
          plan.people[1].socialSecurityMonthly = 0;
          plan.people[1].ubiMonthly = 0;

          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 50000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Both people are retired, so both accounts are accessible.
          // Withdrawals should happen to cover expenses (no other income).
          if (row.retirementWithdrawal <= 0) {
            throw new Error('Expected retirement withdrawals to cover expenses.');
          }
          // Person 0 has 3x the balance of person 1, so should withdraw ~3x as much.
          var p0wd = row.personStates[0].retirementWithdrawal;
          var p1wd = row.personStates[1].retirementWithdrawal;
          if (p0wd <= 0 || p1wd <= 0) {
            throw new Error('Expected both people to have withdrawals.');
          }
          var ratio = p0wd / p1wd;
          if (!nearlyEqual(ratio, 3, 0.5)) {
            throw new Error('Expected roughly 3:1 withdrawal ratio, got ' + ratio.toFixed(2));
          }
        },
      },
      {
        name: 'Migration of completely empty input produces a valid default plan',
        run: function () {
          var migrated = Engine.migratePlan({});
          var plan = migrated.plan;
          if (plan.version !== Engine.PLAN_VERSION) {
            throw new Error('Expected migrated plan version to match PLAN_VERSION.');
          }
          if (plan.people.length !== 2) {
            throw new Error('Expected 2 people in migrated plan.');
          }
          if (!plan.assumptions || typeof plan.assumptions.taxRate !== 'number') {
            throw new Error('Expected valid assumptions in migrated plan.');
          }
          // Should be able to build a projection without errors.
          var projection = Engine.buildProjection(plan, 'base');
          if (projection.length === 0) {
            throw new Error('Expected non-empty projection from migrated empty input.');
          }
        },
      },
      {
        name: 'RMDs are enforced at age 73 even when no cash shortfall exists',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 73;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 1000000;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 5000000;
          plan.assumptions.startingAnnualExpenses = 50000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.investmentReturnBase = 0;
          plan.assumptions.investmentReturnOptimistic = 0;
          plan.assumptions.investmentReturnPessimistic = 0;
          plan.assumptions.taxRate = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // At age 73, distribution period is 26.5, so RMD ≈ 1000000 / 26.5 ≈ 37736
          var expectedRmd = 1000000 / 26.5;
          if (!nearlyEqual(row.rmdWithdrawal, expectedRmd, 10)) {
            throw new Error('Expected RMD of ~$' + Math.round(expectedRmd) + ', got ' + row.rmdWithdrawal);
          }
          // Even though there is plenty of liquid cash, RMD should still happen.
          if (row.retirementWithdrawal < row.rmdWithdrawal) {
            throw new Error('Expected total withdrawal to be at least the RMD amount.');
          }
        },
      },
      {
        name: 'Pension and UBI COLA is capped at 3% even when inflation is higher',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 67;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 1000;
          plan.people[0].pensionStartAge = 65;
          plan.people[0].pensionHasCOLA = true;
          plan.people[0].socialSecurityMonthly = 2000;
          plan.people[0].socialSecurityStartAge = 67;
          plan.people[0].ubiMonthly = 500;
          plan.people[0].ubiStartAge = 67;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0.06;
          plan.assumptions.taxRate = 0;
          plan.properties = [];

          var projection = Engine.buildProjection(plan, 'base');

          // Year 0: no COLA applied yet (multiplier starts at 1)
          // Year 1: pension COLA capped at 3%, SS uses full 6%
          var year1 = projection[1];
          var expectedPension = 1000 * 12 * (1 + 0.03); // capped
          var expectedUbi = 500 * 12 * (1 + 0.03); // capped
          var expectedSS = 2000 * 12 * (1 + 0.06); // full inflation

          if (!nearlyEqual(year1.pensionIncome, expectedPension, 1)) {
            throw new Error('Expected pension COLA capped at 3%, got ' + year1.pensionIncome + ' vs expected ' + expectedPension);
          }
          if (!nearlyEqual(year1.ubiIncome, expectedUbi, 1)) {
            throw new Error('Expected UBI COLA capped at 3%, got ' + year1.ubiIncome + ' vs expected ' + expectedUbi);
          }
          if (!nearlyEqual(year1.socialSecurityIncome, expectedSS, 1)) {
            throw new Error('Expected SS at full 6% inflation, got ' + year1.socialSecurityIncome + ' vs expected ' + expectedSS);
          }
        },
      },
      {
        name: 'Retirement withdrawals are tax-free',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 500000;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 50000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.30;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Only income is retirement withdrawal. Taxable ordinary income should be 0
          // (since retirement is tax-free), so taxes should only apply to ordinary income.
          if (row.ordinaryTaxes !== 0) {
            throw new Error('Expected zero ordinary taxes when only income is retirement withdrawal, got ' + row.ordinaryTaxes);
          }
          // Retirement withdrawal should cover expenses without gross-up.
          if (row.retirementWithdrawal <= 0) {
            throw new Error('Expected retirement withdrawal to cover expenses.');
          }
        },
      },
      {
        name: 'Property sale gains are taxed at the capital gains rate',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.30;
          plan.assumptions.capitalGainsTaxRate = 0.15;
          plan.properties = [{
            id: 1, name: 'House', currentValue: 500000, appreciationRate: 0,
            monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, monthlyMortgage: 0, mortgageEndYear: null,
            sellAtYear: Engine.CURRENT_YEAR,
          }];

          var row = Engine.buildProjection(plan, 'base')[0];
          // No appreciation, so gain = 0. Capital gains taxes should be 0.
          if (row.capitalGainsTaxes !== 0) {
            throw new Error('Expected zero capital gains taxes when property has no gain.');
          }

          // Now test with appreciation creating a gain.
          plan.properties[0].appreciationRate = 0.1;
          plan.properties[0].sellAtYear = Engine.CURRENT_YEAR;

          row = Engine.buildProjection(plan, 'base')[0];
          // After 1 year of 10% appreciation: value = 550000, gain = 50000
          // Capital gains tax = 50000 * 0.15 = 7500
          var expectedGain = 500000 * 0.1; // 50000
          var expectedTax = expectedGain * 0.15; // 7500
          if (!nearlyEqual(row.capitalGainsTaxes, expectedTax, 10)) {
            throw new Error('Expected capital gains tax of ~$' + expectedTax + ', got ' + row.capitalGainsTaxes);
          }
          // Ordinary taxes should be zero (no ordinary income).
          if (row.ordinaryTaxes !== 0) {
            throw new Error('Expected zero ordinary taxes, got ' + row.ordinaryTaxes);
          }
        },
      },
      {
        name: 'Appreciation rate floating-point artifacts are cleaned during migration',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.properties = [{
            id: 1, name: 'Test', currentValue: 100000,
            appreciationRate: 0.022000000000000002,
            monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, monthlyMortgage: 0,
            mortgageEndYear: null, sellAtYear: null,
          }];

          var migrated = Engine.migratePlan(plan).plan;
          if (migrated.properties[0].appreciationRate !== 0.022) {
            throw new Error('Expected appreciation rate to be cleaned to 0.022, got ' + migrated.properties[0].appreciationRate);
          }
        },
      },
    ];
  }

  function runEngineTests() {
    var Engine = global.RetirementEngine;
    if (!Engine) {
      throw new Error('RetirementEngine is not loaded.');
    }

    var cases = testCases(Engine);
    var results = cases.map(function (testCase) {
      try {
        testCase.run();
        return { name: testCase.name, passed: true };
      } catch (error) {
        return { name: testCase.name, passed: false, error: error.message };
      }
    });

    return {
      total: results.length,
      passed: results.filter(function (result) { return result.passed; }).length,
      failed: results.filter(function (result) { return !result.passed; }).length,
      results: results,
    };
  }

  function renderResults(report) {
    if (typeof document === 'undefined') {
      return;
    }

    var root = document.getElementById('test-results');
    if (!root) {
      return;
    }

    root.innerHTML =
      '<h1>Engine Tests</h1>' +
      '<p>' +
      report.passed +
      ' / ' +
      report.total +
      ' passed</p>' +
      '<ul>' +
      report.results
        .map(function (result) {
          return (
            '<li class="' +
            (result.passed ? 'pass' : 'fail') +
            '"><strong>' +
            result.name +
            '</strong>' +
            (result.passed ? ' passed.' : ' failed: ' + result.error) +
            '</li>'
          );
        })
        .join('') +
      '</ul>';
  }

  global.runEngineTests = runEngineTests;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      renderResults(runEngineTests());
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
