(function () {
  'use strict';

  var Engine = window.RetirementEngine;
  var STORAGE_KEY = 'retirement-planner-draft-v2';
  var root = document.getElementById('app');

  var state = {
    plan: Engine.migratePlan(Engine.createDefaultPlan()).plan,
    selectedScenario: 'base',
    activeTab: 'overview',
    snapshotYear: Engine.CURRENT_YEAR,
    showAllRows: true,
    chartXMode: 'year',
    transientMessages: [],
  };

  var chartState = {
    projections: null,
    padding: null,
    width: 0,
    xSpan: 0,
    ySpan: 0,
    pointCount: 0,
    minValue: 0,
    maxValue: 1,
    yearValues: [],
  };

  var ieChartState = {
    years: null,
    pad: null,
    width: 0,
    barWidth: 0,
    gap: 0,
    barCount: 0,
    maxVal: 1,
  };

  var debounceTimer = null;
  var DEBOUNCE_MS = 600;

  hydrateDraft();
  render();

  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleInput);

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(value) {
    return Engine.deepClone(value);
  }

  function fieldId(path) {
    return 'field-' + path.replace(/[^a-zA-Z0-9]+/g, '-');
  }

  function setPathValue(target, path, value) {
    var segments = path.split('.');
    var cursor = target;

    for (var index = 0; index < segments.length - 1; index += 1) {
      var segment = segments[index];
      var key = /^\d+$/.test(segment) ? Number(segment) : segment;
      cursor = cursor[key];
    }

    var finalSegment = segments[segments.length - 1];
    cursor[/^\d+$/.test(finalSegment) ? Number(finalSegment) : finalSegment] = value;
  }

  function getSnapshotYear(projection) {
    var maxYear = projection[projection.length - 1].year;
    return Math.max(Engine.CURRENT_YEAR, Math.min(maxYear, state.snapshotYear));
  }

  function saveDraft() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan));
    } catch (error) {
      state.transientMessages = [
        {
          level: 'warning',
          text: 'Could not write to local storage. File save/load still works.',
        },
      ];
    }
  }

  function hydrateDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      var parsed = JSON.parse(raw);
      var migrated = Engine.migratePlan(parsed);
      state.plan = migrated.plan;
      state.transientMessages = migrated.migrationNotes.map(function (note) {
        return { level: 'info', text: note };
      });
    } catch (error) {
      state.transientMessages = [
        {
          level: 'warning',
          text: 'A saved browser draft was found but could not be restored.',
        },
      ];
    }
  }

  function applyPlan(nextPlan, extraMessages) {
    var migrated = Engine.migratePlan(nextPlan);
    state.plan = migrated.plan;
    state.transientMessages = (extraMessages || []).concat(
      migrated.migrationNotes.map(function (note) {
        return { level: 'info', text: note };
      })
    );
    saveDraft();
    render();
  }

  function numberField(label, path, value, options) {
    var opts = options || {};
    var dataType = opts.dataType || 'number';
    var id = fieldId(path);
    var displayValue = value;

    if (displayValue === null || displayValue === undefined) {
      displayValue = '';
    } else if (dataType === 'percent') {
      displayValue = (Number(value) * 100).toFixed(opts.percentDigits || 1);
    }

    return (
      '<div class="field ' +
      (opts.wide ? 'field--wide' : '') +
      '">' +
      '<label class="field__label" for="' +
      id +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<input id="' +
      id +
      '" type="number" data-path="' +
      escapeHtml(path) +
      '" data-type="' +
      escapeHtml(dataType) +
      '"' +
      (opts.allowEmpty ? ' data-allow-empty="true"' : '') +
      (opts.min !== undefined ? ' min="' + escapeHtml(opts.min) + '"' : '') +
      (opts.max !== undefined ? ' max="' + escapeHtml(opts.max) + '"' : '') +
      (opts.step !== undefined ? ' step="' + escapeHtml(opts.step) + '"' : '') +
      ' value="' +
      escapeHtml(displayValue) +
      '">' +
      (opts.hint ? '<div class="field__hint">' + escapeHtml(opts.hint) + '</div>' : '') +
      '</div>'
    );
  }

  function textField(label, path, value, options) {
    var opts = options || {};
    var id = fieldId(path);
    return (
      '<div class="field ' +
      (opts.wide ? 'field--wide' : '') +
      '">' +
      '<label class="field__label" for="' +
      id +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<input id="' +
      id +
      '" type="text" data-path="' +
      escapeHtml(path) +
      '" data-type="text" value="' +
      escapeHtml(value || '') +
      '">' +
      (opts.hint ? '<div class="field__hint">' + escapeHtml(opts.hint) + '</div>' : '') +
      '</div>'
    );
  }

  function selectField(label, path, value, choices, options) {
    var opts = options || {};
    var id = fieldId(path);
    return (
      '<div class="field ' +
      (opts.wide ? 'field--wide' : '') +
      '">' +
      '<label class="field__label" for="' +
      id +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<select id="' +
      id +
      '" data-path="' +
      escapeHtml(path) +
      '" data-type="text">' +
      choices
        .map(function (choice) {
          return (
            '<option value="' +
            escapeHtml(choice.value) +
            '"' +
            (choice.value === value ? ' selected' : '') +
            '>' +
            escapeHtml(choice.label) +
            '</option>'
          );
        })
        .join('') +
      '</select>' +
      (opts.hint ? '<div class="field__hint">' + escapeHtml(opts.hint) + '</div>' : '') +
      '</div>'
    );
  }

  function checkboxField(label, path, checked, hint) {
    return (
      '<div class="field field--wide">' +
      '<label class="checkbox-row">' +
      '<input type="checkbox" data-path="' +
      escapeHtml(path) +
      '" data-type="boolean"' +
      (checked ? ' checked' : '') +
      '>' +
      '<span>' +
      escapeHtml(label) +
      '</span>' +
      '</label>' +
      (hint ? '<div class="field__hint">' + escapeHtml(hint) + '</div>' : '') +
      '</div>'
    );
  }

  function renderMessages(messages) {
    if (!messages.length) {
      return '';
    }

    return (
      '<ul class="notice-list">' +
      messages
        .map(function (message) {
          return (
            '<li class="notice notice--' +
            escapeHtml(message.level) +
            '">' +
            '<div>' +
            '<strong>' +
            escapeHtml(message.level === 'error' ? 'Check this' : message.level === 'warning' ? 'Review this' : 'Note') +
            '</strong>' +
            '<div>' +
            escapeHtml(message.text) +
            '</div>' +
            '</div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderScenarioCards(bundle) {
    return (
      '<div class="scenario-card-grid">' +
      Engine.SCENARIO_ORDER.map(function (key) {
        var scenario = bundle.scenarios[key];
        var summary = scenario.summary;
        var isActive = key === state.selectedScenario;
        return (
          '<button type="button" class="scenario-card ' +
          (isActive ? 'scenario-card--active' : '') +
          '" data-action="select-scenario" data-scenario="' +
          key +
          '">' +
          '<span class="badge ' +
          (key === 'optimistic' ? '' : key === 'base' ? 'badge--blue' : 'badge--amber') +
          '">' +
          escapeHtml(scenario.label) +
          '</span>' +
          '<h4>' +
          escapeHtml(Engine.formatShortCurrency(summary.horizonNetWorth)) +
          '</h4>' +
          '<div class="card__sub">Net worth in ' +
          escapeHtml(summary.horizonYear) +
          '</div>' +
          '<div class="field__hint">' +
          escapeHtml(
            summary.firstDeficitYear
              ? 'First negative liquid year: ' + summary.firstDeficitYear
              : 'No negative liquid year in plan horizon'
          ) +
          '</div>' +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function renderChart(bundle) {
    var width = 960;
    var height = 320;
    var padding = { top: 22, right: 26, bottom: 34, left: 78 };
    var projections = Engine.SCENARIO_ORDER.map(function (key) {
      return bundle.scenarios[key].projection;
    });
    var pointCount = projections[0].length;
    var allValues = [Engine.currentNetWorth(state.plan)];
    projections.forEach(function (projection) {
      projection.forEach(function (row) {
        allValues.push(row.totalNetWorth);
        allValues.push(row.endingLiquidAssets);
      });
    });
    allValues.push(0);

    var minValue = Math.min.apply(null, allValues);
    var maxValue = Math.max.apply(null, allValues);
    if (minValue === maxValue) {
      maxValue += 1;
    }
    var xSpan = width - padding.left - padding.right;
    var ySpan = height - padding.top - padding.bottom;
    var yearValues = projections[0].map(function (row) {
      return row.year;
    });

    // Store for tooltip interaction.
    chartState.projections = projections;
    chartState.padding = padding;
    chartState.width = width;
    chartState.xSpan = xSpan;
    chartState.ySpan = ySpan;
    chartState.pointCount = pointCount;
    chartState.minValue = minValue;
    chartState.maxValue = maxValue;
    chartState.yearValues = yearValues;

    function xAt(index) {
      return padding.left + (index / Math.max(1, pointCount - 1)) * xSpan;
    }

    function yAt(value) {
      return padding.top + ((maxValue - value) / (maxValue - minValue)) * ySpan;
    }

    function pathFor(projection, field) {
      return projection
        .map(function (row, index) {
          var prefix = index === 0 ? 'M' : 'L';
          return prefix + xAt(index).toFixed(1) + ' ' + yAt(row[field]).toFixed(1);
        })
        .join(' ');
    }

    var colors = {
      optimistic: '#8ff5a4',
      base: '#78b9ff',
      pessimistic: '#f7c96a',
    };

    var gridValues = [0, 0.25, 0.5, 0.75, 1].map(function (stop) {
      return minValue + (maxValue - minValue) * stop;
    });

    return (
      '<div class="chart-shell">' +
      '<div class="chart-legend">' +
      Engine.SCENARIO_ORDER.map(function (key) {
        return (
          '<span class="legend-chip"><span class="legend-chip__swatch" style="background:' +
          colors[key] +
          '"></span>' +
          escapeHtml(bundle.scenarios[key].label) +
          ' net worth</span>'
        );
      }).join('') +
      Engine.SCENARIO_ORDER.map(function (key) {
        return (
          '<span class="legend-chip"><span class="legend-chip__swatch legend-chip__swatch--dashed" style="background:' +
          colors[key] +
          '"></span>' +
          escapeHtml(bundle.scenarios[key].label) +
          ' liquid</span>'
        );
      }).join('') +
      '</div>' +
      '<svg class="chart-svg" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" role="img" aria-label="Net worth and liquid assets by scenario">' +
      '<defs>' +
      Engine.SCENARIO_ORDER.map(function (key) {
        return (
          '<linearGradient id="grad-' + key + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="' + colors[key] + '" stop-opacity="0.28"></stop>' +
          '<stop offset="100%" stop-color="' + colors[key] + '" stop-opacity="0.02"></stop>' +
          '</linearGradient>'
        );
      }).join('') +
      '</defs>' +
      gridValues
        .map(function (value) {
          var y = yAt(value);
          return (
            '<g>' +
            '<line x1="' +
            padding.left +
            '" x2="' +
            (width - padding.right) +
            '" y1="' +
            y.toFixed(1) +
            '" y2="' +
            y.toFixed(1) +
            '" stroke="rgba(183,207,227,0.12)" stroke-dasharray="4 6"></line>' +
            '<text x="' +
            (padding.left - 12) +
            '" y="' +
            (y + 4).toFixed(1) +
            '" fill="#99aaba" text-anchor="end" font-size="12">' +
            escapeHtml(Engine.formatShortCurrency(value)) +
            '</text>' +
            '</g>'
          );
        })
        .join('') +
      '<line x1="' +
      padding.left +
      '" x2="' +
      (width - padding.right) +
      '" y1="' +
      yAt(0).toFixed(1) +
      '" y2="' +
      yAt(0).toFixed(1) +
      '" stroke="rgba(255,139,146,0.45)" stroke-width="2"></line>' +
      // Gradient area fills under net-worth lines.
      Engine.SCENARIO_ORDER.map(function (key) {
        var areaPath = pathFor(bundle.scenarios[key].projection, 'totalNetWorth') +
          ' L' + xAt(pointCount - 1).toFixed(1) + ' ' + (padding.top + ySpan).toFixed(1) +
          ' L' + xAt(0).toFixed(1) + ' ' + (padding.top + ySpan).toFixed(1) + ' Z';
        return (
          '<path d="' + areaPath + '" fill="url(#grad-' + key + ')" opacity="' +
          (key === state.selectedScenario ? '0.7' : '0.18') + '"></path>'
        );
      }).join('') +
      // Liquid-asset lines (dashed, behind net-worth lines).
      Engine.SCENARIO_ORDER.map(function (key) {
        return (
          '<path d="' +
          pathFor(bundle.scenarios[key].projection, 'endingLiquidAssets') +
          '" fill="none" stroke="' +
          colors[key] +
          '" stroke-width="2" stroke-dasharray="6 4" opacity="0.55" stroke-linecap="round" stroke-linejoin="round"></path>'
        );
      }).join('') +
      // Net-worth lines (solid, on top).
      Engine.SCENARIO_ORDER.map(function (key) {
        return (
          '<path d="' +
          pathFor(bundle.scenarios[key].projection, 'totalNetWorth') +
          '" fill="none" stroke="' +
          colors[key] +
          '" stroke-width="' +
          (key === state.selectedScenario ? 4 : 3) +
          '" stroke-linecap="round" stroke-linejoin="round"></path>'
        );
      }).join('') +
      // Tooltip elements (hidden until hover).
      '<line class="chart-cursor-line" x1="0" x2="0" y1="' +
      padding.top +
      '" y2="' +
      (height - padding.bottom) +
      '" stroke="rgba(255,255,255,0.35)" stroke-width="1" display="none"></line>' +
      '<g class="chart-tooltip-group" display="none">' +
      '<rect class="chart-tooltip-bg" x="0" y="0" width="180" height="80" rx="8" fill="rgba(8,17,28,0.92)" stroke="rgba(183,207,227,0.2)"></rect>' +
      '<text class="chart-tooltip-year" x="10" y="20" fill="#ebf2f7" font-size="13" font-weight="700"></text>' +
      '<text class="chart-tooltip-nw" x="10" y="40" fill="#99aaba" font-size="12"></text>' +
      '<text class="chart-tooltip-liq" x="10" y="58" fill="#99aaba" font-size="12"></text>' +
      '<text class="chart-tooltip-ret" x="10" y="76" fill="#99aaba" font-size="12"></text>' +
      '</g>' +
      // Invisible overlay for mouse events.
      '<rect class="chart-overlay" x="' +
      padding.left +
      '" y="' +
      padding.top +
      '" width="' +
      xSpan +
      '" height="' +
      ySpan +
      '" fill="transparent"></rect>' +
      (function () {
        var baseProj = projections[1]; // base scenario for age labels
        var firstRow = baseProj[0];
        var midRow = baseProj[Math.floor(pointCount / 2)];
        var lastRow = baseProj[pointCount - 1];
        var xLabel = state.chartXMode === 'age'
          ? function (r) { return formatAgeLabel(r); }
          : function (r) { return String(r.year); };
        return (
          '<text x="' + padding.left + '" y="' + (height - 10) +
          '" fill="#99aaba" font-size="11">' + escapeHtml(xLabel(firstRow)) + '</text>' +
          '<text x="' + xAt(Math.floor(pointCount / 2)).toFixed(1) + '" y="' + (height - 10) +
          '" fill="#99aaba" font-size="11" text-anchor="middle">' + escapeHtml(xLabel(midRow)) + '</text>' +
          '<text x="' + (width - padding.right) + '" y="' + (height - 10) +
          '" fill="#99aaba" font-size="11" text-anchor="end">' + escapeHtml(xLabel(lastRow)) + '</text>'
        );
      })() +
      '</svg>' +
      '</div>'
    );
  }

  function renderBreakdown(items, emptyText, negativeStyle) {
    if (!items.length) {
      return '<div class="empty-state">' + escapeHtml(emptyText) + '</div>';
    }

    var total = items.reduce(function (sum, item) {
      return sum + item.value;
    }, 0);

    return (
      '<ul class="breakdown-list">' +
      items
        .map(function (item) {
          var width = total > 0 ? (item.value / total) * 100 : 0;
          return (
            '<li class="breakdown-item">' +
            '<div class="breakdown-item__row">' +
            '<strong>' +
            escapeHtml(item.label) +
            '</strong>' +
            '<span>' +
            escapeHtml(Engine.formatCurrency(item.value)) +
            '</span>' +
            '</div>' +
            '<div class="bar-track"><div class="bar-fill ' +
            (negativeStyle ? 'bar-fill--rose' : '') +
            '" style="width:' +
            width.toFixed(2) +
            '%"></div></div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function formatAgeLabel(row) {
    return row.personStates
      .map(function (ps) { return ps.alive ? String(ps.age) : '—'; })
      .join(', ');
  }

  function renderXModeToggle() {
    return (
      '<div class="toggle-group">' +
      '<button type="button" class="toggle-group__btn ' +
      (state.chartXMode === 'year' ? 'is-active' : '') +
      '" data-action="set-chart-x-mode" data-mode="year">Year</button>' +
      '<button type="button" class="toggle-group__btn ' +
      (state.chartXMode === 'age' ? 'is-active' : '') +
      '" data-action="set-chart-x-mode" data-mode="age">Age</button>' +
      '</div>'
    );
  }

  function renderIncomeExpenseChart(projection) {
    var years = projection.slice(0, 45);
    var width = 960;
    var height = 260;
    var pad = { top: 18, right: 26, bottom: 30, left: 78 };
    var xSpan = width - pad.left - pad.right;
    var ySpan = height - pad.top - pad.bottom;
    var barCount = years.length;
    var barWidth = Math.max(2, xSpan / barCount - 1);
    var gap = Math.max(0.5, (xSpan - barWidth * barCount) / Math.max(1, barCount - 1));

    // Income components: salary, rental, pension+SS, investment return, retirement withdrawal.
    function incomeStack(row) {
      return [
        Math.max(0, row.salaryIncome),
        Math.max(0, row.rentalIncome),
        Math.max(0, row.pensionIncome + row.socialSecurityIncome + row.ubiIncome),
        Math.max(0, row.liquidInvestmentIncome),
        Math.max(0, row.retirementWithdrawal),
      ];
    }

    var maxIncome = 0;
    var maxExpense = 0;
    years.forEach(function (row) {
      var incomes = incomeStack(row);
      var totalIncome = incomes.reduce(function (a, b) { return a + b; }, 0);
      if (totalIncome > maxIncome) { maxIncome = totalIncome; }
      if (row.totalOutflows > maxExpense) { maxExpense = row.totalOutflows; }
    });
    var maxVal = Math.max(maxIncome, maxExpense, 1);

    // Store for tooltip interaction.
    ieChartState.years = years;
    ieChartState.pad = pad;
    ieChartState.width = width;
    ieChartState.height = height;
    ieChartState.barWidth = barWidth;
    ieChartState.gap = gap;
    ieChartState.barCount = barCount;
    ieChartState.maxVal = maxVal;
    ieChartState.ySpan = ySpan;

    function barX(index) {
      return pad.left + index * (barWidth + gap);
    }

    var incomeColors = ['#34d399', '#22d3ee', '#a78bfa', '#6366f1', '#14b8a6'];
    var incomeLabels = ['Salary', 'Rental', 'Pension/SS/UBI', 'Investments', 'Retirement wd'];

    var gridValues = [0, 0.25, 0.5, 0.75, 1].map(function (s) {
      return maxVal * s;
    });

    var bars = '';
    years.forEach(function (row, i) {
      var x = barX(i);
      var incomes = incomeStack(row);
      var yCursor = pad.top + ySpan;

      // Stacked income bars.
      incomes.forEach(function (val, ci) {
        if (val <= 0) { return; }
        var barH = (val / maxVal) * ySpan;
        yCursor -= barH;
        bars +=
          '<rect x="' + x.toFixed(1) +
          '" y="' + yCursor.toFixed(1) +
          '" width="' + (barWidth * 0.48).toFixed(1) +
          '" height="' + barH.toFixed(1) +
          '" fill="' + incomeColors[ci] +
          '" opacity="0.85" rx="1"></rect>';
      });

      // Expense bar (right half).
      var expH = (row.totalOutflows / maxVal) * ySpan;
      bars +=
        '<rect x="' + (x + barWidth * 0.52).toFixed(1) +
        '" y="' + (pad.top + ySpan - expH).toFixed(1) +
        '" width="' + (barWidth * 0.48).toFixed(1) +
        '" height="' + expH.toFixed(1) +
        '" fill="#f43f5e" opacity="0.75" rx="1"></rect>';
    });

    // X-axis labels (first, middle, last).
    var first = years[0];
    var mid = years[Math.floor(barCount / 2)];
    var last = years[barCount - 1];
    var xLabel = state.chartXMode === 'age' ? formatAgeLabel : function (r) { return String(r.year); };
    var xLabels =
      '<text x="' + pad.left + '" y="' + (height - 8) + '" fill="#99aaba" font-size="11">' +
      escapeHtml(xLabel(first)) + '</text>' +
      '<text x="' + barX(Math.floor(barCount / 2)).toFixed(1) + '" y="' + (height - 8) + '" fill="#99aaba" font-size="11" text-anchor="middle">' +
      escapeHtml(xLabel(mid)) + '</text>' +
      '<text x="' + (width - pad.right) + '" y="' + (height - 8) + '" fill="#99aaba" font-size="11" text-anchor="end">' +
      escapeHtml(xLabel(last)) + '</text>';

    var gridLines = gridValues.map(function (val) {
      var y = pad.top + ((maxVal - val) / maxVal) * ySpan;
      return (
        '<line x1="' + pad.left + '" x2="' + (width - pad.right) +
        '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) +
        '" stroke="rgba(183,207,227,0.1)" stroke-dasharray="4 6"></line>' +
        '<text x="' + (pad.left - 10) + '" y="' + (y + 4).toFixed(1) +
        '" fill="#99aaba" text-anchor="end" font-size="11">' +
        escapeHtml(Engine.formatShortCurrency(val)) + '</text>'
      );
    }).join('');

    var legend = [
      { label: 'Salary', color: incomeColors[0] },
      { label: 'Rental', color: incomeColors[1] },
      { label: 'Pension/SS/UBI', color: incomeColors[2] },
      { label: 'Investments', color: incomeColors[3] },
      { label: 'Retirement wd', color: incomeColors[4] },
      { label: 'Expenses', color: '#f43f5e' },
    ];

    return (
      '<div class="income-expense-chart">' +
      '<div class="chart-header">' +
      '<div><h3>Income vs. expenses</h3>' +
      '<p>Stacked annual income sources alongside total outflows (' +
      escapeHtml(Engine.scenarioDefinitions().find(function (s) { return s.key === state.selectedScenario; }).label) +
      ' scenario).</p></div>' +
      renderXModeToggle() +
      '</div>' +
      '<div class="chart-legend">' +
      legend.map(function (item) {
        return '<span class="legend-chip"><span class="legend-chip__swatch" style="background:' +
          item.color + '"></span>' + escapeHtml(item.label) + '</span>';
      }).join('') +
      '</div>' +
      '<svg class="ie-chart-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Income versus expenses by year">' +
      gridLines + bars + xLabels +
      // Tooltip elements (hidden until hover).
      '<line class="ie-cursor-line" x1="0" x2="0" y1="' +
      pad.top + '" y2="' + (height - pad.bottom) +
      '" stroke="rgba(255,255,255,0.35)" stroke-width="1" display="none"></line>' +
      '<g class="ie-tooltip-group" display="none">' +
      '<rect class="ie-tooltip-bg" x="0" y="0" width="200" height="130" rx="8" fill="rgba(8,17,28,0.92)" stroke="rgba(183,207,227,0.2)"></rect>' +
      '<text class="ie-tt-year" x="10" y="18" fill="#ebf2f7" font-size="13" font-weight="700"></text>' +
      '<text class="ie-tt-l0" x="10" y="36" fill="#99aaba" font-size="12"></text>' +
      '<text class="ie-tt-l1" x="10" y="52" fill="#99aaba" font-size="12"></text>' +
      '<text class="ie-tt-l2" x="10" y="68" fill="#99aaba" font-size="12"></text>' +
      '<text class="ie-tt-l3" x="10" y="84" fill="#99aaba" font-size="12"></text>' +
      '<text class="ie-tt-l4" x="10" y="100" fill="#99aaba" font-size="12"></text>' +
      '<text class="ie-tt-l5" x="10" y="118" fill="#99aaba" font-size="12"></text>' +
      '</g>' +
      // Invisible overlay for mouse events.
      '<rect class="ie-chart-overlay" x="' + pad.left +
      '" y="' + pad.top +
      '" width="' + xSpan +
      '" height="' + ySpan +
      '" fill="transparent"></rect>' +
      '</svg>' +
      '</div>'
    );
  }

  function renderOverview(bundle, selectedScenario, unstressedBundle, validationMessages) {
    var summary = selectedScenario.summary;
    var stressDescriptions = Engine.describeStressTests(state.plan.stressTests);
    var activeStress = Engine.isStressActive(state.plan.stressTests);
    var stressDelta = '';

    if (activeStress && unstressedBundle) {
      var unstressedSummary = unstressedBundle.scenarios[state.selectedScenario].summary;
      var delta = summary.horizonNetWorth - unstressedSummary.horizonNetWorth;
      stressDelta =
        '<div class="card">' +
        '<div class="card__label">Stress impact</div>' +
        '<p class="card__value ' +
        (delta >= 0 ? 'card__accent' : 'card__accent--rose') +
        '">' +
        escapeHtml(Engine.formatCurrency(delta)) +
        '</p>' +
        '<div class="card__foot">Change to ' +
        escapeHtml(bundle.scenarios[state.selectedScenario].label) +
        ' horizon net worth versus no active stress tests.</div>' +
        '</div>';
    }

    return (
      '<section class="section">' +
      renderMessages(validationMessages.concat(state.transientMessages)) +
      '<div class="panel panel--padded">' +
      '<div class="section__head">' +
      '<div>' +
      '<h2>Overview</h2>' +
      '<p>Use the three scenarios for long-run averages. Use stress tests for event-driven shocks like crashes, inflation spikes, or benefit cuts.</p>' +
      '</div>' +
      '<div class="toolbar__group">' +
      Engine.scenarioDefinitions()
        .map(function (definition) {
          return (
            '<button type="button" class="button button--small ' +
            (definition.key === state.selectedScenario ? 'button--primary' : 'button--ghost') +
            '" data-action="select-scenario" data-scenario="' +
            definition.key +
            '">' +
            escapeHtml(definition.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="stat-grid">' +
      '<article class="card">' +
      '<div class="card__label">Current net worth</div>' +
      '<p class="card__value card__accent">' +
      escapeHtml(Engine.formatCurrency(summary.currentNetWorth)) +
      '</p>' +
      '<div class="card__foot">Today: cash + retirement accounts + property equity.</div>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">Net worth at household retirement</div>' +
      '<p class="card__value card__accent--blue">' +
      escapeHtml(Engine.formatCurrency(summary.retirementNetWorth)) +
      '</p>' +
      '<div class="card__foot">Calendar year ' +
      escapeHtml(String(summary.householdRetirementYear)) +
      '</div>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">Net worth at plan horizon</div>' +
      '<p class="card__value card__accent--amber">' +
      escapeHtml(Engine.formatCurrency(summary.horizonNetWorth)) +
      '</p>' +
      '<div class="card__foot">Calendar year ' +
      escapeHtml(String(summary.horizonYear)) +
      '</div>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">First negative liquid year</div>' +
      '<p class="card__value ' +
      (summary.firstDeficitYear ? 'card__accent--rose' : 'card__accent') +
      '">' +
      escapeHtml(summary.firstDeficitYear ? String(summary.firstDeficitYear) : 'None') +
      '</p>' +
      '<div class="card__foot">' +
      escapeHtml(summary.firstDeficitAgeLabel || 'Liquid assets stay non-negative through the current plan horizon.') +
      '</div>' +
      '</article>' +
      stressDelta +
      '</div>' +
      '<div class="panel chart-card">' +
      '<div class="chart-header">' +
      '<div>' +
      '<h3>Scenario comparison</h3>' +
      '<p>Net worth and liquid assets with any active stress tests applied.</p>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap">' +
      (stressDescriptions.length
        ? stressDescriptions
            .map(function (description) {
              return '<span class="badge badge--rose">' + escapeHtml(description) + '</span>';
            })
            .join('')
        : '<span class="badge">No stress</span>') +
      renderXModeToggle() +
      '</div>' +
      '</div>' +
      renderScenarioCards(bundle) +
      renderChart(bundle) +
      '</div>' +
      '<div class="panel chart-card">' +
      renderIncomeExpenseChart(selectedScenario.projection) +
      '</div>' +
      '<article class="panel panel--padded">' +
      '<div class="section__head">' +
      '<div>' +
      '<h3>Stress presets</h3>' +
      '<p>Quick ways to layer shocks on top of your scenarios. Fine-tune them in Edit Inputs.</p>' +
      '</div>' +
      '</div>' +
      '<div class="pill-row">' +
      Engine.stressPresetDefinitions()
        .map(function (preset) {
          return (
            '<button type="button" class="button button--small" data-action="apply-stress-preset" data-preset="' +
            preset.key +
            '">' +
            escapeHtml(preset.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</article>' +
      '<details class="details-block">' +
      '<summary>How this model works</summary>' +
      '<div class="details-block__body">' +
      '<div><strong>Scenarios</strong> — Optimistic, Base, and Pessimistic control average annual investment returns.</div>' +
      '<div><strong>Stress tests</strong> — Social Security cuts, market crashes, and inflation spikes are overlays because their timing matters more than their long-run average.</div>' +
      '<div><strong>Tax model</strong> — Retirement accounts are tax-free (Roth-style). Property sale gains use a separate capital gains rate. Pension and UBI COLA is capped at 3%.</div>' +
      '<div><strong>RMDs</strong> — Required minimum distributions are enforced at age 73 using IRS Uniform Lifetime Table periods, even when cash flow is positive.</div>' +
      '</div>' +
      '</details>' +
      '</section>'
    );
  }

  function renderSnapshot(projection) {
    var snapshotYear = getSnapshotYear(projection);
    var snapshot = projection.find(function (row) {
      return row.year === snapshotYear;
    }) || projection[0];
    var maxYear = projection[projection.length - 1].year;

    var inflows = [
      { label: 'Salary', value: snapshot.salaryIncome },
      { label: 'Rental income', value: snapshot.rentalIncome },
      { label: 'Pension', value: snapshot.pensionIncome },
      { label: 'UBI', value: snapshot.ubiIncome },
      { label: 'Social Security', value: snapshot.socialSecurityIncome },
      { label: 'Liquid investment return', value: snapshot.liquidInvestmentIncome },
      { label: 'Retirement withdrawals', value: snapshot.retirementWithdrawal },
      { label: 'Property sale proceeds', value: snapshot.propertySaleProceeds },
      { label: 'Life event income', value: snapshot.lifeEventIncome },
    ].filter(function (item) {
      return item.value > 0;
    });

    var outflows = [
      { label: 'Income taxes', value: snapshot.ordinaryTaxes },
      { label: 'Capital gains taxes', value: snapshot.capitalGainsTaxes },
      { label: 'Living expenses', value: snapshot.livingExpenses },
      { label: 'Mortgage payments', value: snapshot.mortgagePayments },
      { label: 'Retirement contributions', value: snapshot.retirementContributionTotal },
      { label: 'Charitable giving', value: snapshot.charitableDonation },
      { label: 'Life event expense', value: snapshot.lifeEventExpense },
    ].filter(function (item) {
      return item.value > 0;
    });

    var assets = [
      { label: 'Liquid assets', value: snapshot.endingLiquidAssets },
      { label: 'Retirement accounts', value: snapshot.totalRetirementBalance },
      { label: 'Property equity', value: snapshot.totalPropertyEquity },
    ].filter(function (item) {
      return item.value !== 0;
    });

    return (
      '<section class="section">' +
      '<div class="panel panel--padded">' +
      '<div class="section__head">' +
      '<div>' +
      '<h2>Snapshot</h2>' +
      '<p>Year-end totals for a single calendar year under the selected scenario.</p>' +
      '</div>' +
      '<div class="toolbar__group">' +
      '<label class="field" style="min-width:150px">' +
      '<span class="field__label">Year</span>' +
      '<input type="number" data-path="__snapshotYear" data-type="integer" data-ignore-plan="true" min="' +
      Engine.CURRENT_YEAR +
      '" max="' +
      maxYear +
      '" value="' +
      snapshotYear +
      '">' +
      '</label>' +
      '</div>' +
      '</div>' +
      '<input type="range" min="' +
      Engine.CURRENT_YEAR +
      '" max="' +
      maxYear +
      '" value="' +
      snapshotYear +
      '" data-path="__snapshotYear" data-type="integer" data-ignore-plan="true">' +
      '<div class="footnote">Scenario: ' +
      escapeHtml(Engine.scenarioDefinitions().find(function (scenario) { return scenario.key === state.selectedScenario; }).label) +
      '. Ages shown reflect the person during that calendar year.' +
      (snapshot.expenseChangeAge !== null
        ? ' The expense step-change is tied to Person 1 age ' +
          escapeHtml(String(snapshot.expenseChangeAge)) +
          '.'
        : '') +
      '</div>' +
      '</div>' +
      '<div class="summary-grid">' +
      '<article class="card">' +
      '<div class="card__label">Gross inflows</div>' +
      '<p class="card__value card__accent">' +
      escapeHtml(Engine.formatCurrency(snapshot.grossInflows)) +
      '</p>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">Total outflows</div>' +
      '<p class="card__value card__accent--rose">' +
      escapeHtml(Engine.formatCurrency(snapshot.totalOutflows)) +
      '</p>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">Net cash flow</div>' +
      '<p class="card__value ' +
      (snapshot.netCashFlow >= 0 ? 'card__accent--blue' : 'card__accent--rose') +
      '">' +
      escapeHtml(Engine.formatCurrency(snapshot.netCashFlow)) +
      '</p>' +
      '</article>' +
      '<article class="card">' +
      '<div class="card__label">Ending net worth</div>' +
      '<p class="card__value card__accent--amber">' +
      escapeHtml(Engine.formatCurrency(snapshot.totalNetWorth)) +
      '</p>' +
      '</article>' +
      '</div>' +
      '<div class="grid-3">' +
      '<article class="panel snapshot-card">' +
      '<div class="section__head"><div><h3>Inflows</h3><p>All gross annual inflows.</p></div></div>' +
      renderBreakdown(inflows, 'No inflows in this year.', false) +
      '</article>' +
      '<article class="panel snapshot-card">' +
      '<div class="section__head"><div><h3>Outflows</h3><p>Taxes, spending, savings, and one-time outflows.</p></div></div>' +
      renderBreakdown(outflows, 'No outflows in this year.', true) +
      '</article>' +
      '<article class="panel snapshot-card">' +
      '<div class="section__head"><div><h3>Assets</h3><p>Year-end balances after this year&#39;s cash flow.</p></div></div>' +
      renderBreakdown(assets, 'No assets recorded.', false) +
      '</article>' +
      '</div>' +
      '<div class="grid-2">' +
      '<article class="panel snapshot-card">' +
      '<div class="section__head"><div><h3>People</h3><p>Current year detail for each included person.</p></div></div>' +
      '<div class="property-list">' +
      snapshot.personStates
        .map(function (personState) {
          return (
            '<div class="property-row">' +
            '<div class="property-row__top"><strong>' +
            escapeHtml(personState.name) +
            '</strong><span>' +
            escapeHtml(personState.alive ? 'Age ' + personState.age : 'Not modeled after target end age') +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">Salary</span><span>' +
            escapeHtml(Engine.formatCurrency(personState.salary)) +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">Pension</span><span>' +
            escapeHtml(Engine.formatCurrency(personState.pensionIncome)) +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">UBI</span><span>' +
            escapeHtml(Engine.formatCurrency(personState.ubiIncome)) +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">Social Security</span><span>' +
            escapeHtml(Engine.formatCurrency(personState.socialSecurityIncome)) +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">Retirement balance</span><span>' +
            escapeHtml(Engine.formatCurrency(personState.retirementBalance)) +
            '</span></div>' +
            '<div class="split-row"><span class="value-muted">Contribution / withdrawal</span><span>' +
            escapeHtml(
              Engine.formatCurrency(personState.retirementContribution - personState.retirementWithdrawal)
            ) +
            '</span></div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>' +
      '</article>' +
      '<article class="panel snapshot-card">' +
      '<div class="section__head"><div><h3>Properties</h3><p>Property equity now includes mortgage debt.</p></div></div>' +
      '<div class="property-list">' +
      (snapshot.propertySnapshots.length
        ? snapshot.propertySnapshots
            .map(function (property) {
              return (
                '<div class="property-row">' +
                '<div class="property-row__top"><strong>' +
                escapeHtml(property.name) +
                '</strong><span>' +
                escapeHtml(property.sold ? (property.soldThisYear ? 'Sold this year' : 'Sold previously') : Engine.formatCurrency(property.endValue)) +
                '</span></div>' +
                (property.sold
                  ? '<div class="split-row"><span class="value-muted">Sale proceeds</span><span>' +
                    escapeHtml(Engine.formatCurrency(property.saleProceeds)) +
                    '</span></div>'
                  : '<div class="split-row"><span class="value-muted">Remaining mortgage</span><span>' +
                    escapeHtml(Engine.formatCurrency(property.remainingMortgage)) +
                    '</span></div>' +
                    '<div class="split-row"><span class="value-muted">Equity</span><span>' +
                    escapeHtml(Engine.formatCurrency(property.equity)) +
                    '</span></div>') +
                (property.annualRentalIncome > 0
                  ? '<div class="split-row"><span class="value-muted">Rental income</span><span>' +
                    escapeHtml(Engine.formatCurrency(property.annualRentalIncome)) +
                    '</span></div>'
                  : '') +
                '</div>'
              );
            })
            .join('')
        : '<div class="empty-state">No properties in this plan.</div>') +
      '</div>' +
      '</article>' +
      '</div>' +
      '</section>'
    );
  }

  function renderDataTable(projection) {
    var visibleRows = state.showAllRows ? projection : projection.slice(0, 20);
    return (
      '<section class="section">' +
      '<div class="panel data-card">' +
      '<div class="toolbar">' +
      '<div>' +
      '<h2>Data Table</h2>' +
      '<p class="muted">Year-by-year cash flow and balance detail for the selected scenario.</p>' +
      '</div>' +
      '<div class="toolbar__group">' +
      '<button type="button" class="button button--small" data-action="toggle-rows">' +
      escapeHtml(state.showAllRows ? 'Show fewer rows' : 'Show all ' + projection.length + ' rows') +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="table-wrap">' +
      '<table>' +
      '<thead>' +
      '<tr>' +
      '<th>Year</th>' +
      '<th>Ages</th>' +
      '<th class="align-right">Inflows</th>' +
      '<th class="align-right">Taxes</th>' +
      '<th class="align-right">Core outflows</th>' +
      '<th class="align-right">Ret. wd</th>' +
      '<th class="align-right">Net cash</th>' +
      '<th class="align-right">Liquid</th>' +
      '<th class="align-right">Retirement</th>' +
      '<th class="align-right">Property equity</th>' +
      '<th class="align-right">Net worth</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      visibleRows
        .map(function (row) {
          var ageLabel = row.personStates
            .map(function (personState) {
              return personState.alive ? personState.age : '—';
            })
            .join(' / ');
          return (
            '<tr class="' +
            (row.endingLiquidAssets < 0 ? 'row-negative' : '') +
            '">' +
            '<td>' +
            escapeHtml(String(row.year)) +
            '</td>' +
            '<td>' +
            escapeHtml(ageLabel) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.grossInflows)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.taxes)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.totalOutflows - row.taxes)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.retirementWithdrawal)) +
            '</td>' +
            '<td class="align-right ' +
            (row.netCashFlow >= 0 ? 'value-positive' : 'value-negative') +
            '">' +
            escapeHtml(Engine.formatCurrency(row.netCashFlow)) +
            '</td>' +
            '<td class="align-right ' +
            (row.endingLiquidAssets >= 0 ? '' : 'value-negative') +
            '">' +
            escapeHtml(Engine.formatCurrency(row.endingLiquidAssets)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.totalRetirementBalance)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.totalPropertyEquity)) +
            '</td>' +
            '<td class="align-right">' +
            escapeHtml(Engine.formatCurrency(row.totalNetWorth)) +
            '</td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody>' +
      '</table>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function renderPersonForm(person, index) {
    return (
      '<section class="subpanel stack">' +
      '<div class="subpanel__header">' +
      '<div><h4>' +
      escapeHtml(person.name) +
      '</h4><p class="muted">Person ' +
      (index + 1) +
      '</p></div>' +
      '</div>' +
      '<div class="form-grid">' +
      textField('Name', 'people.' + index + '.name', person.name) +
      numberField('Current age', 'people.' + index + '.currentAge', person.currentAge, { dataType: 'integer', min: 18, max: 120 }) +
      numberField('Retirement age', 'people.' + index + '.retirementAge', person.retirementAge, { dataType: 'integer', min: 18, max: 120 }) +
      numberField('Target end age', 'people.' + index + '.targetEndAge', person.targetEndAge, { dataType: 'integer', min: 18, max: 130 }) +
      numberField('Current salary', 'people.' + index + '.currentSalary', person.currentSalary, { min: 0, step: 1000, hint: 'Gross annual salary before tax.' }) +
      numberField('Annual salary growth', 'people.' + index + '.salaryGrowthRate', person.salaryGrowthRate, { dataType: 'percent', step: 0.1 }) +
      numberField('Part-time start age', 'people.' + index + '.partTimeAge', person.partTimeAge, { dataType: 'integer', allowEmpty: true, min: person.currentAge, max: person.retirementAge, hint: 'Leave blank to skip part-time work.' }) +
      numberField('Part-time ratio', 'people.' + index + '.partTimeRatio', person.partTimeRatio, { dataType: 'percent', min: 0, max: 100, step: 1, hint: 'Percent of full salary once part-time begins.' }) +
      numberField('Retirement balance today', 'people.' + index + '.retirementBalanceToday', person.retirementBalanceToday, { min: 0, step: 1000, hint: 'Current 401(k), IRA, and similar balances today. All retirement accounts are modeled as tax-free (Roth-style): contributions are after-tax, withdrawals are untaxed.' }) +
      selectField('Contribution type', 'people.' + index + '.retirementContributionType', person.retirementContributionType, [
        { value: 'percent', label: 'Percent of salary' },
        { value: 'amount', label: 'Fixed annual amount' },
      ]) +
      numberField('Retirement contribution', 'people.' + index + '.retirementContributionAmount', person.retirementContributionAmount, {
        dataType: person.retirementContributionType === 'percent' ? 'percent' : 'number',
        min: 0,
        step: person.retirementContributionType === 'percent' ? 0.1 : 1000,
      }) +
      numberField('Pension (monthly)', 'people.' + index + '.pensionMonthly', person.pensionMonthly, { min: 0, step: 100 }) +
      numberField('Pension start age', 'people.' + index + '.pensionStartAge', person.pensionStartAge, { dataType: 'integer', min: 18, max: 120 }) +
      checkboxField('Pension has COLA', 'people.' + index + '.pensionHasCOLA', person.pensionHasCOLA, 'If enabled, pension payments rise with inflation (COLA capped at 3%).') +
      numberField('UBI (monthly)', 'people.' + index + '.ubiMonthly', person.ubiMonthly, { min: 0, step: 100, hint: 'Optional upside-case income. Tracks inflation, COLA capped at 3%.' }) +
      numberField('UBI start age', 'people.' + index + '.ubiStartAge', person.ubiStartAge, { dataType: 'integer', min: 18, max: 120 }) +
      numberField('Social Security (monthly)', 'people.' + index + '.socialSecurityMonthly', person.socialSecurityMonthly, { min: 0, step: 100 }) +
      numberField('Social Security start age', 'people.' + index + '.socialSecurityStartAge', person.socialSecurityStartAge, { dataType: 'integer', min: 18, max: 120 }) +
      '</div>' +
      '</section>'
    );
  }

  function renderPropertyForm(property, index) {
    return (
      '<section class="subpanel stack">' +
      '<div class="subpanel__header">' +
      '<div><h4>' +
      escapeHtml(property.name || 'Property ' + (index + 1)) +
      '</h4><p class="muted">Property ' +
      (index + 1) +
      '</p></div>' +
      '<button type="button" class="button button--small button--danger" data-action="remove-property" data-index="' +
      index +
      '">Remove</button>' +
      '</div>' +
      '<div class="form-grid">' +
      textField('Property name', 'properties.' + index + '.name', property.name) +
      numberField('Current value', 'properties.' + index + '.currentValue', property.currentValue, { min: 0, step: 1000 }) +
      numberField('Annual appreciation', 'properties.' + index + '.appreciationRate', property.appreciationRate, { dataType: 'percent', step: 0.1 }) +
      numberField('Monthly rental income', 'properties.' + index + '.monthlyRentalIncome', property.monthlyRentalIncome, { min: 0, step: 100 }) +
      numberField('Rental end year', 'properties.' + index + '.rentalEndYear', property.rentalEndYear, { dataType: 'integer', allowEmpty: true, min: Engine.CURRENT_YEAR, step: 1 }) +
      numberField('Mortgage balance today', 'properties.' + index + '.mortgageBalanceToday', property.mortgageBalanceToday, { min: 0, step: 1000, hint: 'Used to calculate equity and sale proceeds.' }) +
      numberField('Monthly mortgage', 'properties.' + index + '.monthlyMortgage', property.monthlyMortgage, { min: 0, step: 100 }) +
      numberField('Mortgage payoff year', 'properties.' + index + '.mortgageEndYear', property.mortgageEndYear, { dataType: 'integer', allowEmpty: true, min: Engine.CURRENT_YEAR, step: 1 }) +
      numberField('Sell year', 'properties.' + index + '.sellAtYear', property.sellAtYear, { dataType: 'integer', allowEmpty: true, min: Engine.CURRENT_YEAR, step: 1, hint: 'Leave blank to keep the property indefinitely.' }) +
      '</div>' +
      '</section>'
    );
  }

  function renderLifeEventForm(event, index) {
    return (
      '<section class="subpanel stack--tight">' +
      '<div class="subpanel__header">' +
      '<div><h4>' +
      escapeHtml(event.description || 'Life event') +
      '</h4><p class="muted">Year ' +
      event.year +
      '</p></div>' +
      '<button type="button" class="button button--small button--danger" data-action="remove-life-event" data-index="' +
      index +
      '">Remove</button>' +
      '</div>' +
      '<div class="form-grid">' +
      selectField('Type', 'lifeEvents.' + index + '.type', event.type, [
        { value: 'expense', label: 'Expense' },
        { value: 'income', label: 'Income' },
      ]) +
      textField('Description', 'lifeEvents.' + index + '.description', event.description) +
      numberField('Amount', 'lifeEvents.' + index + '.amount', event.amount, { min: 0, step: 1000 }) +
      numberField('Year', 'lifeEvents.' + index + '.year', event.year, { dataType: 'integer', min: Engine.CURRENT_YEAR, step: 1 }) +
      '</div>' +
      '</section>'
    );
  }

  function renderInputs(plan, validationMessages) {
    var includedPeople = plan.people.slice(0, plan.includePerson2 ? 2 : 1);
    return (
      '<section class="section">' +
      renderMessages(validationMessages.concat(state.transientMessages)) +
      '<div class="grid-2">' +
      '<article class="panel form-card stack">' +
      '<div class="section__head"><div><h2>People</h2><p>All retirement balances are current balances today.</p></div></div>' +
      checkboxField('Include a second person', 'includePerson2', plan.includePerson2, 'Enable spouse or partner planning when needed.') +
      includedPeople.map(function (person, index) { return renderPersonForm(person, index); }).join('') +
      '</article>' +
      '<article class="panel form-card stack">' +
      '<div class="section__head"><div><h2>Core assumptions</h2><p>These settings drive every scenario and table in the app.</p></div></div>' +
      '<div class="form-grid">' +
      numberField('Current liquid savings', 'assumptions.startingCashWorth', plan.assumptions.startingCashWorth, { min: 0, step: 1000 }) +
      numberField('Annual expenses today', 'assumptions.startingAnnualExpenses', plan.assumptions.startingAnnualExpenses, { min: 0, step: 1000 }) +
      numberField('Effective tax rate', 'assumptions.taxRate', plan.assumptions.taxRate, { dataType: 'percent', min: 0, max: 100, step: 0.1, hint: 'Applied to ordinary income. Retirement withdrawals are tax-free.' }) +
      numberField('Capital gains tax rate', 'assumptions.capitalGainsTaxRate', plan.assumptions.capitalGainsTaxRate, { dataType: 'percent', min: 0, max: 50, step: 0.1, hint: 'Applied to property sale gains only.' }) +
      numberField('Base inflation', 'assumptions.inflationRate', plan.assumptions.inflationRate, { dataType: 'percent', step: 0.1 }) +
      numberField('Expense change age (Person 1)', 'assumptions.expenseChangeAge', plan.assumptions.expenseChangeAge, { dataType: 'integer', allowEmpty: true, min: plan.people[0].currentAge, max: 130, step: 1, hint: 'Use this for kids leaving home, downsizing, or assisted living. Leave blank to disable.' }) +
      numberField('Expense change percent', 'assumptions.expenseChangePercent', plan.assumptions.expenseChangePercent, { dataType: 'percent', min: -100, max: 500, step: 0.1, hint: 'Permanent one-time step change. Negative decreases spending; positive increases it.' }) +
      numberField('Optimistic return', 'assumptions.investmentReturnOptimistic', plan.assumptions.investmentReturnOptimistic, { dataType: 'percent', step: 0.1 }) +
      numberField('Base return', 'assumptions.investmentReturnBase', plan.assumptions.investmentReturnBase, { dataType: 'percent', step: 0.1 }) +
      numberField('Pessimistic return', 'assumptions.investmentReturnPessimistic', plan.assumptions.investmentReturnPessimistic, { dataType: 'percent', step: 0.1 }) +
      checkboxField('Enable charitable giving', 'assumptions.charitableEnabled', plan.assumptions.charitableEnabled, 'Donations count as cash outflow and as a deduction in the simplified tax model.') +
      selectField('Charitable type', 'assumptions.charitableType', plan.assumptions.charitableType, [
        { value: 'amount', label: 'Fixed annual amount' },
        { value: 'percent', label: 'Percent of gross income' },
      ]) +
      numberField(
        plan.assumptions.charitableType === 'percent' ? 'Charitable percent' : 'Charitable amount',
        plan.assumptions.charitableType === 'percent' ? 'assumptions.charitablePercent' : 'assumptions.charitableAmount',
        plan.assumptions.charitableType === 'percent'
          ? plan.assumptions.charitablePercent
          : plan.assumptions.charitableAmount,
        {
          dataType: plan.assumptions.charitableType === 'percent' ? 'percent' : 'number',
          min: 0,
          step: plan.assumptions.charitableType === 'percent' ? 0.1 : 100,
        }
      ) +
      '</div>' +
      '</article>' +
      '</div>' +
      '<article class="panel form-card stack">' +
      '<div class="section__head">' +
      '<div><h2>Properties</h2><p>Property equity now subtracts mortgage debt instead of showing raw market value.</p></div>' +
      '<button type="button" class="button button--small" data-action="add-property">Add property</button>' +
      '</div>' +
      (plan.properties.length
        ? plan.properties.map(function (property, index) { return renderPropertyForm(property, index); }).join('')
        : '<div class="empty-state">No properties in this plan yet.</div>') +
      '</article>' +
      '<article class="panel form-card stack">' +
      '<div class="section__head">' +
      '<div><h2>Life events</h2><p>Use these for one-time expenses or windfalls. Income events are treated as after-tax cash inflows.</p></div>' +
      '<button type="button" class="button button--small" data-action="add-life-event">Add life event</button>' +
      '</div>' +
      (plan.lifeEvents.length
        ? plan.lifeEvents.map(function (event, index) { return renderLifeEventForm(event, index); }).join('')
        : '<div class="empty-state">No life events added.</div>') +
      '</article>' +
      '<article class="panel form-card stack">' +
      '<div class="section__head"><div><h2>Stress tests</h2><p>Keep scenarios for average returns. Use these when timing matters.</p></div></div>' +
      '<div class="form-grid">' +
      checkboxField('Reduce Social Security', 'stressTests.socialSecurityReductionEnabled', plan.stressTests.socialSecurityReductionEnabled, 'A 100% reduction models benefits disappearing entirely.') +
      numberField('Social Security reduction', 'stressTests.socialSecurityReductionPercent', plan.stressTests.socialSecurityReductionPercent, { dataType: 'percent', min: 0, max: 100, step: 1 }) +
      numberField('SS reduction start year', 'stressTests.socialSecurityReductionYear', plan.stressTests.socialSecurityReductionYear, { dataType: 'integer', min: Engine.CURRENT_YEAR, step: 1 }) +
      checkboxField('Enable market crash', 'stressTests.marketCrashEnabled', plan.stressTests.marketCrashEnabled, 'Applies one-time drops at the start of the selected year.') +
      numberField('Crash year', 'stressTests.marketCrashYear', plan.stressTests.marketCrashYear, { dataType: 'integer', min: Engine.CURRENT_YEAR, step: 1 }) +
      numberField('Liquid asset drop', 'stressTests.marketCrashLiquidDropPercent', plan.stressTests.marketCrashLiquidDropPercent, { dataType: 'percent', min: 0, max: 100, step: 1 }) +
      numberField('Retirement asset drop', 'stressTests.marketCrashRetirementDropPercent', plan.stressTests.marketCrashRetirementDropPercent, { dataType: 'percent', min: 0, max: 100, step: 1 }) +
      numberField('Property drop', 'stressTests.marketCrashPropertyDropPercent', plan.stressTests.marketCrashPropertyDropPercent, { dataType: 'percent', min: 0, max: 100, step: 1 }) +
      checkboxField('Enable inflation spike', 'stressTests.inflationSpikeEnabled', plan.stressTests.inflationSpikeEnabled, 'Overrides the base inflation rate for a short period.') +
      numberField('Spike start year', 'stressTests.inflationSpikeStartYear', plan.stressTests.inflationSpikeStartYear, { dataType: 'integer', min: Engine.CURRENT_YEAR, step: 1 }) +
      numberField('Spike duration', 'stressTests.inflationSpikeDurationYears', plan.stressTests.inflationSpikeDurationYears, { dataType: 'integer', min: 1, max: 30, step: 1 }) +
      numberField('Spike inflation rate', 'stressTests.inflationSpikeRate', plan.stressTests.inflationSpikeRate, { dataType: 'percent', min: -5, max: 30, step: 0.1 }) +
      '</div>' +
      '<div class="pill-row">' +
      Engine.stressPresetDefinitions()
        .map(function (preset) {
          return (
            '<button type="button" class="button button--small" data-action="apply-stress-preset" data-preset="' +
            preset.key +
            '">' +
            escapeHtml(preset.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '</article>' +
      '<article class="panel form-card stack">' +
      '<div class="section__head"><div><h2>Plan management</h2><p>Everything stays in your browser. JSON save/load remains available for portable backups.</p></div></div>' +
      '<div class="toolbar__group">' +
      '<button type="button" class="button button--primary" data-action="download-json">Save JSON</button>' +
      '<button type="button" class="button" data-action="load-json">Load JSON</button>' +
      '<button type="button" class="button" data-action="export-csv">Export CSV</button>' +
      '<button type="button" class="button" data-action="print-report">Print report</button>' +
      '<button type="button" class="button button--danger" data-action="reset-plan">Reset plan</button>' +
      '</div>' +
      '<div class="footnote">The app also keeps an automatic browser draft. Reset clears the current draft from this browser.</div>' +
      '</article>' +
      '</section>'
    );
  }

  function generateReportHtml(bundle, projection) {
    var scenario = bundle.scenarios[state.selectedScenario];
    var summary = scenario.summary;
    var notes = Engine.describeStressTests(state.plan.stressTests);
    return (
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Retirement plan report</title>' +
      '<style>' +
      'body{font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#102338;line-height:1.45;max-width:1100px;margin:0 auto}' +
      'h1,h2,h3{margin:0 0 10px} h1{font-size:30px} h2{margin-top:26px;font-size:18px;border-bottom:1px solid #d7e2ec;padding-bottom:6px}' +
      '.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.card{background:#f5f8fb;border:1px solid #d7e2ec;border-radius:12px;padding:14px}' +
      '.label{font-size:12px;color:#6f8398;text-transform:uppercase;letter-spacing:.05em}.value{font-size:24px;font-weight:700;margin-top:6px}' +
      'table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px;border-bottom:1px solid #d7e2ec;text-align:left;font-size:13px}th{background:#f5f8fb}' +
      '.small{color:#6f8398;font-size:13px}.badge{display:inline-block;background:#eef8f1;border:1px solid #b7e4c1;border-radius:999px;padding:4px 8px;margin-right:8px;font-size:12px}' +
      '</style></head><body>' +
      '<h1>Retirement Planner Report</h1>' +
      '<p class="small">Generated on ' +
      escapeHtml(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })) +
      ' for the ' +
      escapeHtml(scenario.label) +
      ' scenario.</p>' +
      '<div class="grid">' +
      '<div class="card"><div class="label">Current net worth</div><div class="value">' +
      escapeHtml(Engine.formatCurrency(summary.currentNetWorth)) +
      '</div></div>' +
      '<div class="card"><div class="label">Household retirement</div><div class="value">' +
      escapeHtml(Engine.formatCurrency(summary.retirementNetWorth)) +
      '</div><div class="small">Year ' +
      escapeHtml(String(summary.householdRetirementYear)) +
      '</div></div>' +
      '<div class="card"><div class="label">Plan horizon</div><div class="value">' +
      escapeHtml(Engine.formatCurrency(summary.horizonNetWorth)) +
      '</div><div class="small">Year ' +
      escapeHtml(String(summary.horizonYear)) +
      '</div></div>' +
      '<div class="card"><div class="label">First negative liquid year</div><div class="value">' +
      escapeHtml(summary.firstDeficitYear ? String(summary.firstDeficitYear) : 'None') +
      '</div></div>' +
      '</div>' +
      '<h2>Stress tests</h2>' +
      (notes.length
        ? notes.map(function (note) { return '<span class="badge">' + escapeHtml(note) + '</span>'; }).join('')
        : '<p class="small">No active stress tests.</p>') +
      '<h2>Projection excerpt</h2>' +
      '<table><thead><tr><th>Year</th><th>Ages</th><th>Inflows</th><th>Outflows</th><th>Net cash</th><th>Liquid</th><th>Retirement</th><th>Property equity</th><th>Net worth</th></tr></thead><tbody>' +
      projection
        .slice(0, 25)
        .map(function (row) {
          return (
            '<tr><td>' +
            row.year +
            '</td><td>' +
            escapeHtml(
              row.personStates
                .map(function (personState) {
                  return personState.alive ? personState.age : '—';
                })
                .join(' / ')
            ) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.grossInflows)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.totalOutflows)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.netCashFlow)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.endingLiquidAssets)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.totalRetirementBalance)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.totalPropertyEquity)) +
            '</td><td>' +
            escapeHtml(Engine.formatCurrency(row.totalNetWorth)) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>' +
      '<p class="small" style="margin-top:26px">This planner is a simplified decision-support tool, not financial advice.</p>' +
      '</body></html>'
    );
  }

  function downloadJson() {
    var data = JSON.stringify(state.plan, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    triggerDownload(blob, 'retirement-plan-' + new Date().toISOString().slice(0, 10) + '.json');
  }

  function exportCsv(projection) {
    var headers = [
      'Year',
      'Ages',
      'Gross inflows',
      'Taxes',
      'Core outflows',
      'Retirement withdrawals',
      'Net cash flow',
      'Ending liquid assets',
      'Retirement balance',
      'Property equity',
      'Net worth',
    ];
    var rows = projection.map(function (row) {
      return [
        row.year,
        row.personStates
          .map(function (personState) {
            return personState.alive ? personState.age : '—';
          })
          .join(' / '),
        row.grossInflows,
        row.taxes,
        row.totalOutflows - row.taxes,
        row.retirementWithdrawal,
        row.netCashFlow,
        row.endingLiquidAssets,
        row.totalRetirementBalance,
        row.totalPropertyEquity,
        row.totalNetWorth,
      ];
    });
    var csv = [headers]
      .concat(rows)
      .map(function (row) {
        return row
          .map(function (cell) {
            var text = String(cell);
            return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
          })
          .join(',');
      })
      .join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    triggerDownload(
      blob,
      'retirement-projection-' + state.selectedScenario + '-' + new Date().toISOString().slice(0, 10) + '.csv'
    );
  }

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function printReport(bundle, projection) {
    var html = generateReportHtml(bundle, projection);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var reportWindow = window.open(url);

    if (!reportWindow) {
      URL.revokeObjectURL(url);
      state.transientMessages = [
        {
          level: 'warning',
          text: 'The report window was blocked by the browser.',
        },
      ];
      render();
      return;
    }

    // Give the browser time to render the HTML before triggering print.
    setTimeout(function () {
      try {
        reportWindow.focus();
        reportWindow.print();
      } catch (error) {
        // Window may have been closed by the user.
      }
      URL.revokeObjectURL(url);
    }, 400);
  }

  function handleClick(event) {
    var actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
      return;
    }

    var action = actionTarget.dataset.action;

    if (action === 'set-tab') {
      state.activeTab = actionTarget.dataset.tab;
      render();
      return;
    }

    if (action === 'select-scenario') {
      state.selectedScenario = actionTarget.dataset.scenario;
      render();
      return;
    }

    if (action === 'toggle-rows') {
      state.showAllRows = !state.showAllRows;
      render();
      return;
    }

    if (action === 'set-chart-x-mode') {
      state.chartXMode = actionTarget.dataset.mode;
      render();
      return;
    }

    if (action === 'apply-stress-preset') {
      var preset = actionTarget.dataset.preset;
      if (preset === 'clear') {
        applyPlan(
          Object.assign(clone(state.plan), {
            stressTests: Engine.createDefaultStressTests(),
          }),
          [{ level: 'info', text: 'Stress tests cleared.' }]
        );
      } else {
        applyPlan(Engine.applyStressPreset(state.plan, preset), [
          { level: 'info', text: 'Applied stress preset: ' + actionTarget.textContent.trim() + '.' },
        ]);
      }
      return;
    }

    if (action === 'add-property') {
      var propertyPlan = clone(state.plan);
      propertyPlan.properties.push({
        id: Date.now(),
        name: 'Property ' + (propertyPlan.properties.length + 1),
        currentValue: 300000,
        appreciationRate: 0.02,
        monthlyRentalIncome: 0,
        rentalEndYear: null,
        mortgageBalanceToday: 0,
        monthlyMortgage: 0,
        mortgageEndYear: null,
        sellAtYear: null,
      });
      applyPlan(propertyPlan);
      return;
    }

    if (action === 'remove-property') {
      var removePropertyPlan = clone(state.plan);
      removePropertyPlan.properties.splice(Number(actionTarget.dataset.index), 1);
      applyPlan(removePropertyPlan);
      return;
    }

    if (action === 'add-life-event') {
      var eventPlan = clone(state.plan);
      eventPlan.lifeEvents.push({
        id: Date.now(),
        type: 'expense',
        description: 'New life event',
        amount: 10000,
        year: Engine.CURRENT_YEAR + 1,
      });
      applyPlan(eventPlan);
      return;
    }

    if (action === 'remove-life-event') {
      var removeEventPlan = clone(state.plan);
      removeEventPlan.lifeEvents.splice(Number(actionTarget.dataset.index), 1);
      applyPlan(removeEventPlan);
      return;
    }

    if (action === 'download-json') {
      downloadJson();
      return;
    }

    if (action === 'load-json') {
      var input = document.getElementById('plan-file-input');
      if (input) {
        input.value = '';
        input.click();
      }
      return;
    }

    if (action === 'export-csv') {
      var bundle = Engine.buildScenarioSet(state.plan);
      exportCsv(bundle.scenarios[state.selectedScenario].projection);
      return;
    }

    if (action === 'print-report') {
      var reportBundle = Engine.buildScenarioSet(state.plan);
      printReport(reportBundle, reportBundle.scenarios[state.selectedScenario].projection);
      return;
    }

    if (action === 'reset-plan') {
      if (!window.confirm('Reset the current plan and clear the browser draft?')) {
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      state.plan = Engine.migratePlan(Engine.createDefaultPlan()).plan;
      state.transientMessages = [{ level: 'info', text: 'Plan reset to defaults.' }];
      state.snapshotYear = Engine.CURRENT_YEAR;
      state.showAllRows = false;
      render();
      return;
    }
  }

  function commitInput(target) {
    var nextPlan = clone(state.plan);
    var value;
    var dataType = target.dataset.type;
    var allowEmpty = target.dataset.allowEmpty === 'true';

    if (dataType === 'boolean') {
      value = target.checked;
    } else if (dataType === 'integer') {
      value = target.value === '' && allowEmpty ? null : Math.round(Number(target.value) || 0);
    } else if (dataType === 'number') {
      value = target.value === '' && allowEmpty ? null : Number(target.value) || 0;
    } else if (dataType === 'percent') {
      value = target.value === '' && allowEmpty ? null : (Number(target.value) || 0) / 100;
    } else {
      value = target.value;
    }

    setPathValue(nextPlan, target.dataset.path, value);

    if (target.dataset.path === 'includePerson2' && !value) {
      state.selectedScenario = state.selectedScenario || 'base';
    }

    var focusId = target.id;
    applyPlan(nextPlan);

    // Restore focus to the field being edited after re-render.
    var restored = focusId && document.getElementById(focusId);
    if (restored) {
      restored.focus();
    }
  }

  function handleInput(event) {
    var target = event.target;

    if (target.id === 'plan-file-input' && target.files && target.files[0]) {
      var reader = new FileReader();
      reader.onload = function (readerEvent) {
        try {
          var loaded = JSON.parse(readerEvent.target.result);
          applyPlan(loaded, [{ level: 'info', text: 'Loaded plan from file.' }]);
        } catch (error) {
          state.transientMessages = [
            {
              level: 'error',
              text: 'Could not read that JSON file.',
            },
          ];
          render();
        }
      };
      reader.readAsText(target.files[0]);
      return;
    }

    if (!target.dataset.path) {
      return;
    }

    if (target.dataset.ignorePlan === 'true' && target.dataset.path === '__snapshotYear') {
      state.snapshotYear = Number(target.value) || Engine.CURRENT_YEAR;
      render();
      return;
    }

    // Debounce text and number keystrokes so users can finish editing
    // before the app re-renders. Checkboxes, selects, range sliders,
    // and blur/change events commit immediately.
    var shouldDebounce = event.type === 'input' &&
      (target.type === 'number' || target.type === 'text');

    clearTimeout(debounceTimer);

    if (shouldDebounce) {
      debounceTimer = setTimeout(function () {
        commitInput(target);
      }, DEBOUNCE_MS);
    } else {
      commitInput(target);
    }
  }

  function setupChartInteraction() {
    var overlay = document.querySelector('.chart-overlay');
    if (!overlay || !chartState.projections) {
      return;
    }

    var svg = overlay.closest('svg');
    var cursorLine = svg.querySelector('.chart-cursor-line');
    var tooltipGroup = svg.querySelector('.chart-tooltip-group');
    var tooltipBg = svg.querySelector('.chart-tooltip-bg');
    var tooltipYear = svg.querySelector('.chart-tooltip-year');
    var tooltipNw = svg.querySelector('.chart-tooltip-nw');
    var tooltipLiq = svg.querySelector('.chart-tooltip-liq');
    var tooltipRet = svg.querySelector('.chart-tooltip-ret');

    if (!cursorLine || !tooltipGroup) {
      return;
    }

    var scenarioIndex = Engine.SCENARIO_ORDER.indexOf(state.selectedScenario);
    if (scenarioIndex < 0) {
      scenarioIndex = 1;
    }

    overlay.addEventListener('mousemove', function (event) {
      var rect = svg.getBoundingClientRect();
      var scaleX = chartState.width / rect.width;
      var mouseX = (event.clientX - rect.left) * scaleX;
      var relX = mouseX - chartState.padding.left;
      var yearIndex = Math.round(relX / chartState.xSpan * Math.max(1, chartState.pointCount - 1));
      yearIndex = Math.max(0, Math.min(chartState.pointCount - 1, yearIndex));

      var row = chartState.projections[scenarioIndex][yearIndex];
      if (!row) {
        return;
      }

      var xPos = chartState.padding.left + (yearIndex / Math.max(1, chartState.pointCount - 1)) * chartState.xSpan;

      cursorLine.setAttribute('x1', xPos.toFixed(1));
      cursorLine.setAttribute('x2', xPos.toFixed(1));
      cursorLine.setAttribute('display', '');

      var ageLabel = row.personStates.map(function (ps) {
        return ps.alive ? ps.age : '—';
      }).join('/');

      tooltipYear.textContent = row.year + ' (age ' + ageLabel + ')';
      tooltipNw.textContent = 'Net worth: ' + Engine.formatCurrency(row.totalNetWorth);
      tooltipLiq.textContent = 'Liquid: ' + Engine.formatCurrency(row.endingLiquidAssets);
      tooltipRet.textContent = 'Retirement: ' + Engine.formatCurrency(row.totalRetirementBalance);

      var tooltipX = xPos + 14;
      if (tooltipX + 200 > chartState.width - chartState.padding.right) {
        tooltipX = xPos - 194;
      }
      var tooltipY = chartState.padding.top + 6;

      tooltipGroup.setAttribute('transform', 'translate(' + tooltipX.toFixed(1) + ',' + tooltipY.toFixed(1) + ')');
      tooltipGroup.setAttribute('display', '');
    });

    overlay.addEventListener('mouseout', function () {
      cursorLine.setAttribute('display', 'none');
      tooltipGroup.setAttribute('display', 'none');
    });
  }

  function setupIEChartInteraction() {
    var overlay = document.querySelector('.ie-chart-overlay');
    if (!overlay || !ieChartState.years) {
      return;
    }

    var svg = overlay.closest('svg');
    var cursorLine = svg.querySelector('.ie-cursor-line');
    var tooltipGroup = svg.querySelector('.ie-tooltip-group');
    var tooltipBg = svg.querySelector('.ie-tooltip-bg');
    var ttYear = svg.querySelector('.ie-tt-year');
    var ttLines = [
      svg.querySelector('.ie-tt-l0'),
      svg.querySelector('.ie-tt-l1'),
      svg.querySelector('.ie-tt-l2'),
      svg.querySelector('.ie-tt-l3'),
      svg.querySelector('.ie-tt-l4'),
      svg.querySelector('.ie-tt-l5'),
    ];

    if (!cursorLine || !tooltipGroup) {
      return;
    }

    var incomeLabels = ['Salary', 'Rental', 'Pension/SS/UBI', 'Investments', 'Retirement wd'];
    var incomeColors = ['#34d399', '#22d3ee', '#a78bfa', '#6366f1', '#14b8a6'];

    overlay.addEventListener('mousemove', function (event) {
      var rect = svg.getBoundingClientRect();
      var scaleX = ieChartState.width / rect.width;
      var mouseX = (event.clientX - rect.left) * scaleX;
      var relX = mouseX - ieChartState.pad.left;
      var stride = ieChartState.barWidth + ieChartState.gap;
      var barIndex = Math.round(relX / stride);
      barIndex = Math.max(0, Math.min(ieChartState.barCount - 1, barIndex));

      var row = ieChartState.years[barIndex];
      if (!row) {
        return;
      }

      // Position cursor line at bar center.
      var xCenter = ieChartState.pad.left + barIndex * stride + ieChartState.barWidth * 0.5;
      cursorLine.setAttribute('x1', xCenter.toFixed(1));
      cursorLine.setAttribute('x2', xCenter.toFixed(1));
      cursorLine.setAttribute('display', '');

      // Year/age header.
      var ageStr = row.personStates.map(function (ps) {
        return ps.alive ? ps.age : '—';
      }).join('/');
      ttYear.textContent = row.year + ' (age ' + ageStr + ')';

      // Income components.
      var incomes = [
        Math.max(0, row.salaryIncome),
        Math.max(0, row.rentalIncome),
        Math.max(0, row.pensionIncome + row.socialSecurityIncome + row.ubiIncome),
        Math.max(0, row.liquidInvestmentIncome),
        Math.max(0, row.retirementWithdrawal),
      ];

      // Fill tooltip lines: show non-zero income components, then expenses.
      var lineIdx = 0;
      for (var ci = 0; ci < incomes.length; ci++) {
        if (incomes[ci] > 0) {
          ttLines[lineIdx].textContent = incomeLabels[ci] + ': ' + Engine.formatCurrency(incomes[ci]);
          ttLines[lineIdx].setAttribute('fill', incomeColors[ci]);
          ttLines[lineIdx].setAttribute('display', '');
          lineIdx++;
        }
      }
      // Expenses line.
      if (lineIdx < ttLines.length) {
        ttLines[lineIdx].textContent = 'Expenses: ' + Engine.formatCurrency(row.totalOutflows);
        ttLines[lineIdx].setAttribute('fill', '#f43f5e');
        ttLines[lineIdx].setAttribute('display', '');
        lineIdx++;
      }
      // Hide remaining lines.
      for (var hi = lineIdx; hi < ttLines.length; hi++) {
        ttLines[hi].setAttribute('display', 'none');
        ttLines[hi].textContent = '';
      }

      // Resize tooltip background to fit visible lines.
      var bgHeight = 26 + lineIdx * 16;
      tooltipBg.setAttribute('height', bgHeight);

      // Reposition text y-coordinates for compactness.
      var yPos = 36;
      for (var ti = 0; ti < lineIdx; ti++) {
        ttLines[ti].setAttribute('y', yPos);
        yPos += 16;
      }

      // Position tooltip.
      var tooltipW = 200;
      var tooltipX = xCenter + 14;
      if (tooltipX + tooltipW > ieChartState.width - ieChartState.pad.right) {
        tooltipX = xCenter - tooltipW - 14;
      }
      var tooltipY = ieChartState.pad.top + 6;

      tooltipGroup.setAttribute('transform', 'translate(' + tooltipX.toFixed(1) + ',' + tooltipY.toFixed(1) + ')');
      tooltipGroup.setAttribute('display', '');
    });

    overlay.addEventListener('mouseout', function () {
      cursorLine.setAttribute('display', 'none');
      tooltipGroup.setAttribute('display', 'none');
    });
  }

  function render() {
    var bundle = Engine.buildScenarioSet(state.plan);
    state.plan = bundle.plan;
    var selectedScenario = bundle.scenarios[state.selectedScenario] || bundle.scenarios.base;
    var projection = selectedScenario.projection;
    state.snapshotYear = getSnapshotYear(projection);
    var validationMessages = Engine.validatePlan(state.plan);
    var unstressedBundle = Engine.isStressActive(state.plan.stressTests)
      ? Engine.buildScenarioSet(state.plan, { ignoreStress: true })
      : null;

    root.innerHTML =
      '<header class="hero">' +
      '<div class="hero__inner">' +
      '<div class="hero__heading">' +
      '<span class="eyebrow">Static • Private • Browser-only</span>' +
      '<h1>Retirement Planner</h1>' +
      '<p>Plan your financial future with confidence. Model different scenarios, visualize your trajectory, and stress-test against market shocks.</p>' +
      '<nav class="tab-nav">' +
      '<button type="button" class="tab-button ' +
      (state.activeTab === 'overview' ? 'is-active' : '') +
      '" data-action="set-tab" data-tab="overview">Overview</button>' +
      '<button type="button" class="tab-button ' +
      (state.activeTab === 'snapshot' ? 'is-active' : '') +
      '" data-action="set-tab" data-tab="snapshot">Snapshot</button>' +
      '<button type="button" class="tab-button ' +
      (state.activeTab === 'data' ? 'is-active' : '') +
      '" data-action="set-tab" data-tab="data">Data table</button>' +
      '<button type="button" class="tab-button ' +
      (state.activeTab === 'inputs' ? 'is-active' : '') +
      '" data-action="set-tab" data-tab="inputs">Edit inputs</button>' +
      '</nav>' +
      '</div>' +
      '<div class="hero__actions">' +
      '<button type="button" class="button button--primary" data-action="download-json">Save JSON</button>' +
      '<button type="button" class="button" data-action="export-csv">Export CSV</button>' +
      '<button type="button" class="button" data-action="print-report">Print report</button>' +
      '</div>' +
      '</div>' +
      '</header>' +
      '<main class="page-shell">' +
      (state.activeTab === 'overview'
        ? renderOverview(bundle, selectedScenario, unstressedBundle, validationMessages)
        : state.activeTab === 'snapshot'
          ? renderSnapshot(projection)
          : state.activeTab === 'data'
            ? renderDataTable(projection)
            : renderInputs(state.plan, validationMessages)) +
      '<input id="plan-file-input" type="file" accept=".json,application/json" class="hidden">' +
      '</main>';

    setupChartInteraction();
    setupIEChartInteraction();
    state.transientMessages = [];
  }
})();
