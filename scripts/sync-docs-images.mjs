/**
 * Copies docs/images into public/docs so the in-app /docs pages render the
 * current screenshots. Run after re-capturing: `npm run docs:sync`.
 *
 * (The canonical screenshots live in docs/images for the Mintlify-ready
 * docs/ folder; the app serves its own copy from /public.)
 */
import { mkdirSync, copyFileSync, readdirSync } from "node:fs";

const SRC = "docs/images";
const DEST = "public/docs";

mkdirSync(DEST, { recursive: true });

const pngs = readdirSync(SRC).filter((f) => f.endsWith(".png"));
for (const file of pngs) {
  copyFileSync(`${SRC}/${file}`, `${DEST}/${file}`);
}
console.log(`synced ${pngs.length} screenshots → ${DEST}/`);
