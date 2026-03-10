(function (global) {
  'use strict';

  function nearlyEqual(actual, expected, tolerance) {
    return Math.abs(actual - expected) <= tolerance;
  }

  function testCases(Engine) {
    return [
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
