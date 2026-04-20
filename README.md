# Retirement Planner

A static, privacy-first retirement planning app that runs entirely in the browser. There is no build step, no server, and no account. Upload the files to GitHub and GitHub Pages (or Cloudflare Pages) can serve the app directly.

🔗 **[Try it live](https://bntcurtis.github.io/retirement-planner/)**

## Core ideas

- **Scenarios**: Optimistic, Base, and Pessimistic are for long-run average returns.
- **Stress tests**: Social Security cuts, market crashes, and inflation spikes are overlays because timing matters.
- **Current net worth**: Cash + retirement balances today + property equity today.
- **Property equity**: Market value minus mortgage balance.

### Tax model

The engine separates tax treatment by account type and income source:

- **Retirement accounts** — each person's retirement account is either tax-deferred (traditional 401(k)/IRA) or Roth. Tax-deferred contributions reduce ordinary taxable income, withdrawals are taxed as ordinary income, and RMDs apply at age 73. Roth contributions are after-tax, withdrawals and growth are tax-free, and there are no owner RMDs.
- **Social Security** — a configurable percent of benefits is treated as ordinary taxable income (default 85%, matching the IRS maximum for middle and upper income retirees).
- **Liquid investment returns** — a configurable percent of the annual return on liquid assets is treated as ordinary taxable income each year (default 30%, approximating interest and dividends; the rest is assumed to be unrealized gains).
- **Property sales** — capital gains tax applies to the gain after subtracting cost basis, selling costs, and (for primary residences) the IRS exclusion of $250,000 single or $500,000 joint.
- **Charitable giving** — donations reduce ordinary taxable income. Fixed-dollar donations inflate automatically each year.

### Mortgage amortization

Each property with a mortgage uses a real amortization calculation based on its own interest rate. Each year: interest is computed on the outstanding balance, and the remaining portion of the annual payment reduces principal. If the payment is smaller than the annual interest, the engine warns and holds the balance flat instead of modeling negative amortization.

### RMDs and COLA

- RMDs are enforced at age 73 on tax-deferred accounts using the IRS Uniform Lifetime Table.
- Pension COLA and UBI inflation adjustments are capped at 3% per year.
- Social Security tracks the full inflation rate (or the stressed inflation rate during a spike).

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
│   ├── run-engine-tests.js          # macOS (osascript)
│   └── run-engine-tests.node.js     # Node.js
└── README.md
```

## Running the app

### Open locally

Open `index.html` in a browser. No install or build step required.

### Publish

Drag and drop the files to GitHub (or your host of choice). Cloudflare Pages and GitHub Pages both serve `index.html` directly with no build step.

### Print a plan

Use your browser's print dialog (Ctrl+P / Cmd+P). A print-specific stylesheet converts the dark theme to a light layout and hides interactive controls.

## Saving and loading

- The app keeps an automatic browser draft in local storage.
- You can also save a plan as JSON and load it later.
- Legacy plans from older versions are migrated forward. Migration notes appear in the UI when assumptions are inferred — review them before trusting the projection.

## Tests

**In a browser:** open `tests/index.html`.

**On macOS from the terminal:**

```bash
osascript -l JavaScript tests/run-engine-tests.js
```

**With Node.js:**

```bash
node tests/run-engine-tests.node.js
```

## Disclaimer

This tool is for planning and education only. It is not financial advice.

## License

MIT. See [LICENSE](LICENSE).
