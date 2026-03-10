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
- **Retirement withdrawals**: Retirement balances stay invested and are drawn down when needed after retirement access begins.

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
└── README.md
```

## Running the app

### Open locally

Open `index.html` in a browser.

### Publish to GitHub Pages

1. Upload the repository contents to GitHub.
2. In GitHub, open `Settings` → `Pages`.
3. Set the source to deploy from the `main` branch and the `/root` folder.
4. GitHub Pages will serve `index.html` directly.

No package install or build command is required.

## Saving and loading

- The app keeps an automatic browser draft in local storage.
- You can also save a plan as JSON and load it later.
- Legacy plans from the old version are migrated forward when possible.

## Tests

There are two lightweight ways to inspect the engine tests:

- Open `tests/index.html` in a browser.
- Run `osascript -l JavaScript tests/run-engine-tests.js` on macOS.

The tests cover:

- current net worth math
- tax treatment for non-salary income
- legacy retirement-balance migration
- end-age cash-flow shutdown
- row-by-row cash-flow reconciliation
- property equity and underwater sale handling
- Social Security stress reduction

## Disclaimer

This tool is for planning and education only. It is not financial advice.

## License

MIT. See [LICENSE](LICENSE).
