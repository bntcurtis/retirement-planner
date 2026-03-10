# Retirement Planner

A static, privacy-first retirement planning app that runs entirely in the browser. There is no build step, no server, and no account. Upload the files to GitHub and GitHub Pages can serve the app directly.

## What changed

This rewrite deliberately favors simplicity:

- `index.html`, `styles.css`, `app.js`, and `engine.js` are the whole app
- the financial engine is separated from the UI
- current retirement balances are modeled as balances today, not balances at age 65
- property equity now subtracts mortgage debt
- target end ages now stop each person’s cash flows
- snapshot and data table numbers reconcile to the same engine math
- stress tests model event-driven shocks separately from long-run scenarios

For a full before-and-after summary, see [CHANGES_FROM_ORIGINAL.md](CHANGES_FROM_ORIGINAL.md).

## Core ideas

- **Scenarios**: Optimistic, Base, and Pessimistic are for long-run average returns.
- **Stress tests**: Social Security cuts, market crashes, and inflation spikes are overlays because timing matters.
- **Current net worth**: Cash + retirement balances today + property equity today.
- **Property equity**: Market value minus mortgage balance.
- **Tax-free retirement accounts**: All retirement savings are modeled as Roth-style (after-tax contributions, tax-free withdrawals). Ordinary income and capital gains are taxed separately.
- **Required Minimum Distributions**: At age 73 the engine enforces RMDs from each person’s retirement account using the IRS Uniform Lifetime Table, even when there is no cash shortfall.
- **COLA cap**: Pension COLA and UBI adjustments are capped at 3% per year. Social Security uses the full inflation rate.

## Files

```text
retirement-planner/
├── index.html
├── styles.css
├── app.js
├── engine.js
├── tests/
│   ├── index.html
│   ├── tests.js
│   └── run-engine-tests.js
├── CHANGES_FROM_ORIGINAL.md
└── README.md
```

## Running the app

### Open locally

Open `index.html` in a browser. No install or build step required.

### Publish to GitHub Pages

1. Push the repository contents to GitHub.
2. In GitHub, open **Settings** > **Pages**.
3. Set the source to deploy from the `main` branch and the `/root` folder.
4. GitHub Pages will serve `index.html` directly.

### Print a plan

Use your browser’s print dialog (Ctrl+P / Cmd+P). A print-specific stylesheet converts the dark theme to a light layout and hides interactive controls.

## Saving and loading

- The app keeps an automatic browser draft in local storage.
- You can also save a plan as JSON and load it later.
- Legacy plans from the old version are migrated forward when possible.

## Tests

There are 21 engine tests covering financial math, migration, and stress scenarios. Two ways to run them:

**In a browser** — open `tests/index.html`.

**On macOS from the terminal:**

```bash
osascript -l JavaScript tests/run-engine-tests.js
```

### What the tests cover

| Category | Tests |
|---|---|
| Core math | Net worth, cash-flow reconciliation, tax treatment |
| Retirement | RMD enforcement at 73, tax-free withdrawals, two-person proportional distribution, fixed-amount contributions |
| Income streams | Pension COLA cap, UBI start age, Social Security end-age shutdown, part-time salary reduction |
| Stress tests | Market crash (liquid/retirement/property drops), inflation spike override, Social Security reduction |
| Properties | Underwater sale, capital gains tax on sale proceeds, floating-point cleanup on appreciation rates |
| Migration | Legacy field mapping, empty/malformed input handling |
| Deductions | Charitable giving deduction from taxable income |

## Disclaimer

This tool is for planning and education only. It is not financial advice.

## License

MIT. See [LICENSE](LICENSE).
