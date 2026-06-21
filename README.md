# Code Scan

Local web dashboard for Fallow code analysis reports.

![Code Scan dashboard](./assets/code-scan-dashboard.jpg)

## Usage

Run it from the root of the project you want to analyze:

```sh
npx @yukkaxxl/code-scan
```

Open the printed local URL, then press **Refresh** to run a scan.

By default Code Scan listens on `127.0.0.1:5179`. Override it with environment
variables when needed:

```sh
HOST=0.0.0.0 PORT=5180 npx @yukkaxxl/code-scan
```

## What It Shows

- Blocking Findings from Fallow checks
- Refactoring Suggestions from maintainability analysis
- Code Health metrics and lowest maintainability files
- Copyable text reports for sharing findings

## Requirements

- Node.js 18 or newer
- A JavaScript or TypeScript project supported by Fallow

Fallow is installed as a package dependency, so users do not need to install it
separately.
