(function (global) {
  'use strict';

  var CURRENT_YEAR = new Date().getFullYear();
  var PLAN_VERSION = 2;
  var SCENARIO_ORDER = ['optimistic', 'base', 'pessimistic'];
  var SCENARIO_LABELS = {
    optimistic: 'Optimistic',
    base: 'Base',
    pessimistic: 'Pessimistic',
  };

  var COLA_CAP = 0.03;
  var RMD_START_AGE = 73;

  // IRS Uniform Lifetime Table distribution periods (ages 73-120).
  var RMD_PERIODS = [
    26.5, 25.5, 24.6, 23.7, 22.9, 22.0, 21.1, 20.2,
    19.4, 18.5, 17.7, 16.8, 16.0, 15.2, 14.4, 13.7,
    12.9, 12.2, 11.5, 10.8, 10.1, 9.5, 8.9, 8.4,
    7.8, 7.3, 6.8, 6.4, 6.0, 5.6, 5.2, 4.9,
    4.6, 4.3, 4.1, 3.9, 3.7, 3.5, 3.4, 3.3,
    3.1, 3.0, 2.9, 2.8, 2.7, 2.5, 2.3, 2.0,
  ];

  function rmdDistributionPeriod(age) {
    if (age < RMD_START_AGE) {
      return 0;
    }
    var index = Math.min(age - RMD_START_AGE, RMD_PERIODS.length - 1);
    return RMD_PERIODS[index];
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) {
      return '$0';
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatShortCurrency(value) {
    if (!Number.isFinite(value)) {
      return '$0';
    }

    var absolute = Math.abs(value);
    if (absolute >= 1000000) {
      return (value < 0 ? '-' : '') + '$' + (absolute / 1000000).toFixed(1) + 'M';
    }
    if (absolute >= 1000) {
      return (value < 0 ? '-' : '') + '$' + Math.round(absolute / 1000) + 'K';
    }
    return formatCurrency(value);
  }

  function formatPercent(value) {
    return (toNumber(value, 0) * 100).toFixed(1) + '%';
  }

  function createDefaultStressTests() {
    return {
      socialSecurityReductionEnabled: false,
      socialSecurityReductionPercent: 1,
      socialSecurityReductionYear: CURRENT_YEAR,
      marketCrashEnabled: false,
      marketCrashYear: CURRENT_YEAR + 1,
      marketCrashLiquidDropPercent: 0.35,
      marketCrashRetirementDropPercent: 0.35,
      marketCrashPropertyDropPercent: 0.15,
      inflationSpikeEnabled: false,
      inflationSpikeStartYear: CURRENT_YEAR + 1,
      inflationSpikeDurationYears: 3,
      inflationSpikeRate: 0.08,
    };
  }

  function createDefaultPlan() {
    return {
      version: PLAN_VERSION,
      includePerson2: false,
      people: [
        {
          id: 1,
          name: 'Person 1',
          currentAge: 50,
          retirementAge: 65,
          targetEndAge: 95,
          currentSalary: 100000,
          salaryGrowthRate: 0.03,
          partTimeAge: null,
          partTimeRatio: 0.5,
          retirementBalanceToday: 500000,
          retirementAccountType: 'taxDeferred',
          retirementContributionType: 'percent',
          retirementContributionAmount: 0.15,
          pensionMonthly: 0,
          pensionStartAge: 65,
          pensionHasCOLA: true,
          ubiMonthly: 0,
          ubiStartAge: 67,
          socialSecurityMonthly: 2500,
          socialSecurityStartAge: 67,
        },
        {
          id: 2,
          name: 'Person 2',
          currentAge: 47,
          retirementAge: 65,
          targetEndAge: 95,
          currentSalary: 80000,
          salaryGrowthRate: 0.03,
          partTimeAge: null,
          partTimeRatio: 0.5,
          retirementBalanceToday: 400000,
          retirementAccountType: 'taxDeferred',
          retirementContributionType: 'percent',
          retirementContributionAmount: 0.15,
          pensionMonthly: 0,
          pensionStartAge: 65,
          pensionHasCOLA: true,
          ubiMonthly: 0,
          ubiStartAge: 67,
          socialSecurityMonthly: 2000,
          socialSecurityStartAge: 67,
        },
      ],
      properties: [
        {
          id: 1,
          name: 'Primary home',
          currentValue: 500000,
          costBasis: 500000,
          sellingCostsPercent: 0.06,
          isPrimaryResidence: true,
          appreciationRate: 0.02,
          monthlyRentalIncome: 0,
          rentalEndYear: null,
          mortgageBalanceToday: 0,
          mortgageInterestRate: 0.05,
          monthlyMortgage: 0,
          mortgageEndYear: null,
          sellAtYear: null,
        },
      ],
      lifeEvents: [],
      assumptions: {
        taxRate: 0.3,
        inflationRate: 0.03,
        investmentReturnOptimistic: 0.07,
        investmentReturnBase: 0.05,
        investmentReturnPessimistic: 0.04,
        startingCashWorth: 200000,
        startingAnnualExpenses: 80000,
        expenseChangeAge: null,
        expenseChangePercent: 0,
        charitableEnabled: false,
        charitableType: 'amount',
        charitableAmount: 5000,
        charitablePercent: 0.05,
        capitalGainsTaxRate: 0.15,
        socialSecurityTaxablePercent: 0.85,
        liquidTaxableYieldPercent: 0.30,
      },
      stressTests: createDefaultStressTests(),
    };
  }

  function getIncludedPeople(plan) {
    return plan.people.slice(0, plan.includePerson2 ? 2 : 1);
  }

  function scenarioInvestmentReturn(assumptions, scenarioKey) {
    if (scenarioKey === 'optimistic') {
      return assumptions.investmentReturnOptimistic;
    }
    if (scenarioKey === 'pessimistic') {
      return assumptions.investmentReturnPessimistic;
    }
    return assumptions.investmentReturnBase;
  }

  function horizonYear(plan) {
    return getIncludedPeople(plan).reduce(function (latestYear, person) {
      var yearsRemaining = Math.max(0, person.targetEndAge - person.currentAge);
      return Math.max(latestYear, CURRENT_YEAR + yearsRemaining);
    }, CURRENT_YEAR);
  }

  function isStressActive(stressTests) {
    return !!(
      stressTests.socialSecurityReductionEnabled ||
      stressTests.marketCrashEnabled ||
      stressTests.inflationSpikeEnabled
    );
  }

  function describeStressTests(stressTests) {
    var descriptions = [];

    if (stressTests.socialSecurityReductionEnabled) {
      descriptions.push(
        'Social Security reduced by ' +
          formatPercent(stressTests.socialSecurityReductionPercent) +
          ' from ' +
          stressTests.socialSecurityReductionYear
      );
    }

    if (stressTests.marketCrashEnabled) {
      descriptions.push(
        'Market crash in ' +
          stressTests.marketCrashYear +
          ' with liquid/retirement/property drops of ' +
          formatPercent(stressTests.marketCrashLiquidDropPercent) +
          ' / ' +
          formatPercent(stressTests.marketCrashRetirementDropPercent) +
          ' / ' +
          formatPercent(stressTests.marketCrashPropertyDropPercent)
      );
    }

    if (stressTests.inflationSpikeEnabled) {
      descriptions.push(
        'Inflation spike to ' +
          formatPercent(stressTests.inflationSpikeRate) +
          ' from ' +
          stressTests.inflationSpikeStartYear +
          ' for ' +
          stressTests.inflationSpikeDurationYears +
          ' year' +
          (stressTests.inflationSpikeDurationYears === 1 ? '' : 's')
      );
    }

    return descriptions;
  }

  function normalizePerson(rawPerson, defaults, index, migrationNotes) {
    var legacyRetirementValue = toNumber(rawPerson && rawPerson.retirementSavingsAt65, NaN);
    var retirementBalanceToday = toNumber(
      rawPerson && rawPerson.retirementBalanceToday,
      Number.isFinite(legacyRetirementValue)
        ? legacyRetirementValue
        : defaults.retirementBalanceToday
    );

    if (
      rawPerson &&
      !Number.isFinite(toNumber(rawPerson.retirementBalanceToday, NaN)) &&
      Number.isFinite(legacyRetirementValue)
    ) {
      migrationNotes.push(
        (rawPerson.name || defaults.name || 'Person ' + (index + 1)) +
          ': converted legacy "retirement balance at 65" into today\'s retirement balance. Review this value.'
      );
    }

    var hasAccountType = !!(rawPerson && rawPerson.retirementAccountType);
    var accountType =
      rawPerson && rawPerson.retirementAccountType === 'roth' ? 'roth' : 'taxDeferred';

    if (rawPerson && !hasAccountType && Number.isFinite(retirementBalanceToday) && retirementBalanceToday > 0) {
      migrationNotes.push(
        (rawPerson.name || defaults.name || 'Person ' + (index + 1)) +
          ': retirement account type was not set. Defaulted to tax-deferred (traditional 401(k)/IRA). Change to Roth if the account is actually after-tax.'
      );
    }

    return {
      id: toNumber(rawPerson && rawPerson.id, defaults.id || Date.now() + index),
      name: String((rawPerson && rawPerson.name) || defaults.name),
      currentAge: clamp(Math.round(toNumber(rawPerson && rawPerson.currentAge, defaults.currentAge)), 18, 120),
      retirementAge: clamp(
        Math.round(toNumber(rawPerson && rawPerson.retirementAge, defaults.retirementAge)),
        18,
        120
      ),
      targetEndAge: clamp(
        Math.round(toNumber(rawPerson && rawPerson.targetEndAge, defaults.targetEndAge)),
        18,
        130
      ),
      currentSalary: Math.max(0, toNumber(rawPerson && rawPerson.currentSalary, defaults.currentSalary)),
      salaryGrowthRate: clamp(
        toNumber(rawPerson && rawPerson.salaryGrowthRate, defaults.salaryGrowthRate),
        -0.2,
        0.2
      ),
      partTimeAge:
        rawPerson && rawPerson.partTimeAge !== null && rawPerson.partTimeAge !== ''
          ? Math.round(toNumber(rawPerson.partTimeAge, defaults.partTimeAge || defaults.retirementAge - 5))
          : null,
      partTimeRatio: clamp(
        toNumber(rawPerson && rawPerson.partTimeRatio, defaults.partTimeRatio),
        0,
        1
      ),
      retirementBalanceToday: Math.max(0, retirementBalanceToday),
      retirementAccountType: accountType,
      retirementContributionType:
        rawPerson && rawPerson.retirementContributionType === 'amount' ? 'amount' : 'percent',
      retirementContributionAmount: Math.max(
        0,
        toNumber(rawPerson && rawPerson.retirementContributionAmount, defaults.retirementContributionAmount)
      ),
      pensionMonthly: Math.max(0, toNumber(rawPerson && rawPerson.pensionMonthly, defaults.pensionMonthly)),
      pensionStartAge: clamp(
        Math.round(toNumber(rawPerson && rawPerson.pensionStartAge, defaults.pensionStartAge)),
        18,
        120
      ),
      pensionHasCOLA:
        rawPerson && typeof rawPerson.pensionHasCOLA === 'boolean'
          ? rawPerson.pensionHasCOLA
          : defaults.pensionHasCOLA,
      ubiMonthly: Math.max(0, toNumber(rawPerson && rawPerson.ubiMonthly, defaults.ubiMonthly)),
      ubiStartAge: clamp(
        Math.round(toNumber(rawPerson && rawPerson.ubiStartAge, defaults.ubiStartAge)),
        18,
        120
      ),
      socialSecurityMonthly: Math.max(
        0,
        toNumber(rawPerson && rawPerson.socialSecurityMonthly, defaults.socialSecurityMonthly)
      ),
      socialSecurityStartAge: clamp(
        Math.round(
          toNumber(rawPerson && rawPerson.socialSecurityStartAge, defaults.socialSecurityStartAge)
        ),
        18,
        120
      ),
    };
  }

  function normalizeProperty(rawProperty, defaults, index, migrationNotes, isFirst) {
    var currentValue = Math.max(
      0,
      toNumber(rawProperty && rawProperty.currentValue, defaults.currentValue)
    );

    var hasCostBasis =
      rawProperty &&
      rawProperty.costBasis !== null &&
      rawProperty.costBasis !== undefined &&
      rawProperty.costBasis !== '';
    var costBasis = hasCostBasis
      ? Math.max(0, toNumber(rawProperty.costBasis, currentValue))
      : currentValue;

    if (rawProperty && !hasCostBasis && migrationNotes) {
      migrationNotes.push(
        (rawProperty.name || defaults.name || 'Property ' + (index + 1)) +
          ': cost basis was not set. Defaulted to the current value. Update it to the real purchase price plus capital improvements for an accurate capital gains calculation.'
      );
    }

    var hasResidenceFlag = !!(rawProperty && typeof rawProperty.isPrimaryResidence === 'boolean');
    var isPrimaryResidence = hasResidenceFlag
      ? rawProperty.isPrimaryResidence
      : !!isFirst;

    var hasMortgageInterest = !!(
      rawProperty &&
      rawProperty.mortgageInterestRate !== null &&
      rawProperty.mortgageInterestRate !== undefined &&
      rawProperty.mortgageInterestRate !== ''
    );
    var mortgageInterestRate = hasMortgageInterest
      ? clamp(toNumber(rawProperty.mortgageInterestRate, defaults.mortgageInterestRate), 0, 0.3)
      : defaults.mortgageInterestRate;

    var mortgageBalance = Math.max(
      0,
      toNumber(rawProperty && rawProperty.mortgageBalanceToday, defaults.mortgageBalanceToday)
    );

    if (rawProperty && !hasMortgageInterest && mortgageBalance > 0 && migrationNotes) {
      migrationNotes.push(
        (rawProperty.name || defaults.name || 'Property ' + (index + 1)) +
          ': mortgage interest rate was not set. Defaulted to ' +
          formatPercent(defaults.mortgageInterestRate) +
          '. Update it to your actual rate for accurate amortization.'
      );
    }

    return {
      id: toNumber(rawProperty && rawProperty.id, defaults.id || Date.now() + index),
      name: String((rawProperty && rawProperty.name) || defaults.name || 'Property ' + (index + 1)),
      currentValue: currentValue,
      costBasis: costBasis,
      sellingCostsPercent: clamp(
        toNumber(rawProperty && rawProperty.sellingCostsPercent, defaults.sellingCostsPercent),
        0,
        0.25
      ),
      isPrimaryResidence: isPrimaryResidence,
      appreciationRate: Math.round(
        clamp(
          toNumber(rawProperty && rawProperty.appreciationRate, defaults.appreciationRate),
          -0.25,
          0.25
        ) * 10000
      ) / 10000,
      monthlyRentalIncome: Math.max(
        0,
        toNumber(rawProperty && rawProperty.monthlyRentalIncome, defaults.monthlyRentalIncome)
      ),
      rentalEndYear:
        rawProperty && rawProperty.rentalEndYear !== null && rawProperty.rentalEndYear !== ''
          ? Math.round(toNumber(rawProperty.rentalEndYear, defaults.rentalEndYear || CURRENT_YEAR + 10))
          : null,
      mortgageBalanceToday: mortgageBalance,
      mortgageInterestRate: mortgageInterestRate,
      monthlyMortgage: Math.max(
        0,
        toNumber(rawProperty && rawProperty.monthlyMortgage, defaults.monthlyMortgage)
      ),
      mortgageEndYear:
        rawProperty && rawProperty.mortgageEndYear !== null && rawProperty.mortgageEndYear !== ''
          ? Math.round(toNumber(rawProperty.mortgageEndYear, defaults.mortgageEndYear || CURRENT_YEAR + 15))
          : null,
      sellAtYear:
        rawProperty && rawProperty.sellAtYear !== null && rawProperty.sellAtYear !== ''
          ? Math.round(toNumber(rawProperty.sellAtYear, defaults.sellAtYear || CURRENT_YEAR + 10))
          : null,
    };
  }

  function normalizeLifeEvent(rawEvent, defaults, index) {
    return {
      id: toNumber(rawEvent && rawEvent.id, defaults.id || Date.now() + index),
      type: rawEvent && rawEvent.type === 'income' ? 'income' : 'expense',
      description: String((rawEvent && rawEvent.description) || defaults.description || 'Life event'),
      amount: Math.max(0, toNumber(rawEvent && rawEvent.amount, defaults.amount || 0)),
      year: Math.round(toNumber(rawEvent && rawEvent.year, defaults.year || CURRENT_YEAR + 1)),
    };
  }

  function migratePlan(rawPlan) {
    var defaults = createDefaultPlan();
    var input = rawPlan && typeof rawPlan === 'object' ? deepClone(rawPlan) : {};
    var migrationNotes = [];
    var hasExplicitExpenseChangeAge = !!(
      input.assumptions &&
      Object.prototype.hasOwnProperty.call(input.assumptions, 'expenseChangeAge')
    );
    var legacyExpenseReduction = toNumber(
      input.assumptions && input.assumptions.expenseReductionAtRetirement,
      NaN
    );

    var normalized = {
      version: PLAN_VERSION,
      includePerson2: !!input.includePerson2,
      people: [],
      properties: [],
      lifeEvents: [],
      assumptions: {
        taxRate: clamp(toNumber(input.assumptions && input.assumptions.taxRate, defaults.assumptions.taxRate), 0, 0.8),
        inflationRate: clamp(
          toNumber(input.assumptions && input.assumptions.inflationRate, defaults.assumptions.inflationRate),
          -0.05,
          0.2
        ),
        investmentReturnOptimistic: clamp(
          toNumber(
            input.assumptions && input.assumptions.investmentReturnOptimistic,
            defaults.assumptions.investmentReturnOptimistic
          ),
          -0.5,
          0.3
        ),
        investmentReturnBase: clamp(
          toNumber(
            input.assumptions && input.assumptions.investmentReturnBase,
            defaults.assumptions.investmentReturnBase
          ),
          -0.5,
          0.3
        ),
        investmentReturnPessimistic: clamp(
          toNumber(
            input.assumptions && input.assumptions.investmentReturnPessimistic,
            defaults.assumptions.investmentReturnPessimistic
          ),
          -0.5,
          0.3
        ),
        startingCashWorth: Math.max(
          0,
          toNumber(input.assumptions && input.assumptions.startingCashWorth, defaults.assumptions.startingCashWorth)
        ),
        startingAnnualExpenses: Math.max(
          0,
          toNumber(
            input.assumptions && input.assumptions.startingAnnualExpenses,
            defaults.assumptions.startingAnnualExpenses
          )
        ),
        expenseChangeAge:
          input.assumptions &&
          input.assumptions.expenseChangeAge !== null &&
          input.assumptions.expenseChangeAge !== ''
            ? Math.round(
                toNumber(input.assumptions.expenseChangeAge, defaults.assumptions.expenseChangeAge || 0)
              )
            : defaults.assumptions.expenseChangeAge,
        expenseChangePercent: clamp(
          toNumber(
            input.assumptions && input.assumptions.expenseChangePercent,
            defaults.assumptions.expenseChangePercent
          ),
          -0.95,
          5
        ),
        charitableEnabled:
          input.assumptions && typeof input.assumptions.charitableEnabled === 'boolean'
            ? input.assumptions.charitableEnabled
            : defaults.assumptions.charitableEnabled,
        charitableType:
          input.assumptions && input.assumptions.charitableType === 'percent' ? 'percent' : 'amount',
        charitableAmount: Math.max(
          0,
          toNumber(
            input.assumptions && input.assumptions.charitableAmount,
            defaults.assumptions.charitableAmount
          )
        ),
        charitablePercent: clamp(
          toNumber(
            input.assumptions && input.assumptions.charitablePercent,
            defaults.assumptions.charitablePercent
          ),
          0,
          1
        ),
        capitalGainsTaxRate: clamp(
          toNumber(
            input.assumptions && input.assumptions.capitalGainsTaxRate,
            defaults.assumptions.capitalGainsTaxRate
          ),
          0,
          0.5
        ),
        socialSecurityTaxablePercent: clamp(
          toNumber(
            input.assumptions && input.assumptions.socialSecurityTaxablePercent,
            defaults.assumptions.socialSecurityTaxablePercent
          ),
          0,
          1
        ),
        liquidTaxableYieldPercent: clamp(
          toNumber(
            input.assumptions && input.assumptions.liquidTaxableYieldPercent,
            defaults.assumptions.liquidTaxableYieldPercent
          ),
          0,
          1
        ),
      },
      stressTests: {
        socialSecurityReductionEnabled:
          input.stressTests && typeof input.stressTests.socialSecurityReductionEnabled === 'boolean'
            ? input.stressTests.socialSecurityReductionEnabled
            : defaults.stressTests.socialSecurityReductionEnabled,
        socialSecurityReductionPercent: clamp(
          toNumber(
            input.stressTests && input.stressTests.socialSecurityReductionPercent,
            defaults.stressTests.socialSecurityReductionPercent
          ),
          0,
          1
        ),
        socialSecurityReductionYear: Math.round(
          toNumber(
            input.stressTests && input.stressTests.socialSecurityReductionYear,
            defaults.stressTests.socialSecurityReductionYear
          )
        ),
        marketCrashEnabled:
          input.stressTests && typeof input.stressTests.marketCrashEnabled === 'boolean'
            ? input.stressTests.marketCrashEnabled
            : defaults.stressTests.marketCrashEnabled,
        marketCrashYear: Math.round(
          toNumber(input.stressTests && input.stressTests.marketCrashYear, defaults.stressTests.marketCrashYear)
        ),
        marketCrashLiquidDropPercent: clamp(
          toNumber(
            input.stressTests && input.stressTests.marketCrashLiquidDropPercent,
            defaults.stressTests.marketCrashLiquidDropPercent
          ),
          0,
          1
        ),
        marketCrashRetirementDropPercent: clamp(
          toNumber(
            input.stressTests && input.stressTests.marketCrashRetirementDropPercent,
            defaults.stressTests.marketCrashRetirementDropPercent
          ),
          0,
          1
        ),
        marketCrashPropertyDropPercent: clamp(
          toNumber(
            input.stressTests && input.stressTests.marketCrashPropertyDropPercent,
            defaults.stressTests.marketCrashPropertyDropPercent
          ),
          0,
          1
        ),
        inflationSpikeEnabled:
          input.stressTests && typeof input.stressTests.inflationSpikeEnabled === 'boolean'
            ? input.stressTests.inflationSpikeEnabled
            : defaults.stressTests.inflationSpikeEnabled,
        inflationSpikeStartYear: Math.round(
          toNumber(
            input.stressTests && input.stressTests.inflationSpikeStartYear,
            defaults.stressTests.inflationSpikeStartYear
          )
        ),
        inflationSpikeDurationYears: clamp(
          Math.round(
            toNumber(
              input.stressTests && input.stressTests.inflationSpikeDurationYears,
              defaults.stressTests.inflationSpikeDurationYears
            )
          ),
          1,
          30
        ),
        inflationSpikeRate: clamp(
          toNumber(
            input.stressTests && input.stressTests.inflationSpikeRate,
            defaults.stressTests.inflationSpikeRate
          ),
          -0.05,
          0.3
        ),
      },
    };

    if (!Array.isArray(input.people) || !input.people.length) {
      migrationNotes.push('Loaded plan had no people; defaults were restored.');
    }

    for (var personIndex = 0; personIndex < 2; personIndex += 1) {
      normalized.people.push(
        normalizePerson(
          Array.isArray(input.people) ? input.people[personIndex] : null,
          defaults.people[personIndex],
          personIndex,
          migrationNotes
        )
      );
    }

    if (Array.isArray(input.properties)) {
      normalized.properties = input.properties.map(function (property, index) {
        return normalizeProperty(property, defaults.properties[0], index, migrationNotes, index === 0);
      });
    } else {
      normalized.properties = [normalizeProperty(defaults.properties[0], defaults.properties[0], 0, null, true)];
    }

    normalized.lifeEvents = Array.isArray(input.lifeEvents)
      ? input.lifeEvents.map(function (event, index) {
          return normalizeLifeEvent(event, { amount: 10000, year: CURRENT_YEAR + 1 }, index);
        })
      : [];

    normalized.people.forEach(function (person) {
      if (person.retirementAge < person.currentAge) {
        person.retirementAge = person.currentAge;
      }
      if (person.targetEndAge < person.retirementAge) {
        person.targetEndAge = person.retirementAge;
      }
      if (person.partTimeAge !== null) {
        person.partTimeAge = clamp(person.partTimeAge, person.currentAge, person.retirementAge);
      }
    });

    normalized.assumptions.investmentReturnOptimistic = Math.max(
      normalized.assumptions.investmentReturnOptimistic,
      normalized.assumptions.investmentReturnBase
    );
    normalized.assumptions.investmentReturnPessimistic = Math.min(
      normalized.assumptions.investmentReturnPessimistic,
      normalized.assumptions.investmentReturnBase
    );

    if (!hasExplicitExpenseChangeAge && Number.isFinite(legacyExpenseReduction) && legacyExpenseReduction !== 0) {
      normalized.assumptions.expenseChangeAge = normalized.people[0].retirementAge;
      normalized.assumptions.expenseChangePercent = -clamp(legacyExpenseReduction, 0, 0.95);
      migrationNotes.push(
        'Converted legacy retirement expense reduction into an age-based expense change at Person 1 retirement age. Review this assumption.'
      );
    }

    if (
      normalized.assumptions.expenseChangeAge !== null &&
      normalized.assumptions.expenseChangeAge < normalized.people[0].currentAge
    ) {
      normalized.assumptions.expenseChangeAge = normalized.people[0].currentAge;
    }

    return { plan: normalized, migrationNotes: migrationNotes };
  }

  function validatePlan(rawPlan) {
    var migrated = migratePlan(rawPlan);
    var plan = migrated.plan;
    var messages = migrated.migrationNotes.map(function (note) {
      return { level: 'info', text: note };
    });

    getIncludedPeople(plan).forEach(function (person) {
      if (person.targetEndAge <= person.currentAge) {
        messages.push({
          level: 'warning',
          text: person.name + ': target end age should be greater than current age to produce a forward projection.',
        });
      }

      if (person.partTimeAge !== null && person.partTimeAge > person.retirementAge) {
        messages.push({
          level: 'warning',
          text: person.name + ': part-time age should not be after retirement age.',
        });
      }

      if (person.retirementContributionType === 'percent' && person.retirementContributionAmount > 0.4) {
        messages.push({
          level: 'warning',
          text: person.name + ': retirement contribution rate is above 40%. Double-check that this is intentional.',
        });
      }

      if (person.ubiMonthly > 0 && person.ubiStartAge < person.currentAge) {
        messages.push({
          level: 'info',
          text: person.name + ': UBI starts before current age, so it is treated as already active.',
        });
      }
    });

    plan.properties.forEach(function (property) {
      if (property.mortgageBalanceToday > 0 && !property.mortgageEndYear) {
        messages.push({
          level: 'warning',
          text: property.name + ': a mortgage balance is set but the payoff year is blank.',
        });
      }

      if (property.mortgageBalanceToday > 0 && property.monthlyMortgage > 0) {
        var annualPayment = property.monthlyMortgage * 12;
        var annualInterest = property.mortgageBalanceToday * property.mortgageInterestRate;
        if (annualPayment < annualInterest) {
          messages.push({
            level: 'warning',
            text:
              property.name +
              ': the monthly mortgage payment is smaller than the annual interest at the given rate. The balance would grow (negative amortization). The engine holds the balance flat as a simplification.',
          });
        }
      }

      if (property.sellAtYear && property.rentalEndYear && property.sellAtYear < property.rentalEndYear) {
        messages.push({
          level: 'info',
          text: property.name + ': rental income is scheduled after the sale year and will stop at sale.',
        });
      }

      if (property.sellAtYear && property.costBasis > property.currentValue * 2) {
        messages.push({
          level: 'info',
          text: property.name + ': cost basis is much higher than current value, so the sale will show no taxable gain.',
        });
      }
    });

    if (plan.assumptions.taxRate >= 0.65) {
      messages.push({
        level: 'warning',
        text: 'The effective tax rate is very high. Withdrawals from tax-deferred accounts will also be taxed at this rate.',
      });
    }

    if (plan.assumptions.investmentReturnPessimistic < plan.assumptions.inflationRate) {
      messages.push({
        level: 'info',
        text: 'Pessimistic returns are below inflation, so that scenario represents a negative real-return environment.',
      });
    }

    if (plan.assumptions.expenseChangeAge !== null) {
      if (plan.assumptions.expenseChangeAge > plan.people[0].targetEndAge) {
        messages.push({
          level: 'warning',
          text: 'The expense change age is outside Person 1\'s planning horizon.',
        });
      }

      if (plan.assumptions.expenseChangePercent === 0) {
        messages.push({
          level: 'info',
          text: 'An expense change age is set, but the change percent is 0%, so it has no effect.',
        });
      }
    }

    if (isStressActive(plan.stressTests)) {
      var maxYear = horizonYear(plan);
      if (plan.stressTests.marketCrashEnabled && plan.stressTests.marketCrashYear > maxYear) {
        messages.push({
          level: 'warning',
          text: 'The market crash year is outside the current planning horizon.',
        });
      }
      if (plan.stressTests.inflationSpikeEnabled && plan.stressTests.inflationSpikeStartYear > maxYear) {
        messages.push({
          level: 'warning',
          text: 'The inflation spike begins after the current planning horizon.',
        });
      }
    }

    return messages;
  }

  function inflationRateForYear(plan, year, ignoreStress) {
    var rate = plan.assumptions.inflationRate;
    var stress = plan.stressTests;

    if (!ignoreStress && stress.inflationSpikeEnabled) {
      var spikeEndYear = stress.inflationSpikeStartYear + stress.inflationSpikeDurationYears - 1;
      if (year >= stress.inflationSpikeStartYear && year <= spikeEndYear) {
        return stress.inflationSpikeRate;
      }
    }

    return rate;
  }

  function socialSecurityReductionFactor(plan, year, ignoreStress) {
    if (ignoreStress || !plan.stressTests.socialSecurityReductionEnabled) {
      return 1;
    }

    return year >= plan.stressTests.socialSecurityReductionYear
      ? 1 - plan.stressTests.socialSecurityReductionPercent
      : 1;
  }

  function distributeRetirementWithdrawal(balances, accessibleFlags, requestedAmount) {
    var withdrawals = balances.map(function () {
      return 0;
    });
    var totalAccessible = balances.reduce(function (sum, balance, index) {
      return accessibleFlags[index] ? sum + balance : sum;
    }, 0);

    if (requestedAmount <= 0 || totalAccessible <= 0) {
      return withdrawals;
    }

    var remaining = requestedAmount;

    balances.forEach(function (balance, index) {
      if (!accessibleFlags[index]) {
        return;
      }

      var proportionalShare = requestedAmount * (balance / totalAccessible);
      var appliedShare = Math.min(balance, proportionalShare);
      withdrawals[index] = roundMoney(appliedShare);
      remaining -= appliedShare;
    });

    if (remaining > 0.01) {
      balances.forEach(function (balance, index) {
        if (!accessibleFlags[index] || remaining <= 0.01) {
          return;
        }

        var capacity = balance - withdrawals[index];
        if (capacity <= 0) {
          return;
        }

        var extra = Math.min(capacity, remaining);
        withdrawals[index] = roundMoney(withdrawals[index] + extra);
        remaining -= extra;
      });
    }

    return withdrawals;
  }

  function expenseChangeYear(plan) {
    if (plan.assumptions.expenseChangeAge === null) {
      return null;
    }

    return CURRENT_YEAR + Math.max(0, plan.assumptions.expenseChangeAge - plan.people[0].currentAge);
  }

  function buildProjection(rawPlan, scenarioKey, options) {
    var settings = options || {};
    var plan = settings.preMigrated ? rawPlan : migratePlan(rawPlan).plan;
    var ignoreStress = !!settings.ignoreStress;
    var people = getIncludedPeople(plan);
    var lastYear = horizonYear(plan);
    var investmentReturn = scenarioInvestmentReturn(plan.assumptions, scenarioKey || 'base');
    var expenseStepYear = expenseChangeYear(plan);
    var inflationMultiplier = 1;
    var cappedInflationMultiplier = 1;
    var liquidAssets = plan.assumptions.startingCashWorth;
    var retirementBalances = people.map(function (person) {
      return person.retirementBalanceToday;
    });
    var propertyStates = plan.properties.map(function (property) {
      return {
        id: property.id,
        name: property.name,
        originalValue: property.currentValue,
        currentValue: property.currentValue,
        remainingMortgage: property.mortgageBalanceToday,
        sold: false,
      };
    });
    var projection = [];

    for (var year = CURRENT_YEAR; year <= lastYear; year += 1) {
      var yearIndex = year - CURRENT_YEAR;
      var inflationRate = inflationRateForYear(plan, year, ignoreStress);
      var socialSecurityFactor = socialSecurityReductionFactor(plan, year, ignoreStress);
      var stressLosses = {
        liquid: 0,
        retirement: 0,
        property: 0,
      };

      if (!ignoreStress && plan.stressTests.marketCrashEnabled && year === plan.stressTests.marketCrashYear) {
        var preCrashLiquid = liquidAssets;
        liquidAssets = roundMoney(liquidAssets * (1 - plan.stressTests.marketCrashLiquidDropPercent));
        stressLosses.liquid = roundMoney(preCrashLiquid - liquidAssets);

        retirementBalances = retirementBalances.map(function (balance) {
          var nextBalance = roundMoney(balance * (1 - plan.stressTests.marketCrashRetirementDropPercent));
          stressLosses.retirement += roundMoney(balance - nextBalance);
          return nextBalance;
        });

        propertyStates = propertyStates.map(function (state) {
          if (state.sold) {
            return state;
          }
          var nextValue = roundMoney(state.currentValue * (1 - plan.stressTests.marketCrashPropertyDropPercent));
          stressLosses.property += roundMoney(state.currentValue - nextValue);
          return {
            id: state.id,
            name: state.name,
            originalValue: state.originalValue,
            currentValue: nextValue,
            remainingMortgage: state.remainingMortgage,
            sold: state.sold,
          };
        });
      }

      var personStates = people.map(function (person, index) {
        var age = person.currentAge + yearIndex;
        var alive = age <= person.targetEndAge;
        var retired = !alive ? false : age >= person.retirementAge;
        var partTime = alive && person.partTimeAge !== null && age >= person.partTimeAge && age < person.retirementAge;
        var salary = 0;

        if (alive && age < person.retirementAge) {
          salary = person.currentSalary * Math.pow(1 + person.salaryGrowthRate, yearIndex);
          if (partTime) {
            salary *= person.partTimeRatio;
          }
        }

        var contribution = 0;
        if (alive && age < person.retirementAge) {
          contribution =
            person.retirementContributionType === 'amount'
              ? person.retirementContributionAmount
              : salary * person.retirementContributionAmount;
        }

        var pensionIncome = 0;
        if (alive && age >= person.pensionStartAge && person.pensionMonthly > 0) {
          var pensionMultiplier = person.pensionHasCOLA ? cappedInflationMultiplier : 1;
          pensionIncome = person.pensionMonthly * 12 * pensionMultiplier;
        }

        var ubiIncome = 0;
        if (alive && age >= person.ubiStartAge && person.ubiMonthly > 0) {
          ubiIncome = person.ubiMonthly * 12 * cappedInflationMultiplier;
        }

        var socialSecurityIncome = 0;
        if (alive && age >= person.socialSecurityStartAge && person.socialSecurityMonthly > 0) {
          socialSecurityIncome = person.socialSecurityMonthly * 12 * inflationMultiplier * socialSecurityFactor;
        }

        return {
          age: age,
          alive: alive,
          retired: retired,
          salary: roundMoney(salary),
          contribution: roundMoney(contribution),
          pensionIncome: roundMoney(pensionIncome),
          ubiIncome: roundMoney(ubiIncome),
          socialSecurityIncome: roundMoney(socialSecurityIncome),
          openingRetirementBalance: retirementBalances[index],
          retirementGrowth: roundMoney(Math.max(0, retirementBalances[index]) * investmentReturn),
        };
      });

      retirementBalances = personStates.map(function (personState) {
        return roundMoney(
          personState.openingRetirementBalance + personState.retirementGrowth + personState.contribution
        );
      });

      var salaryIncome = personStates.reduce(function (sum, personState) {
        return sum + personState.salary;
      }, 0);
      var retirementContributionTotal = personStates.reduce(function (sum, personState) {
        return sum + personState.contribution;
      }, 0);
      var taxDeferredContributionTotal = personStates.reduce(function (sum, personState, index) {
        return people[index].retirementAccountType === 'taxDeferred' ? sum + personState.contribution : sum;
      }, 0);
      var pensionIncome = personStates.reduce(function (sum, personState) {
        return sum + personState.pensionIncome;
      }, 0);
      var ubiIncome = personStates.reduce(function (sum, personState) {
        return sum + personState.ubiIncome;
      }, 0);
      var socialSecurityIncome = personStates.reduce(function (sum, personState) {
        return sum + personState.socialSecurityIncome;
      }, 0);
      var liquidInvestmentIncome = roundMoney(Math.max(0, liquidAssets) * investmentReturn);
      var rentalIncome = 0;
      var mortgagePayments = 0;
      var mortgageInterestPaidTotal = 0;
      var propertySaleProceeds = 0;
      var propertySaleTaxableGain = 0;
      var totalPropertyValue = 0;
      var totalMortgageBalance = 0;
      var propertySnapshots = [];

      propertyStates = propertyStates.map(function (state, index) {
        var property = plan.properties[index];

        if (state.sold) {
          propertySnapshots.push({
            id: state.id,
            name: state.name,
            sold: true,
            soldThisYear: false,
            endValue: 0,
            remainingMortgage: 0,
            equity: 0,
            annualRentalIncome: 0,
            saleProceeds: 0,
            taxableGain: 0,
          });
          return state;
        }

        var rentalActive =
          property.monthlyRentalIncome > 0 &&
          (!property.rentalEndYear || year <= property.rentalEndYear) &&
          (!property.sellAtYear || year <= property.sellAtYear);
        var annualRentalIncome = rentalActive
          ? roundMoney(property.monthlyRentalIncome * 12 * inflationMultiplier)
          : 0;
        rentalIncome += annualRentalIncome;

        var mortgageActive =
          state.remainingMortgage > 0 &&
          property.monthlyMortgage > 0 &&
          property.mortgageEndYear &&
          year <= property.mortgageEndYear;
        var annualMortgagePayment = mortgageActive ? roundMoney(property.monthlyMortgage * 12) : 0;
        mortgagePayments += annualMortgagePayment;

        // Real amortization: interest first, then principal, cap at payment and at remaining balance.
        var annualInterest = 0;
        var principalPaid = 0;
        if (mortgageActive) {
          annualInterest = roundMoney(state.remainingMortgage * property.mortgageInterestRate);
          mortgageInterestPaidTotal += annualInterest;
          principalPaid = Math.max(0, annualMortgagePayment - annualInterest);
          principalPaid = Math.min(principalPaid, state.remainingMortgage);
        }

        var endRemainingMortgage = mortgageActive
          ? roundMoney(Math.max(0, state.remainingMortgage - principalPaid))
          : state.remainingMortgage;

        // Force to zero at/past the payoff year even if amortization hasn't caught up.
        if (property.mortgageEndYear && year >= property.mortgageEndYear) {
          endRemainingMortgage = 0;
        }

        var appreciatedValue = roundMoney(state.currentValue * (1 + property.appreciationRate));
        var soldThisYear = !!property.sellAtYear && year === property.sellAtYear;

        if (soldThisYear) {
          var sellingCosts = roundMoney(appreciatedValue * property.sellingCostsPercent);
          var netSaleValue = roundMoney(appreciatedValue - sellingCosts);
          var realizedGainBeforeExclusion = Math.max(0, roundMoney(netSaleValue - property.costBasis));
          var exclusion = 0;
          if (property.isPrimaryResidence) {
            exclusion = plan.includePerson2 ? 500000 : 250000;
          }
          var taxableGain = Math.max(0, roundMoney(realizedGainBeforeExclusion - exclusion));
          var saleProceeds = roundMoney(netSaleValue - endRemainingMortgage);

          propertySaleProceeds += saleProceeds;
          propertySaleTaxableGain += taxableGain;

          propertySnapshots.push({
            id: state.id,
            name: state.name,
            sold: true,
            soldThisYear: true,
            endValue: 0,
            remainingMortgage: 0,
            equity: 0,
            annualRentalIncome: annualRentalIncome,
            saleProceeds: saleProceeds,
            taxableGain: taxableGain,
          });

          return {
            id: state.id,
            name: state.name,
            originalValue: state.originalValue,
            currentValue: appreciatedValue,
            remainingMortgage: 0,
            sold: true,
          };
        }

        totalPropertyValue += appreciatedValue;
        totalMortgageBalance += endRemainingMortgage;
        propertySnapshots.push({
          id: state.id,
          name: state.name,
          sold: false,
          soldThisYear: false,
          endValue: appreciatedValue,
          remainingMortgage: endRemainingMortgage,
          equity: roundMoney(appreciatedValue - endRemainingMortgage),
          annualRentalIncome: annualRentalIncome,
          saleProceeds: 0,
          taxableGain: 0,
        });

        return {
          id: state.id,
          name: state.name,
          originalValue: state.originalValue,
          currentValue: appreciatedValue,
          remainingMortgage: endRemainingMortgage,
          sold: false,
        };
      });

      var charitableBaseIncome = salaryIncome + rentalIncome + pensionIncome + ubiIncome + socialSecurityIncome;
      var charitableDonation = 0;

      if (plan.assumptions.charitableEnabled) {
        charitableDonation =
          plan.assumptions.charitableType === 'percent'
            ? charitableBaseIncome * plan.assumptions.charitablePercent
            : plan.assumptions.charitableAmount * inflationMultiplier;
      }

      var livingExpensesBase = plan.assumptions.startingAnnualExpenses * inflationMultiplier;
      var expenseChangeActive = expenseStepYear !== null && year >= expenseStepYear;
      var livingExpenses = roundMoney(
        Math.max(
          0,
          livingExpensesBase * (expenseChangeActive ? 1 + plan.assumptions.expenseChangePercent : 1)
        )
      );

      var lifeEventIncome = 0;
      var lifeEventExpense = 0;
      plan.lifeEvents.forEach(function (event) {
        if (event.year !== year) {
          return;
        }

        if (event.type === 'income') {
          lifeEventIncome += event.amount;
        } else {
          lifeEventExpense += event.amount;
        }
      });

      // We need to compute taxes, but taxes depend on retirement withdrawals and
      // retirement withdrawals depend on cash shortfall after taxes. We solve this
      // in two passes: (1) taxes assuming no discretionary withdrawal beyond RMDs,
      // (2) sizing discretionary withdrawals to cover any remaining shortfall
      // including the added tax from those withdrawals.

      var retirementAccessibleFlags = personStates.map(function (personState, index) {
        return !personState.alive || personState.age >= people[index].retirementAge;
      });

      var rmdByPerson = people.map(function (person, index) {
        if (person.retirementAccountType !== 'taxDeferred') {
          return 0;
        }
        var age = personStates[index].age;
        if (!personStates[index].alive || age < RMD_START_AGE) {
          return 0;
        }
        var period = rmdDistributionPeriod(age);
        if (period <= 0) {
          return 0;
        }
        return roundMoney(Math.min(retirementBalances[index], retirementBalances[index] / period));
      });
      var totalRmd = rmdByPerson.reduce(function (sum, rmd) {
        return sum + rmd;
      }, 0);

      // taxDeferred RMD portion (all of RMD is taxDeferred by construction)
      var taxDeferredWithdrawalFromRmd = totalRmd;

      var socialSecurityTaxable = socialSecurityIncome * plan.assumptions.socialSecurityTaxablePercent;
      var liquidInvestmentTaxable = liquidInvestmentIncome * plan.assumptions.liquidTaxableYieldPercent;

      function ordinaryTaxesFor(taxDeferredWithdrawal) {
        var ordinaryTaxableIncome =
          salaryIncome +
          rentalIncome +
          pensionIncome +
          ubiIncome +
          socialSecurityTaxable +
          liquidInvestmentTaxable +
          taxDeferredWithdrawal;
        var deductions = charitableDonation + taxDeferredContributionTotal;
        return Math.max(0, ordinaryTaxableIncome - deductions) * plan.assumptions.taxRate;
      }

      var capitalGainsTaxes = roundMoney(
        Math.max(0, propertySaleTaxableGain) * plan.assumptions.capitalGainsTaxRate
      );

      // Pass 1: tax assuming withdrawal = RMD only
      var pass1Taxes = roundMoney(ordinaryTaxesFor(taxDeferredWithdrawalFromRmd));

      var grossInflowsBeforeRetirement = roundMoney(
        salaryIncome +
          rentalIncome +
          pensionIncome +
          ubiIncome +
          socialSecurityIncome +
          liquidInvestmentIncome +
          propertySaleProceeds +
          lifeEventIncome
      );
      var nonTaxOutflows = roundMoney(
        livingExpenses + mortgagePayments + charitableDonation + retirementContributionTotal + lifeEventExpense
      );

      // Start with RMD minimums as baseline withdrawals.
      var retirementWithdrawalsByPerson = rmdByPerson.slice();

      // Cash after pass-1 taxes with only RMD withdrawals covering the shortfall.
      var cashAfterRmd = roundMoney(
        grossInflowsBeforeRetirement + totalRmd - nonTaxOutflows - pass1Taxes - capitalGainsTaxes
      );

      var finalTaxDeferredWithdrawal = taxDeferredWithdrawalFromRmd;
      var accessibleRetirementBalance = retirementBalances.reduce(function (sum, balance, index) {
        return retirementAccessibleFlags[index] ? sum + balance : sum;
      }, 0);

      if (cashAfterRmd < 0 && accessibleRetirementBalance > 0) {
        // We need an additional discretionary withdrawal to cover the cash
        // shortfall. If any portion of that withdrawal comes from a taxDeferred
        // account, it adds to taxable income and therefore adds to the tax bill,
        // which means we have to withdraw more to cover that extra tax — the
        // classic "gross up" problem. Solve it in closed form.
        var taxRate = plan.assumptions.taxRate;
        var shortfall = Math.abs(cashAfterRmd);

        // Remaining accessible balances after applying the RMD baseline.
        var remainingBalances = retirementBalances.map(function (balance, idx) {
          return retirementAccessibleFlags[idx] ? Math.max(0, balance - rmdByPerson[idx]) : 0;
        });
        var totalRemaining = remainingBalances.reduce(function (sum, bal) {
          return sum + bal;
        }, 0);
        var taxDeferredRemaining = remainingBalances.reduce(function (sum, bal, idx) {
          return people[idx].retirementAccountType === 'taxDeferred' ? sum + bal : sum;
        }, 0);
        // Fraction of each additional dollar withdrawn that comes from a
        // taxDeferred account (distributeRetirementWithdrawal splits
        // proportionally by balance across all accessible accounts).
        var taxDeferredShare = totalRemaining > 0 ? taxDeferredRemaining / totalRemaining : 0;

        // Baseline taxable income (with only RMDs) and total deductions. Neither
        // of these depend on the discretionary withdrawal amount.
        var baseTaxable =
          salaryIncome +
          rentalIncome +
          pensionIncome +
          ubiIncome +
          socialSecurityTaxable +
          liquidInvestmentTaxable +
          taxDeferredWithdrawalFromRmd;
        var deductions = charitableDonation + taxDeferredContributionTotal;

        var additionalNeeded;
        if (taxDeferredShare === 0 || taxRate === 0) {
          // No tax gross-up applies.
          additionalNeeded = shortfall;
        } else {
          // Figure out how much of the withdrawal (if any) would fit under the
          // remaining deduction headroom before any tax kicks in.
          var deductionHeadroom = Math.max(0, deductions - baseTaxable);
          // Only the taxDeferred portion counts toward using up headroom.
          var withdrawalToCloseHeadroom =
            taxDeferredShare > 0 && deductionHeadroom > 0
              ? deductionHeadroom / taxDeferredShare
              : 0;

          if (shortfall <= withdrawalToCloseHeadroom) {
            additionalNeeded = shortfall;
          } else {
            // First close the headroom (tax-free), then gross up the remainder.
            var remainderAfterHeadroom = shortfall - withdrawalToCloseHeadroom;
            var marginalNetFactor = 1 - taxDeferredShare * taxRate;
            additionalNeeded =
              withdrawalToCloseHeadroom + remainderAfterHeadroom / marginalNetFactor;
          }
        }

        // Can't withdraw more than what's accessible.
        additionalNeeded = Math.min(additionalNeeded, totalRemaining);

        var additionalWithdrawals = distributeRetirementWithdrawal(
          remainingBalances,
          retirementAccessibleFlags,
          additionalNeeded
        );
        var additionalTaxDeferred = additionalWithdrawals.reduce(function (sum, wd, idx) {
          return people[idx].retirementAccountType === 'taxDeferred' ? sum + wd : sum;
        }, 0);
        retirementWithdrawalsByPerson = retirementWithdrawalsByPerson.map(function (rmd, idx) {
          return roundMoney(rmd + additionalWithdrawals[idx]);
        });
        finalTaxDeferredWithdrawal = roundMoney(taxDeferredWithdrawalFromRmd + additionalTaxDeferred);
      }

      var retirementWithdrawal = retirementWithdrawalsByPerson.reduce(function (sum, w) {
        return sum + w;
      }, 0);

      retirementBalances = retirementBalances.map(function (balance, index) {
        return roundMoney(balance - retirementWithdrawalsByPerson[index]);
      });

      var ordinaryTaxes = roundMoney(ordinaryTaxesFor(finalTaxDeferredWithdrawal));
      var totalTaxes = roundMoney(ordinaryTaxes + capitalGainsTaxes);
      var grossInflows = roundMoney(grossInflowsBeforeRetirement + retirementWithdrawal);
      var totalOutflows = roundMoney(nonTaxOutflows + totalTaxes);
      var netCashFlow = roundMoney(grossInflows - totalOutflows);
      liquidAssets = roundMoney(liquidAssets + netCashFlow);

      var totalRetirementBalance = roundMoney(
        retirementBalances.reduce(function (sum, balance) {
          return sum + balance;
        }, 0)
      );
      var totalPropertyEquity = roundMoney(totalPropertyValue - totalMortgageBalance);
      var totalNetWorth = roundMoney(liquidAssets + totalRetirementBalance + totalPropertyEquity);

      var ordinaryTaxableIncomeForReporting = roundMoney(
        salaryIncome +
          rentalIncome +
          pensionIncome +
          ubiIncome +
          socialSecurityTaxable +
          liquidInvestmentTaxable +
          finalTaxDeferredWithdrawal
      );

      projection.push({
        year: year,
        inflationRateUsed: inflationRate,
        personStates: personStates.map(function (personState, index) {
          return {
            name: people[index].name,
            age: personState.age,
            alive: personState.alive,
            retired: personState.retired,
            salary: personState.salary,
            retirementContribution: personState.contribution,
            retirementAccountType: people[index].retirementAccountType,
            pensionIncome: personState.pensionIncome,
            ubiIncome: personState.ubiIncome,
            socialSecurityIncome: personState.socialSecurityIncome,
            retirementGrowth: personState.retirementGrowth,
            retirementWithdrawal: retirementWithdrawalsByPerson[index],
            retirementBalance: retirementBalances[index],
          };
        }),
        propertySnapshots: propertySnapshots,
        salaryIncome: roundMoney(salaryIncome),
        retirementContributionTotal: roundMoney(retirementContributionTotal),
        taxDeferredContributionTotal: roundMoney(taxDeferredContributionTotal),
        rentalIncome: roundMoney(rentalIncome),
        pensionIncome: roundMoney(pensionIncome),
        ubiIncome: roundMoney(ubiIncome),
        socialSecurityIncome: roundMoney(socialSecurityIncome),
        socialSecurityTaxable: roundMoney(socialSecurityTaxable),
        liquidInvestmentIncome: roundMoney(liquidInvestmentIncome),
        liquidInvestmentTaxable: roundMoney(liquidInvestmentTaxable),
        propertySaleProceeds: roundMoney(propertySaleProceeds),
        propertySaleTaxableGain: roundMoney(propertySaleTaxableGain),
        lifeEventIncome: roundMoney(lifeEventIncome),
        lifeEventExpense: roundMoney(lifeEventExpense),
        charitableDonation: roundMoney(charitableDonation),
        livingExpenses: roundMoney(livingExpenses),
        expenseChangeActive: expenseChangeActive,
        expenseChangeAge: plan.assumptions.expenseChangeAge,
        expenseChangePercentApplied: expenseChangeActive ? plan.assumptions.expenseChangePercent : 0,
        mortgagePayments: roundMoney(mortgagePayments),
        mortgageInterestPaid: roundMoney(mortgageInterestPaidTotal),
        deductions: roundMoney(charitableDonation + taxDeferredContributionTotal),
        taxableIncome: roundMoney(ordinaryTaxableIncomeForReporting + propertySaleTaxableGain),
        ordinaryTaxableIncome: ordinaryTaxableIncomeForReporting,
        ordinaryTaxes: ordinaryTaxes,
        capitalGainsTaxes: capitalGainsTaxes,
        taxes: totalTaxes,
        retirementWithdrawal: roundMoney(retirementWithdrawal),
        taxDeferredWithdrawal: roundMoney(finalTaxDeferredWithdrawal),
        rmdWithdrawal: roundMoney(totalRmd),
        grossInflows: grossInflows,
        totalOutflows: totalOutflows,
        netCashFlow: netCashFlow,
        endingLiquidAssets: roundMoney(liquidAssets),
        accessibleRetirementBalance: roundMoney(accessibleRetirementBalance),
        totalRetirementBalance: totalRetirementBalance,
        totalPropertyValue: roundMoney(totalPropertyValue),
        totalMortgageBalance: roundMoney(totalMortgageBalance),
        totalPropertyEquity: totalPropertyEquity,
        totalNetWorth: totalNetWorth,
        stressLosses: stressLosses,
      });

      inflationMultiplier *= 1 + inflationRate;
      cappedInflationMultiplier *= 1 + Math.min(inflationRate, COLA_CAP);
    }

    return projection;
  }

  function currentNetWorth(plan) {
    var migrated = migratePlan(plan).plan;
    var totalRetirement = getIncludedPeople(migrated).reduce(function (sum, person) {
      return sum + person.retirementBalanceToday;
    }, 0);
    var totalPropertyEquity = migrated.properties.reduce(function (sum, property) {
      return sum + (property.currentValue - property.mortgageBalanceToday);
    }, 0);
    return roundMoney(migrated.assumptions.startingCashWorth + totalRetirement + totalPropertyEquity);
  }

  function householdRetirementYear(plan) {
    return getIncludedPeople(plan).reduce(function (latestYear, person) {
      return Math.max(latestYear, CURRENT_YEAR + Math.max(0, person.retirementAge - person.currentAge));
    }, CURRENT_YEAR);
  }

  function summarizeProjection(plan, projection) {
    var migrated = migratePlan(plan).plan;
    var retirementYear = householdRetirementYear(migrated);
    var retirementRow =
      projection.find(function (row) {
        return row.year >= retirementYear;
      }) || projection[projection.length - 1];
    var horizonRow = projection[projection.length - 1];
    var firstDeficitRow = projection.find(function (row) {
      return row.endingLiquidAssets < 0;
    });

    return {
      currentNetWorth: currentNetWorth(migrated),
      householdRetirementYear: retirementYear,
      retirementNetWorth: retirementRow ? retirementRow.totalNetWorth : currentNetWorth(migrated),
      horizonYear: horizonRow ? horizonRow.year : CURRENT_YEAR,
      horizonNetWorth: horizonRow ? horizonRow.totalNetWorth : currentNetWorth(migrated),
      firstDeficitYear: firstDeficitRow ? firstDeficitRow.year : null,
      firstDeficitAgeLabel: firstDeficitRow
        ? firstDeficitRow.personStates
            .map(function (personState) {
              return personState.alive ? personState.name + ' ' + personState.age : personState.name + ' ended';
            })
            .join(', ')
        : null,
    };
  }

  function buildScenarioSet(plan, options) {
    var migrated = migratePlan(plan);
    var normalizedPlan = migrated.plan;
    var projectionOptions = {};
    var key;
    for (key in (options || {})) {
      if (Object.prototype.hasOwnProperty.call(options, key)) {
        projectionOptions[key] = options[key];
      }
    }
    projectionOptions.preMigrated = true;
    var scenarios = {};

    SCENARIO_ORDER.forEach(function (scenarioKey) {
      var projection = buildProjection(normalizedPlan, scenarioKey, projectionOptions);
      scenarios[scenarioKey] = {
        key: scenarioKey,
        label: SCENARIO_LABELS[scenarioKey],
        projection: projection,
        summary: summarizeProjection(normalizedPlan, projection),
      };
    });

    return {
      plan: normalizedPlan,
      migrationNotes: migrated.migrationNotes,
      scenarios: scenarios,
    };
  }

  function buildStressPreset(presetKey) {
    var stress = createDefaultStressTests();

    if (presetKey === 'social_security_zero') {
      stress.socialSecurityReductionEnabled = true;
      stress.socialSecurityReductionPercent = 1;
      stress.socialSecurityReductionYear = CURRENT_YEAR;
      return stress;
    }

    if (presetKey === 'market_crash_next_year') {
      stress.marketCrashEnabled = true;
      stress.marketCrashYear = CURRENT_YEAR + 1;
      stress.marketCrashLiquidDropPercent = 0.35;
      stress.marketCrashRetirementDropPercent = 0.35;
      stress.marketCrashPropertyDropPercent = 0.15;
      return stress;
    }

    if (presetKey === 'inflation_spike') {
      stress.inflationSpikeEnabled = true;
      stress.inflationSpikeStartYear = CURRENT_YEAR + 1;
      stress.inflationSpikeDurationYears = 3;
      stress.inflationSpikeRate = 0.08;
      return stress;
    }

    if (presetKey === 'doomsday') {
      stress.socialSecurityReductionEnabled = true;
      stress.socialSecurityReductionPercent = 1;
      stress.socialSecurityReductionYear = CURRENT_YEAR;
      stress.marketCrashEnabled = true;
      stress.marketCrashYear = CURRENT_YEAR + 1;
      stress.marketCrashLiquidDropPercent = 0.4;
      stress.marketCrashRetirementDropPercent = 0.45;
      stress.marketCrashPropertyDropPercent = 0.2;
      stress.inflationSpikeEnabled = true;
      stress.inflationSpikeStartYear = CURRENT_YEAR + 1;
      stress.inflationSpikeDurationYears = 4;
      stress.inflationSpikeRate = 0.09;
      return stress;
    }

    return stress;
  }

  function applyStressPreset(plan, presetKey) {
    var migrated = migratePlan(plan).plan;
    var nextPlan = deepClone(migrated);
    nextPlan.stressTests = buildStressPreset(presetKey);
    return nextPlan;
  }

  function scenarioDefinitions() {
    return SCENARIO_ORDER.map(function (scenarioKey) {
      return {
        key: scenarioKey,
        label: SCENARIO_LABELS[scenarioKey],
      };
    });
  }

  function stressPresetDefinitions() {
    return [
      { key: 'clear', label: 'Clear stress tests' },
      { key: 'social_security_zero', label: 'No Social Security' },
      { key: 'market_crash_next_year', label: '2008-style crash next year' },
      { key: 'inflation_spike', label: 'Three-year inflation spike' },
      { key: 'doomsday', label: 'Combined doomsday preset' },
    ];
  }

  global.RetirementEngine = {
    CURRENT_YEAR: CURRENT_YEAR,
    PLAN_VERSION: PLAN_VERSION,
    SCENARIO_ORDER: SCENARIO_ORDER.slice(),
    createDefaultPlan: createDefaultPlan,
    createDefaultStressTests: createDefaultStressTests,
    migratePlan: migratePlan,
    validatePlan: validatePlan,
    buildProjection: buildProjection,
    buildScenarioSet: buildScenarioSet,
    summarizeProjection: summarizeProjection,
    currentNetWorth: currentNetWorth,
    householdRetirementYear: householdRetirementYear,
    formatCurrency: formatCurrency,
    formatShortCurrency: formatShortCurrency,
    formatPercent: formatPercent,
    isStressActive: isStressActive,
    describeStressTests: describeStressTests,
    scenarioDefinitions: scenarioDefinitions,
    stressPresetDefinitions: stressPresetDefinitions,
    buildStressPreset: buildStressPreset,
    applyStressPreset: applyStressPreset,
    deepClone: deepClone,
    rmdDistributionPeriod: rmdDistributionPeriod,
    RMD_START_AGE: RMD_START_AGE,
    COLA_CAP: COLA_CAP,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
