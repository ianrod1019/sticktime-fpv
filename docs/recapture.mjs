/**
 * Docs screenshot recapture — run with the dev server on :8081.
 * Usage: node docs/recapture.mjs [name1 name2 ...]   (default: all)
 * Writes to docs/images/, then run `npm run docs:sync` to mirror public/docs/.
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:8081";
const OUT = "docs/images";
const SQUADRON = "bb000000-0000-4000-8000-000000000001";
mkdirSync(OUT, { recursive: true });

const executablePath = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
].find((p) => existsSync(p));

const OWNER = { email: "owner@test.sticktime", password: "Passw0rd!owner" };
const MEMBER = { email: "member@test.sticktime", password: "Passw0rd!member" };

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
await page.setDefaultTimeout(30000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(ms = 1400) {
  await new Promise((resolve) => {
    let t;
    const done = () => {
      clearTimeout(t);
      resolve();
    };
    t = setTimeout(done, 2200);
    page.waitForNetworkIdle({ idleTime: 450, concurrency: 0 }).then(done).catch(done);
  });
  await sleep(ms);
}

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await settle();
}

async function signOut() {
  await goto("/");
  await page.evaluate(() => localStorage.clear());
  await goto("/");
}

async function isAuthed() {
  return page.evaluate(() =>
    Object.keys(localStorage).some(
      (k) => k.startsWith("sb-") && k.includes("auth-token"),
    ),
  );
}

async function signIn(account) {
  await signOut();
  await goto("/?showAuth=true&mode=login");
  await page.waitForSelector('input[placeholder="name@example.com"]', {
    visible: true,
    timeout: 30000,
  });
  const inputs = await page.$$("input");
  await inputs[0].type(account.email, { delay: 12 });
  await inputs[1].type(account.password, { delay: 12 });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Sign In" && b.offsetParent !== null,
    );
    btn?.click();
  });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (await isAuthed()) return;
  }
  throw new Error(`sign-in failed for ${account.email}`);
}

async function capture(account, path, name, pre, expectExpr) {
  await signIn(account);
  await goto(path);
  const url = page.url();
  if (!url.includes(path))
    throw new Error(`redirected from ${path} to ${url} — not authenticated?`);
  if (pre) await pre();
  if (expectExpr) {
    const ok = await page.evaluate(`(() => { return ${expectExpr}; })()`);
    if (!ok)
      throw new Error(
        `content assertion failed on ${path}: ${expectExpr.slice(0, 60)}`,
      );
  }
  await shoot(name);
}

async function shoot(name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log("  ✓", name);
}

const only = process.argv.slice(2);

const clickButton = (pattern) => async () => {
  await page.evaluate((re) => {
    const rx = new RegExp(re, "i");
    const btn = [...document.querySelectorAll("button")].find((b) =>
      rx.test(b.textContent?.trim() ?? ""),
    );
    btn?.click();
  }, pattern);
  await sleep(900); // let open/close and slider animations settle
};

// name → [account, path, preAction?, expectExpr?]
const shots = {
  // ---------- public landing + auth ----------
  landing: [null, "/", null, `document.body.innerText.includes("Every pack")`],
  "sign-in": [
    null,
    "/?showAuth=true&mode=login",
    null,
    `!!document.querySelector('input[placeholder="name@example.com"]')`,
  ],
  "create-account": [
    null,
    "/?showAuth=true&mode=signup",
    null,
    `document.body.innerText.includes("Create an Account")`,
  ],

  // ---------- owner (pro) ----------
  dashboard: [
    OWNER,
    "/dashboard",
    null,
    `document.body.innerText.toLowerCase().includes("airtime")`,
  ],
  "log-real": [
    OWNER,
    "/log",
    null,
    `document.body.innerText.includes("Flight Logs")`,
  ],
  "log-sim": [
    OWNER,
    "/log",
    clickButton("^simulator$"),
    `[...document.querySelectorAll("[role=tab]")].find(t => t.getAttribute("aria-selected") === "true")?.textContent?.trim() === "Simulator"`,
  ],
  "log-session-dialog": [
    OWNER,
    "/log",
    clickButton("log session"),
    `!!document.querySelector("[role=dialog]")`,
  ],
  "hanger-personal": [
    OWNER,
    "/hanger/personal",
    null,
    `document.body.innerText.includes("Gear Hanger")`,
  ],
  "hanger-index": [
    OWNER,
    "/hanger",
    null,
    `document.body.innerText.includes("Hangers")`,
  ],
  "squadron-hq": [
    OWNER,
    `/squadron/${SQUADRON}`,
    null,
    `document.body.innerText.includes("RBAC Test Squadron")`,
  ],
  "squadron-manage": [
    OWNER,
    `/squadron/manage/${SQUADRON}`,
    null,
    `document.body.innerText.toLowerCase().includes("entry code")`,
  ],
  settings: [
    OWNER,
    "/settings",
    null,
    `document.body.innerText.includes("Callsign")`,
  ],
  "ledger-personal": [
    OWNER,
    "/ledger/personal",
    null,
    `document.body.innerText.includes("Cost Ledger")`,
  ],
  "ledger-squadron": [
    OWNER,
    `/ledger/squadron/${SQUADRON}`,
    null,
    `document.body.innerText.includes("Squadron Ledger")`,
  ],
  "ledger-index": [
    OWNER,
    "/ledger",
    null,
    `document.body.innerText.includes("Cost Ledgers")`,
  ],
  "squadron-portal": [
    OWNER,
    "/squadron",
    null,
    `document.body.innerText.toLowerCase().includes("squadron")`,
  ],
  "inventory-index": [
    OWNER,
    "/gear/inventory",
    null,
    `document.body.innerText.toLowerCase().includes("master inventory")`,
  ],

  // ---------- owner (pro) analytics ----------
  "analytics-index": [
    OWNER,
    "/analytics",
    null,
    `document.body.innerText.toLowerCase().includes("failure analytics")`,
  ],
  "analytics-personal": [
    OWNER,
    "/analytics/personal",
    null,
    `document.body.innerText.includes("Failure Analytics")`,
  ],
  "squadron-failure-analytics": [
    OWNER,
    `/squadron/${SQUADRON}/analytics`,
    null,
    `document.body.innerText.includes("Failure Analytics")`,
  ],

  // ---------- member (free) gated views ----------
  "hanger-squadron-member": [
    MEMBER,
    `/hanger/squadron/${SQUADRON}`,
    null,
    `document.body.innerText.includes("Squadron Hanger")`,
  ],
  "ledger-access-denied": [
    MEMBER,
    `/ledger/squadron/${SQUADRON}`,
    null,
    `document.body.innerText.includes("Ledger Private")`,
  ],
  "parts-inventory": [
    MEMBER,
    `/squadron/${SQUADRON}/inventory`,
    null,
    `document.body.innerText.toLowerCase().includes("bench")`,
  ],
};

for (const [name, [account, path, pre, expectExpr]] of Object.entries(shots)) {
  if (only.length && !only.includes(name)) continue;
  try {
    if (account) {
      await capture(account, path, name, pre, expectExpr);
    } else {
      await signOut();
      await goto(path);
      if (expectExpr) {
        const ok = await page.evaluate(`(() => { return ${expectExpr}; })()`);
        if (!ok)
          throw new Error(
            `content assertion failed on ${path}: ${expectExpr.slice(0, 60)}`,
          );
      }
      await shoot(name);
    }
  } catch (err) {
    console.error("  ✗", name, "-", err.message.split("\n")[0]);
  }
}

await browser.close();
console.log("Done.");
