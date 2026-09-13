/** Verify data-rich surfaces for owner (pro) and admin (enterprise). */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = "http://localhost:8081";
const SQ = "bb000000-0000-4000-8000-000000000001";
const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find(
  (p) => existsSync(p),
);
const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: ["--no-sandbox"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(email, password) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1000);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "/?showAuth=true&mode=login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(1500);
  const inputs = await page.$$("input");
  await inputs[0].type(email, { delay: 10 });
  await inputs[1].type(password, { delay: 10 });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent?.trim() === "Sign In")
      ?.click();
  });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const ok = await page.evaluate(() =>
      Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.includes("auth-token")),
    );
    if (ok) return;
  }
  throw new Error("sign-in failed");
}

const visit = async (path, wait = 2600) => {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(wait);
  return page.evaluate(() => document.body.innerText);
};

// ---------- owner (pro) ----------
await signIn("owner@test.sticktime", "Passw0rd!owner");

let t = await visit("/dashboard");
console.log("dashboard:", {
  hasAirtime: /airtime/i.test(t),
  hasStreak: /streak/i.test(t),
  hasSessions: /session/i.test(t),
});

t = await visit("/log");
console.log("log:", {
  hasSessionCount: /\d+\s*(sessions?|entries)/i.test(t),
  noEmpty: !/no sessions yet/i.test(t),
});

t = await visit("/ledger/squadron/" + SQ);
console.log("squadron ledger:", {
  investment: t.match(/\$[\d,]+\.\d{2}/)?.[0] ?? "none",
  noEmpty: !/ledger is empty/i.test(t),
});

t = await visit("/hanger/squadron/" + SQ);
console.log("squadron hanger:", {
  hasGear: /Squadron Racer|Fleet Freestyle|Tinywhoop/.test(t),
  noEmpty: !/hanger is empty/i.test(t),
});

t = await visit("/hanger/personal");
console.log("personal hanger:", {
  hasGear: /Squirt|Mach R5/.test(t),
});

t = await visit("/gear/inventory");
console.log("inventory:", {
  hasParts: /AX2306|SpeedyBee|Runcam|HQ/i.test(t),
  noProBanner: !/upgrade to pro/i.test(t),
});

t = await visit("/analytics/personal");
console.log("personal analytics:", {
  hasFailures: /tree strike|motor bearing|hard landing|failure/i.test(t),
  noLock: !/requires a pro/i.test(t),
});

t = await visit("/ledger/personal");
console.log("personal ledger:", {
  hasMoney: /\$\d/.test(t),
});

// ---------- admin (enterprise) → squadron failure analytics ----------
await signIn("admin@test.sticktime", "Passw0rd!admin");
t = await visit(`/squadron/${SQ}/analytics`, 3500);
console.log("squadron failure analytics (enterprise):", {
  hasFailures: /tree strike|esc desync|mid-air|battery failure|hard landing/i.test(t),
  hasCost: /\$\d/.test(t),
  noEmpty: !/no failures logged/i.test(t),
});

// ---------- member (free) → gates still visible ----------
await signIn("member@test.sticktime", "Passw0rd!member");
t = await visit("/gear/inventory");
console.log("member inventory:", {
  showsProBanner: /pro|upgrade/i.test(t),
});
t = await visit("/analytics/personal", 3000);
console.log("member analytics:", {
  locked: /requires a pro|pro subscription|upgrade/i.test(t),
});

await browser.close();
console.log("DONE");
