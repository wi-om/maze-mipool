// Container entrypoint: plain-HTTP static server for the built SPA.
const path = require("path");
const express = require("express");

const app = express();
const distPath = path.join(__dirname, "dist");
const port = Number(process.env.PORT) || 8080;

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.get("/healthz", (req, res) => {
  res.json({ status: "UP", service: "delta-mipool-frontend" });
});

app.use(
  express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (/[.-][0-9a-f]{8,}\.[a-z0-9]+$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

app.use((req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).end();
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`delta-mipool frontend listening on ${port}`);
});
