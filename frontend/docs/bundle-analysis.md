# Frontend bundle analysis (mipcc)

This project uses **Vite** with `rollup-plugin-visualizer` to generate a local HTML bundle report.

## Run the analyzer

From the `mipcc` directory:

```bash
npm run analyze
```

This runs a production build and writes a treemap report. It does **not** change app runtime behavior.

Normal production deploys use `npm run build`, which does **not** generate the report.

## Report location

After `npm run analyze`, open:

```
reports/bundle-report.html
```

Open it in your browser (double-click the file or drag it into a browser tab).

The `reports/` folder is gitignored and is **not** deployed to Azure App Service.

## What to check in the report

1. **Largest rectangles** — biggest contributors to total JS size.
2. **Gzip / Brotli sizes** — closer to real transfer size over the network.
3. **Chunk names** — identify which route or lazy-loaded page owns a large chunk.
4. **node_modules** — see which libraries dominate (charts, Excel, observability, UI kits, etc.).
5. **Duplicate packages** — same library appearing in multiple chunks may indicate split bundles or version duplication.

## How to identify large libraries

- Hover blocks labeled with `node_modules/<package-name>` to see raw, gzip, and brotli sizes.
- Compare `apexcharts`, `@grafana/faro-*`, `xlsx`, `react-router-dom`, and Radix UI packages first — these are common heavy dependencies in this app.
- If one page chunk is large, trace imports from that route in `src/pages/` to see what it pulls in.

## Share with the team

1. Run `npm run analyze` locally or in CI (optional job).
2. Upload `reports/bundle-report.html` to your team channel, ticket, or internal storage.
3. Do **not** commit the HTML file or host it on the public App Service.

For CI (optional), add a workflow step that runs `npm run analyze` and uploads `reports/bundle-report.html` as a short-lived artifact.

## Related commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Standard production build (no report) |
| `npm run analyze` | Production build + bundle report |
| `npm run preview` | Serve `dist/` locally after build |
