# Browser dependency licenses

These notices accompany the original vendor scripts served by Code Shame.
They are included in the npm package and available under `/licenses/`.

| File                  | Component                                          | Source                                                          |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| `lucide.txt`          | Lucide 1.21.0, including Feather-derived icons     | Installed `lucide/LICENSE`                                      |
| `cytoscape.txt`       | Cytoscape.js 3.34.0                                | Installed `cytoscape/LICENSE`                                   |
| `cytoscape-dagre.txt` | cytoscape-dagre 4.0.0                              | Installed `cytoscape-dagre/LICENSE`                             |
| `dagre.txt`           | Dagre 3.0.0, including its bundled Graphlib notice | Published `@dagrejs/dagre@3.0.0` npm archive, `package/LICENSE` |

The installed cytoscape-dagre source map embeds a copy of
`@dagrejs/dagre@3.0.0/dist/dagre.esm.js`. It was compared byte for byte with
that published npm artifact. Its accompanying `dagre.esm.js.LEGAL.txt`
contains the same Chris Pettitt MIT notice preserved in `dagre.txt`.

When updating these dependencies, refresh their notices from the matching
versions and check embedded dependencies again. Do not remove the license
headers from vendor scripts.

Server dependencies are installed separately by npm and retain their own
license files. The installed runtime dependency manifests use MIT, ISC,
Apache-2.0, and BlueOak-1.0.0 (minimatch). TypeScript and its native package
also include `NOTICE.txt`; preserve these notices when redistributing their
files. This inventory does not audit every component embedded in native
executables or every development dependency.
