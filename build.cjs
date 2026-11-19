const { cpSync, mkdirSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const outputDirectory = "dist";
const staticFiles = ["index.html", "styles.css", "app.js"];

rmSync(outputDirectory, { force: true, recursive: true });
mkdirSync(outputDirectory, { recursive: true });

for (const file of staticFiles) {
  cpSync(file, join(outputDirectory, file));
}

console.log(`Copied ${staticFiles.length} static files to ${outputDirectory}/`);
