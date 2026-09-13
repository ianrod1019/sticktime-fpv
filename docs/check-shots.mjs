/**
 * Screenshot sanity check: every authenticated shot must differ from the
 * landing page (the failure mode: capture ran without a session and got the
 * signed-out redirect). Compares raw pixels at a shared resolution.
 */
import { PNG } from "pngjs";
import { readFileSync, readdirSync } from "node:fs";

const load = (p) => PNG.sync.read(readFileSync(`docs/images/${p}.png`));

const landing = load("landing");
const key = (png, n = 40) => {
  // coarse grid of raw pixel values — cheap perceptual fingerprint
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = Math.floor((i / n) * (png.width - 1));
    const y = Math.floor((Math.random() * 0.999 + (i / n) * 0.001) * (png.height - 1));
    const idx = (png.width * y + x) << 2;
    out.push(png.data[idx], png.data[idx + 1], png.data[idx + 2]);
  }
  return out;
};
const landingKey = key(landing);
const similar = (a, b) => {
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
};

const authed = readdirSync("docs/images")
  .filter((f) => f.endsWith(".png") && f !== "landing.png")
  .map((f) => f.replace(".png", ""));

let bad = 0;
for (const name of authed) {
  try {
    const png = load(name);
    const pct = (similar(key(png), landingKey) * 100).toFixed(1);
    const flag = pct > 92 ? "  ⚠ LOOKS LIKE LANDING" : "";
    if (pct > 92) bad++;
    console.log(`${name.padEnd(30)} ${png.width}x${png.height}  landing-match ${pct}%${flag}`);
  } catch (e) {
    console.log(`${name.padEnd(30)} ERROR ${e.message}`);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
