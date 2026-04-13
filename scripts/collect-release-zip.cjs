/**
 * After `npm run make:zip`, copies the newest zip under `out/make/zip` into `release/`
 * as `TableCam-v{version}-{platform}-{arch}.zip` for easy local handoff.
 * Removes older `TableCam-v*-{platform}-{arch}.zip` files in `release/` so only the current build remains.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const ver = pkg.version;
const zipRoot = path.join(root, "out", "make", "zip");
const plat = process.platform;
const arch = process.arch;
const suffix = `-${plat}-${arch}.zip`;

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

for (const name of fs.readdirSync(destDir, { withFileTypes: true })) {
  if (!name.isFile() || !name.name.endsWith(".zip")) {
    continue;
  }
  if (!name.name.startsWith("TableCam-v") || !name.name.endsWith(suffix)) {
    continue;
  }
  fs.unlinkSync(path.join(destDir, name.name));
}

const destName = `TableCam-v${ver}-${plat}-${arch}.zip`;
const dest = path.join(destDir, destName);
fs.copyFileSync(src, dest);
console.log(`Release zip: ${dest}`);
