# Road Crash Hospitalisations in Australia

A static D3 data story using processed 2011–2021 hospitalisation exports.

## Project structure

- `index.html` forwards visitors to the overview at `html/index.html`.
- `html/index.html` contains the overview chart and its controls.
- `js/v1-chart.js` contains chart rendering, controls and page initialization.
- `js/read-data.js` loads and parses the CSV, defines the measures and validates the source data.
- `css/v1.css` styles the overview.
- `data/exports/` contains the CSV files used by the chart and retained project data.
- `data/source/` and `knime/` contain source workbooks and the processing workflow.

There is no build step. Publish the project root as the website root, or host the project below a domain subpath; the page, module, stylesheet and CSV paths are relative. D3 is loaded from cdnjs.

For a local preview, serve this directory over HTTP and open `http://localhost:8000`:

```powershell
py -m http.server 8000
```
