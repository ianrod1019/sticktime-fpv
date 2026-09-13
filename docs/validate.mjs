/**
 * Validates the docs folder: docs.json parses, every nav page has an MDX
 * file, every MDX file is in the nav, internal links and images resolve.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";

const cfg = JSON.parse(readFileSync("docs/docs.json", "utf8"));
const navPages = [];
for (const group of cfg.navigation.groups) {
  for (const p of group.pages) navPages.push(p);
}

const files = readdirSync("docs").filter((f) => f.endsWith(".mdx")).map((f) => f.replace(/\.mdx$/, ""));

const errors = [];

// 1:1 nav <-> files
const missingFiles = navPages.filter((p) => !files.includes(p));
const unnavbed = files.filter((f) => !navPages.includes(f));
if (missingFiles.length) errors.push("Nav pages without files: " + missingFiles.join(", "));
if (unnavbed.length) errors.push("Files not in nav: " + unnavbed.join(", "));

// duplicate nav entries
const dupes = navPages.filter((p, i) => navPages.indexOf(p) !== i);
if (dupes.length) errors.push("Duplicate nav entries: " + [...new Set(dupes)].join(", "));

// links + images per page
for (const page of navPages) {
  const mdx = readFileSync(`docs/${page}.mdx`, "utf8");
  // internal links (/page-name)
  const links = [...mdx.matchAll(/\]\((\/[a-z-]+)\)/g)].map((m) => m[1].slice(1));
  for (const link of links) {
    if (!navPages.includes(link)) errors.push(`${page}.mdx links to unknown page: /${link}`);
  }
  // images
  const imgs = [...mdx.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  for (const img of imgs) {
    const p = `docs${img}`;
    if (!existsSync(p)) errors.push(`${page}.mdx references missing image: ${img}`);
  }
}

// screenshots on disk all referenced somewhere
const allMdx = navPages.map((p) => readFileSync(`docs/${p}.mdx`, "utf8")).join("\n");
const images = readdirSync("docs/images");
const unreferenced = images.filter(
  (i) => i !== "favicon.svg" && !allMdx.includes(`/images/${i}`),
);
if (unreferenced.length) errors.push("Images never referenced: " + unreferenced.join(", "));

if (errors.length) {
  console.log("FAIL\n" + errors.map((e) => " - " + e).join("\n"));
  process.exit(1);
} else {
  console.log(`OK: ${navPages.length} pages, ${images.length} images, all links resolve.`);
}
