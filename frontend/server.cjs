const path = require("path");
const express = require("express");

const app = express();
const distPath = path.join(__dirname, "dist");
const port = Number(process.env.PORT) || 8080;

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(
  express.static(distPath, {
    index: false,
    maxAge: "1d",
  }),
);

app.use((req, res) => {
  if (path.extname(req.path)) {
    return res.status(404).end();
  }
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`mipcc frontend listening on port ${port}`);
});
