# Changelog

## 0.3.0 - 2026-11-02

### Added

- Canonical project dependency graph from Fallow DOT exports, with layer, directory, and file views, search, impact analysis, and cycle detection.
- Project explorer with nested directories, keyboard navigation, and file-first exploration.
- Source browser and function call graphs with cross-file ESM, CommonJS, and class method resolution, symbol context, and navigation to call sites.
- Exploration history and restoration of graph, source, and selection state across workspace changes.
- Automated JavaScript and CSS linting, formatting checks, Fallow quality gates, and CI validation.
- License notices for bundled Lucide, Cytoscape, and graph layout libraries.

### Changed

- Reorganized frontend features and separated graph presentation, workspace navigation, source exploration, and function resolution concerns.
- Unified UI tokens, controls, spacing, and responsive workspace layouts, with clearer graph details and accessible navigation.
- Run full Fallow analysis and validate refactoring suggestion ranking and report data.

### Fixed

- Preserve entry point evidence and expose dependencies beyond the visible graph page, with accurate shown and total counts.
- Restore graph navigation and exploration history, preserve source and graph state, and reset stale file details when switching files.

## 0.2.2 - 2026-10-29

### Changed

- Updated Fallow from 3.31.0 to 3.37.0.
