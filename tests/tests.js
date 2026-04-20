(function (global) {
  'use strict';

  function nearlyEqual(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  function testCases(Engine) {
    return [
      // ── Core math ─────────────────────────────────────────────────

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
              costBasis: 500000,
              sellingCostsPercent: 0.06,
              isPrimaryResidence: true,
              appreciationRate: 0.02,
              monthlyRentalIncome: 0,
              rentalEndYear: null,
              mortgageBalanceToday: 350000,
              mortgageInterestRate: 0.05,
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
        name: 'Pension and Social Security generate ordinary taxes (SS at 85% taxable)',
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
          plan.assumptions.inflationRate = 0;
          plan.assumptions.liquidTaxableYieldPercent = 0;

          var row = Engine.buildProjection(plan, 'base')[0];
          var expectedPension = 4000 * 12;
          var expectedSS = 2500 * 12;
          var expectedTaxable = expectedPension + expectedSS * 0.85;
          var expectedTax = expectedTaxable * 0.25;
          if (!nearlyEqual(row.ordinaryTaxes, expectedTax, 1)) {
            throw new Error('Expected ordinary taxes of ~$' + Math.round(expectedTax) + ', got ' + row.ordinaryTaxes);
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

      // ── Migration ─────────────────────────────────────────────────

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
          var projection = Engine.buildProjection(plan, 'base');
          if (projection.length === 0) {
            throw new Error('Expected non-empty projection from migrated empty input.');
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
      {
        name: 'Migration defaults missing retirement account type to tax-deferred',
        run: function () {
          var legacy = Engine.createDefaultPlan();
          delete legacy.people[0].retirementAccountType;
          delete legacy.people[1].retirementAccountType;
          var migrated = Engine.migratePlan(legacy).plan;
          if (migrated.people[0].retirementAccountType !== 'taxDeferred') {
            throw new Error('Expected migration default to taxDeferred, got ' + migrated.people[0].retirementAccountType);
          }
        },
      },
      {
        name: 'Migration defaults missing property cost basis to current value',
        run: function () {
          var plan = Engine.createDefaultPlan();
          delete plan.properties[0].costBasis;
          var migrated = Engine.migratePlan(plan).plan;
          if (migrated.properties[0].costBasis !== migrated.properties[0].currentValue) {
            throw new Error('Expected cost basis to default to current value.');
          }
        },
      },

      // ── People / cash flows ───────────────────────────────────────

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
          if (!nearlyEqual(projection[0].salaryIncome, 100000, 1)) {
            throw new Error('Expected full salary at age 50, got ' + projection[0].salaryIncome);
          }
          if (!nearlyEqual(projection[2].salaryIncome, 60000, 1)) {
            throw new Error('Expected part-time salary (60%) at age 52, got ' + projection[2].salaryIncome);
          }
          if (projection[5].salaryIncome !== 0) {
            throw new Error('Expected zero salary at retirement age 55.');
          }
        },
      },

      // ── Retirement accounts (Roth vs tax-deferred) ────────────────

      {
        name: 'Roth retirement withdrawals are tax-free',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 500000;
          plan.people[0].retirementAccountType = 'roth';
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 50000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.30;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          if (row.ordinaryTaxes !== 0) {
            throw new Error('Expected zero ordinary taxes on Roth-only withdrawals, got ' + row.ordinaryTaxes);
          }
          if (row.retirementWithdrawal <= 0) {
            throw new Error('Expected retirement withdrawal to cover expenses.');
          }
        },
      },
      {
        name: 'Tax-deferred retirement withdrawals are taxed as ordinary income',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 500000;
          plan.people[0].retirementAccountType = 'taxDeferred';
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 50000;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.30;
          plan.assumptions.investmentReturnOptimistic = 0;
          plan.assumptions.investmentReturnBase = 0;
          plan.assumptions.investmentReturnPessimistic = 0;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          if (row.ordinaryTaxes <= 0) {
            throw new Error('Expected positive ordinary taxes on tax-deferred withdrawals, got ' + row.ordinaryTaxes);
          }
          // Withdrawal needs to cover expenses AND tax on the withdrawal itself.
          // With 30% tax rate, to net $50k, must withdraw ~$50k / (1 - 0.3) ≈ $71,429.
          // Tax on that ≈ $21,429.
          if (!nearlyEqual(row.retirementWithdrawal, 50000 / 0.7, 50)) {
            throw new Error('Expected withdrawal grossed up for tax, got ' + row.retirementWithdrawal);
          }
          if (!nearlyEqual(row.ordinaryTaxes, (50000 / 0.7) * 0.3, 50)) {
            throw new Error('Expected taxes ~$' + Math.round((50000 / 0.7) * 0.3) + ', got ' + row.ordinaryTaxes);
          }
        },
      },
      {
        name: 'Tax-deferred contributions are deducted from taxable income',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 100000;
          plan.people[0].retirementAccountType = 'taxDeferred';
          plan.people[0].retirementContributionType = 'amount';
          plan.people[0].retirementContributionAmount = 20000;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.25;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Taxable income = $100k salary - $20k contribution deduction = $80k
          // Taxes = $80k * 0.25 = $20,000
          if (!nearlyEqual(row.ordinaryTaxes, 20000, 1)) {
            throw new Error('Expected taxes of $20,000 with $20k pre-tax contribution, got ' + row.ordinaryTaxes);
          }
        },
      },
      {
        name: 'Roth contributions are NOT deducted from taxable income',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 100000;
          plan.people[0].retirementAccountType = 'roth';
          plan.people[0].retirementContributionType = 'amount';
          plan.people[0].retirementContributionAmount = 20000;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.25;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Taxable income = $100k salary (no deduction for Roth)
          // Taxes = $100k * 0.25 = $25,000
          if (!nearlyEqual(row.ordinaryTaxes, 25000, 1)) {
            throw new Error('Expected taxes of $25,000 with Roth contribution (no deduction), got ' + row.ordinaryTaxes);
          }
        },
      },
      {
        name: 'RMDs are enforced at age 73 for tax-deferred accounts',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 73;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 1000000;
          plan.people[0].retirementAccountType = 'taxDeferred';
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
          var expectedRmd = 1000000 / 26.5;
          if (!nearlyEqual(row.rmdWithdrawal, expectedRmd, 10)) {
            throw new Error('Expected RMD of ~$' + Math.round(expectedRmd) + ', got ' + row.rmdWithdrawal);
          }
          if (row.retirementWithdrawal < row.rmdWithdrawal) {
            throw new Error('Expected total withdrawal to be at least the RMD amount.');
          }
        },
      },
      {
        name: 'Roth accounts have NO RMDs even at age 73+',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 75;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 1000000;
          plan.people[0].retirementAccountType = 'roth';
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 5000000;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.investmentReturnBase = 0;
          plan.assumptions.investmentReturnOptimistic = 0;
          plan.assumptions.investmentReturnPessimistic = 0;
          plan.assumptions.taxRate = 0.3;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          if (row.rmdWithdrawal !== 0) {
            throw new Error('Expected zero RMD for Roth account, got ' + row.rmdWithdrawal);
          }
          if (row.retirementWithdrawal !== 0) {
            throw new Error('Expected zero withdrawal (no shortfall, no RMD on Roth), got ' + row.retirementWithdrawal);
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
          plan.people[0].retirementAccountType = 'roth';
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;

          plan.people[1].currentAge = 68;
          plan.people[1].retirementAge = 65;
          plan.people[1].targetEndAge = 80;
          plan.people[1].currentSalary = 0;
          plan.people[1].retirementBalanceToday = 100000;
          plan.people[1].retirementAccountType = 'roth';
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
          if (row.retirementWithdrawal <= 0) {
            throw new Error('Expected retirement withdrawals to cover expenses.');
          }
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

      // ── Social Security / COLA ────────────────────────────────────

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
          var year1 = projection[1];
          var expectedPension = 1000 * 12 * (1 + 0.03);
          var expectedUbi = 500 * 12 * (1 + 0.03);
          var expectedSS = 2000 * 12 * (1 + 0.06);

          if (!nearlyEqual(year1.pensionIncome, expectedPension, 1)) {
            throw new Error('Expected pension COLA capped at 3%, got ' + year1.pensionIncome);
          }
          if (!nearlyEqual(year1.ubiIncome, expectedUbi, 1)) {
            throw new Error('Expected UBI COLA capped at 3%, got ' + year1.ubiIncome);
          }
          if (!nearlyEqual(year1.socialSecurityIncome, expectedSS, 1)) {
            throw new Error('Expected SS at full 6% inflation, got ' + year1.socialSecurityIncome);
          }
        },
      },
      {
        name: 'Social Security taxable percent is applied to taxable income',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 70;
          plan.people[0].retirementAge = 65;
          plan.people[0].targetEndAge = 80;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 3000;
          plan.people[0].socialSecurityStartAge = 67;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0.2;
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.assumptions.socialSecurityTaxablePercent = 0.5;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // SS = $36k, 50% taxable = $18k, tax at 20% = $3,600
          if (!nearlyEqual(row.ordinaryTaxes, 3600, 1)) {
            throw new Error('Expected taxes of $3,600 with 50% SS taxable, got ' + row.ordinaryTaxes);
          }
          // Zero percent should produce zero taxes.
          plan.assumptions.socialSecurityTaxablePercent = 0;
          row = Engine.buildProjection(plan, 'base')[0];
          if (row.ordinaryTaxes !== 0) {
            throw new Error('Expected zero taxes when SS is 0% taxable, got ' + row.ordinaryTaxes);
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

      // ── Stress tests ──────────────────────────────────────────────

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
            id: 1, name: 'Home', currentValue: 200000,
            costBasis: 200000, sellingCostsPercent: 0.06, isPrimaryResidence: true,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, mortgageInterestRate: 0.05,
            monthlyMortgage: 0, mortgageEndYear: null, sellAtYear: null,
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
          if (!nearlyEqual(projection[0].inflationRateUsed, 0.03, 0.001)) {
            throw new Error('Expected base inflation in year 0, got ' + projection[0].inflationRateUsed);
          }
          if (!nearlyEqual(projection[1].inflationRateUsed, 0.08, 0.001)) {
            throw new Error('Expected spike inflation in year 1, got ' + projection[1].inflationRateUsed);
          }
          if (!nearlyEqual(projection[2].inflationRateUsed, 0.08, 0.001)) {
            throw new Error('Expected spike inflation in year 2, got ' + projection[2].inflationRateUsed);
          }
          if (!nearlyEqual(projection[3].inflationRateUsed, 0.03, 0.001)) {
            throw new Error('Expected base inflation in year 3, got ' + projection[3].inflationRateUsed);
          }
        },
      },

      // ── Charitable giving ─────────────────────────────────────────

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
          plan.assumptions.liquidTaxableYieldPercent = 0;
          plan.assumptions.charitableEnabled = true;
          plan.assumptions.charitableType = 'amount';
          plan.assumptions.charitableAmount = 10000;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // $100k salary - $10k charitable = $90k taxable, tax = $22,500
          if (!nearlyEqual(row.ordinaryTaxes, 22500, 1)) {
            throw new Error('Expected taxes of $22,500 with charitable deduction, got ' + row.ordinaryTaxes);
          }
          if (!nearlyEqual(row.charitableDonation, 10000, 1)) {
            throw new Error('Expected charitable donation of $10,000, got ' + row.charitableDonation);
          }
        },
      },
      {
        name: 'Charitable fixed amount inflates with inflation',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentAge = 50;
          plan.people[0].retirementAge = 65;
          plan.people[0].currentSalary = 100000;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0.03;
          plan.assumptions.charitableEnabled = true;
          plan.assumptions.charitableType = 'amount';
          plan.assumptions.charitableAmount = 5000;
          plan.properties = [];

          var projection = Engine.buildProjection(plan, 'base');
          if (!nearlyEqual(projection[0].charitableDonation, 5000, 1)) {
            throw new Error('Expected $5,000 charitable in year 0, got ' + projection[0].charitableDonation);
          }
          // Year 2: $5000 * 1.03^2 ≈ $5304.50
          var expected = 5000 * Math.pow(1.03, 2);
          if (!nearlyEqual(projection[2].charitableDonation, expected, 1)) {
            throw new Error('Expected charitable to inflate to ~$' + Math.round(expected) + ', got ' + projection[2].charitableDonation);
          }
        },
      },

      // ── Properties ────────────────────────────────────────────────

      {
        name: 'Selling an underwater property creates negative sale proceeds',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.assumptions.startingCashWorth = 0;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.properties = [{
            id: 1, name: 'Underwater', currentValue: 100000,
            costBasis: 100000, sellingCostsPercent: 0.06, isPrimaryResidence: true,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 150000, mortgageInterestRate: 0.05,
            monthlyMortgage: 0, mortgageEndYear: null, sellAtYear: Engine.CURRENT_YEAR,
          }];

          var row = Engine.buildProjection(plan, 'base')[0];
          if (!(row.propertySaleProceeds < 0)) {
            throw new Error('Expected negative sale proceeds for underwater sale.');
          }
        },
      },
      {
        name: 'Investment property sale taxes gain against cost basis (not current value)',
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
            id: 1, name: 'Investment', currentValue: 500000,
            costBasis: 200000, sellingCostsPercent: 0, isPrimaryResidence: false,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, mortgageInterestRate: 0.05,
            monthlyMortgage: 0, mortgageEndYear: null,
            sellAtYear: Engine.CURRENT_YEAR,
          }];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Gain = 500000 - 200000 = 300000, tax = 45000
          if (!nearlyEqual(row.capitalGainsTaxes, 45000, 10)) {
            throw new Error('Expected $45,000 cap gains tax on $300k embedded gain, got ' + row.capitalGainsTaxes);
          }
        },
      },
      {
        name: 'Primary residence exclusion: $250k single, $500k joint',
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
          plan.assumptions.capitalGainsTaxRate = 0.15;
          plan.properties = [{
            id: 1, name: 'Home', currentValue: 600000,
            costBasis: 200000, sellingCostsPercent: 0, isPrimaryResidence: true,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, mortgageInterestRate: 0.05,
            monthlyMortgage: 0, mortgageEndYear: null,
            sellAtYear: Engine.CURRENT_YEAR,
          }];

          // Single: gain $400k, exclusion $250k, taxable $150k, tax = $22,500
          var rowSingle = Engine.buildProjection(plan, 'base')[0];
          if (!nearlyEqual(rowSingle.capitalGainsTaxes, 22500, 10)) {
            throw new Error('Expected $22,500 cap gains tax (single exclusion), got ' + rowSingle.capitalGainsTaxes);
          }

          // Joint: gain $400k, exclusion $500k, taxable $0, tax = $0
          plan.includePerson2 = true;
          plan.people[1].currentAge = 48;
          plan.people[1].currentSalary = 0;
          plan.people[1].retirementBalanceToday = 0;
          plan.people[1].retirementContributionAmount = 0;
          plan.people[1].pensionMonthly = 0;
          plan.people[1].socialSecurityMonthly = 0;
          plan.people[1].ubiMonthly = 0;

          var rowJoint = Engine.buildProjection(plan, 'base')[0];
          if (rowJoint.capitalGainsTaxes !== 0) {
            throw new Error('Expected $0 cap gains with joint $500k exclusion, got ' + rowJoint.capitalGainsTaxes);
          }
        },
      },
      {
        name: 'Selling costs reduce net sale value before gain is computed',
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
          plan.assumptions.capitalGainsTaxRate = 0.15;
          plan.properties = [{
            id: 1, name: 'Investment', currentValue: 500000,
            costBasis: 300000, sellingCostsPercent: 0.06, isPrimaryResidence: false,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 0, mortgageInterestRate: 0.05,
            monthlyMortgage: 0, mortgageEndYear: null,
            sellAtYear: Engine.CURRENT_YEAR,
          }];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Sale value $500k, selling costs 6% = $30k, net = $470k, gain = $170k, tax = $25.5k
          if (!nearlyEqual(row.capitalGainsTaxes, 25500, 10)) {
            throw new Error('Expected $25,500 tax after selling costs, got ' + row.capitalGainsTaxes);
          }
        },
      },

      // ── Mortgage amortization ─────────────────────────────────────

      {
        name: 'Mortgage amortization respects actual payment amount',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 100000;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0;
          plan.properties = [{
            id: 1, name: 'Home', currentValue: 500000,
            costBasis: 500000, sellingCostsPercent: 0, isPrimaryResidence: true,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 100000,
            mortgageInterestRate: 0.05,
            monthlyMortgage: 100,
            mortgageEndYear: Engine.CURRENT_YEAR + 10,
            sellAtYear: null,
          }];

          // $100/mo = $1200/yr payment, interest on $100k @ 5% = $5000
          // Payment < interest → balance should NOT drop significantly.
          // (Real amortization: principal paid = max(0, 1200 - 5000) = 0; engine caps at 0.)
          // The old straight-line model would have dropped balance by ~$10k.
          var row = Engine.buildProjection(plan, 'base')[0];
          var endMortgage = row.propertySnapshots[0].remainingMortgage;
          if (endMortgage < 95000) {
            throw new Error('Expected mortgage balance to stay near $100k when payment < interest, got ' + endMortgage);
          }
        },
      },
      {
        name: 'Mortgage amortization with adequate payment reduces balance correctly',
        run: function () {
          var plan = Engine.createDefaultPlan();
          plan.includePerson2 = false;
          plan.people[0].currentSalary = 0;
          plan.people[0].retirementBalanceToday = 0;
          plan.people[0].retirementContributionAmount = 0;
          plan.people[0].pensionMonthly = 0;
          plan.people[0].socialSecurityMonthly = 0;
          plan.people[0].ubiMonthly = 0;
          plan.assumptions.startingCashWorth = 100000;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.taxRate = 0;
          plan.properties = [{
            id: 1, name: 'Home', currentValue: 500000,
            costBasis: 500000, sellingCostsPercent: 0, isPrimaryResidence: true,
            appreciationRate: 0, monthlyRentalIncome: 0, rentalEndYear: null,
            mortgageBalanceToday: 100000,
            mortgageInterestRate: 0.05,
            monthlyMortgage: 1000,
            mortgageEndYear: Engine.CURRENT_YEAR + 20,
            sellAtYear: null,
          }];

          // $1000/mo = $12000/yr, interest Y1 = $5000, principal = $7000
          // End-of-year balance ≈ $93,000
          var row = Engine.buildProjection(plan, 'base')[0];
          var endMortgage = row.propertySnapshots[0].remainingMortgage;
          if (!nearlyEqual(endMortgage, 93000, 50)) {
            throw new Error('Expected mortgage balance near $93,000 after 1 year, got ' + endMortgage);
          }
          if (!nearlyEqual(row.mortgageInterestPaid, 5000, 1)) {
            throw new Error('Expected $5000 interest paid in year 1, got ' + row.mortgageInterestPaid);
          }
        },
      },

      // ── Liquid investment tax ─────────────────────────────────────

      {
        name: 'Liquid investment returns are taxed at the liquidTaxableYieldPercent',
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
          plan.assumptions.startingCashWorth = 1000000;
          plan.assumptions.startingAnnualExpenses = 0;
          plan.assumptions.inflationRate = 0;
          plan.assumptions.investmentReturnBase = 0.05;
          plan.assumptions.taxRate = 0.3;
          plan.assumptions.liquidTaxableYieldPercent = 0.4;
          plan.properties = [];

          var row = Engine.buildProjection(plan, 'base')[0];
          // Return = $1M * 0.05 = $50k. Taxable = 40% = $20k. Tax = 30% * $20k = $6k.
          if (!nearlyEqual(row.ordinaryTaxes, 6000, 10)) {
            throw new Error('Expected $6,000 tax on 40% of $50k return, got ' + row.ordinaryTaxes);
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
