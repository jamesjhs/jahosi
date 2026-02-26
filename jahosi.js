const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Portfolio server running on http://127.0.0.1:${port}`);
});
