# Code Shame

Local web dashboard for Fallow code analysis reports.

### Project structure

![Code Shame project structure](https://raw.githubusercontent.com/idesiatkova/code-shame/main/assets/code-shame-project-structure.jpg)

### Fallow report

![Code Shame Fallow report](https://raw.githubusercontent.com/idesiatkova/code-shame/main/assets/code-shame-fallow-report.jpg)

## Usage

Run it from the root of the project you want to analyze:

```sh
npx code-shame
```

Open the printed local URL, then press **Refresh** to run a scan.

By default Code Shame listens on `127.0.0.1:5179`. Override it with environment
variables when needed:

```sh
HOST=0.0.0.0 PORT=5180 npx code-shame
```

## What It Shows

- An interactive project structure map grouped into architectural layers
- Blocking Findings from Fallow checks
- Refactoring Suggestions from maintainability analysis
- Code Health metrics and lowest maintainability files
- Copyable text reports for sharing findings

The project map uses configured Fallow boundary zones when available and falls
back to automatic categories such as styles/design system, state stores, UI,
API/data, domain, tests, server, and tooling. Open it as a separate page from the
toolbar page selector. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the graph model
and extension points.

## Requirements

- Node.js 22 or newer
- A JavaScript or TypeScript project supported by Fallow

Fallow is installed as a package dependency, so users do not need to install it
separately.
