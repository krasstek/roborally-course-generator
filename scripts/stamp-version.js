const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "index.html");
const swPath = path.join(rootDir, "sw.js");

const version = process.env.APP_VERSION || createTimestampVersion();

replaceInFile(
  indexPath,
  /(<meta\s+name="app-version"\s+content=")[^"]+("(\s*\/)?>)/,
  `$1${version}$2`
);
replaceInFile(swPath, /(const APP_VERSION = ")[^"]+(";)/, `$1${version}$2`);

console.log(`Stamped app version: ${version}`);

function createTimestampVersion() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

function replaceInFile(filePath, pattern, replacement) {
  const original = fs.readFileSync(filePath, "utf8");
  if (!pattern.test(original)) {
    throw new Error(`Could not find version placeholder in ${path.basename(filePath)}`);
  }

  const updated = original.replace(pattern, replacement);
  fs.writeFileSync(filePath, updated);
}
