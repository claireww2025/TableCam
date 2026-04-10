/**
 * After `npm run make:zip`, copies the newest zip under `out/make/zip` into `release/`
 * as `TableCam-v{version}-{platform}-{arch}.zip` for easy local handoff.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ver = pkg.version;
const zipRoot = path.join(root, "out", "make", "zip");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      walk(p, out);
    } else if (name.name.endsWith(".zip")) {
      out.push(p);
    }
  }
  return out;
}

const zips = walk(zipRoot);
if (!zips.length) {
  console.error("collect-release-zip: no .zip under out/make/zip — run npm run make:zip first.");
  process.exit(1);
}

zips.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
const src = zips[0];
const destDir = path.join(root, "release");
fs.mkdirSync(destDir, { recursive: true });
const destName = `TableCam-v${ver}-${process.platform}-${process.arch}.zip`;
const dest = path.join(destDir, destName);
fs.copyFileSync(src, dest);
console.log(`Release zip: ${dest}`);
