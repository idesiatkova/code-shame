# Code Shame

**Explore code health, dependencies, and source code in one local dashboard.**

Code Shame turns Fallow analysis into a browser workspace for JavaScript and
TypeScript projects. Find unused code, review refactoring suggestions, and trace
dependencies from architectural layers down to files and function calls.

[Quick start](#quick-start) · [Features](#features) · [Configuration](#configuration) · [Development](#development)

![Code Shame project explorer and dependency map](./assets/code-shame-project-structure.webp)

## Quick start

You need **Node.js 22 or newer** and a JavaScript or TypeScript project supported
by Fallow. Fallow is bundled as a dependency; no separate installation is needed.

From the root of the project you want to analyze, run:

```sh
npx code-shame
```

Open the URL printed in your terminal, usually `http://127.0.0.1:5179`.
The dashboard starts scanning when opened. The report appears first; the
dependency map follows as graph analysis finishes.

Use **Refresh** to scan again, or choose an auto-refresh interval.
Press `Ctrl+C` in the terminal to stop the server and its active analysis processes.

## Features

### Review code health

- **Blocking Findings** — unused files, exports, types, and dependencies;
  unresolved imports; dependency cycles; boundary violations; duplicated code;
  and complexity findings.
- **Refactoring Suggestions** — recommendations with priority, effort, and
  confidence to help choose where to start.
- **Code Health** — maintainability, complexity, coupling, and files with the
  lowest maintainability scores.
- **Metric history** — compare recent scans, with up to 24 samples stored in your
  browser for each project.
- **Copyable reports** — share findings as text.

![Code Shame Fallow analysis report](./assets/code-shame-fallow-report.webp)

### Explore project dependencies

- Browse architectural layers, directories, and files in an interactive map
  alongside a nested project explorer.
- Search for a file and inspect its incoming and outgoing dependencies.
- Use **Impact** to find direct and transitive consumers of a file.
- Use **Cycles** to inspect mutually dependent files and self-imports.
- Move between views with exploration history and restored selection state.

Layer grouping uses configured Fallow boundary zones when available, with
automatic path-based categories as a fallback.

### Read source and follow calls

Open JavaScript or TypeScript source files from the current scan, inspect their
symbols, and navigate to call sites. Function graphs resolve supported cross-file
ES module imports, CommonJS imports, and class method calls.

## Configuration

Code Shame reads settings from environment variables:

| Variable                 | Default           | Purpose                                                      |
| ------------------------ | ----------------- | ------------------------------------------------------------ |
| `CODE_SCAN_ROOT`         | Current directory | Project directory to analyze.                                |
| `HOST`                   | `127.0.0.1`       | Address the HTTP server binds to.                            |
| `PORT`                   | `5179`            | Server port, from `0` to `65535`; `0` picks a free port.     |
| `ARCHITECTURE_MAX_FILES` | `48`              | File limit for the dashboard projection, from `1` to `1000`. |

Analyze another directory or choose a different port (POSIX shell syntax):

```sh
CODE_SCAN_ROOT=/path/to/project PORT=5180 npx code-shame
```

The server serves project source code to the dashboard. Keep the default
loopback address for local use; set `HOST` only when you intend to make the
dashboard accessible through another network interface.

If a port is occupied, Code Shame exits with an error and leaves the existing
process running. Choose another port or stop that process yourself.

## How to interpret the graphs

Dependency and function graphs describe **static analysis**. They help explore
possible relationships; they do not prove runtime behavior or the effects of a change.

- **Partial graphs:** diagnostics identify missing or unresolved data. Counts
  and impact results reflect only the collected graph.
- **Display limits:** views report shown and total counts. Impact and cycle
  analysis use the collected file graph before display limits are applied.
- **Function resolution:** calls that cannot be proven remain unresolved.
  Coverage limits and truncation are reported in the interface.
- **Source access:** the source browser supports JavaScript and TypeScript files
  in the current scan, up to 512 KiB per file.

Each analysis command has a 60-second timeout; the whole scan has a 180-second
timeout. A graph failure keeps the primary report available. Use **Refresh** to
retry a failed scan.

For the graph model, scan lifecycle, API, and extension points, see
[Architecture](./ARCHITECTURE.md).

## Development

```sh
git clone https://github.com/idesiatkova/code-shame.git
cd code-shame
npm ci
npm run dev
```

`npm run dev` analyzes the Code Shame repository itself. To work on the dashboard
against another project:

```sh
CODE_SCAN_ROOT=/path/to/project npm run dev
```

The server uses Node.js CommonJS modules; the browser uses native ES modules.
There is no frontend build step.

| Command                           | Purpose                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `npm run check`                   | Run linting, formatting checks, tests, and Fallow gates. |
| `npm test`                        | Run backend and frontend module tests.                   |
| `npm run lint`                    | Check JavaScript and CSS.                                |
| `npm run format`                  | Format the repository with Prettier.                     |
| `npm run check:fallow:production` | Run Fallow checks on production code only.               |
| `npm run pack:dry`                | Inspect the npm package contents without publishing.     |

## Project links

- [Changelog](./CHANGELOG.md)
- [Architecture and contributor reference](./ARCHITECTURE.md)
- [Report a bug or request a feature](https://github.com/idesiatkova/code-shame/issues)

## License

[MIT](./LICENSE). Notices for bundled browser libraries are included in
[public/licenses](./public/licenses/README.md).
