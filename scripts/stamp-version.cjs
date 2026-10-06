// Stamps a new app version and regenerates the service worker's precache list.
// Run before every deploy: browsers only pick up a new release when sw.js changes,
// and the precache list must name every file the app loads.
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "index.html");
const manifestPath = path.join(rootDir, "manifest.webmanifest");
const swPath = path.join(rootDir, "sw.js");

const version = process.env.APP_VERSION || createTimestampVersion();

replaceInFile(
  indexPath,
  /(<meta\s+name="app-version"\s+content=")[^"]+("(\s*\/)?>)/,
  `$1${version}$2`
);
replaceInFile(swPath, /(const APP_VERSION = ")[^"]+(";)/, `$1${version}$2`);

const precache = buildPrecacheLists();
replaceInFile(
  swPath,
  /(\/\/ PRECACHE LIST START[^\n]*\n)[\s\S]*?(\/\/ PRECACHE LIST END)/,
  `$1${formatArray("UNVERSIONED_ASSETS", precache.unversioned)}\n${formatArray("VERSIONED_ASSETS", precache.versioned)}\n$2`
);

console.log(
  `Stamped app version: ${version} ` +
  `(precache: ${precache.unversioned.length} unversioned, ${precache.versioned.length} versioned files)`
);

function createTimestampVersion() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

// Versioned files are requested with ?v=<version> (main.js versionedPath): every
// app module at the root except the service worker, every board data file and the
// calibration guidance. Unversioned files are the page shell and the icons that
// index.html and the manifest reference. Board photos are left to the runtime cache.
function buildPrecacheLists() {
  const modules = fs.readdirSync(rootDir)
    .filter((name) => name.endsWith(".js") && name !== "sw.js")
    .sort()
    .map((name) => `./${name}`);
  const boardData = fs.readdirSync(path.join(rootDir, "data"))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `./data/${name}`);
  const calibration = fs.existsSync(path.join(rootDir, "calibration", "construction-guidance.json"))
    ? ["./calibration/construction-guidance.json"]
    : [];

  const iconPattern = /\.\/assets\/icons\/[^"'\s)]+/g;
  const icons = [
    ...(fs.readFileSync(indexPath, "utf8").match(iconPattern) ?? []),
    ...(fs.readFileSync(manifestPath, "utf8").match(iconPattern) ?? [])
  ];
  const missingIcons = icons.filter((icon) => !fs.existsSync(path.join(rootDir, icon)));
  if (missingIcons.length) {
    throw new Error(`Referenced icons are missing: ${[...new Set(missingIcons)].join(", ")}`);
  }

  return {
    unversioned: ["./", "./index.html", "./manifest.webmanifest", ...[...new Set(icons)].sort()],
    versioned: [...modules, ...boardData, ...calibration]
  };
}

function formatArray(name, items) {
  return `const ${name} = [\n${items.map((item) => `  "${item}"`).join(",\n")}\n];`;
}

function replaceInFile(filePath, pattern, replacement) {
  const original = fs.readFileSync(filePath, "utf8");
  if (!pattern.test(original)) {
    throw new Error(`Could not find version placeholder in ${path.basename(filePath)}`);
  }

  const updated = original.replace(pattern, replacement);
  fs.writeFileSync(filePath, updated);
}
