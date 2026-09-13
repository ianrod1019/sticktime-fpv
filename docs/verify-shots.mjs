/** Verify interactive capture states: sim tab, log dialog, callsign field. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const BASE = "http://localhost:8081";
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

async function signIn() {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1200);
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + "/?showAuth=true&mode=login", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(1500);
  const inputs = await page.$$("input");
  await inputs[0].type("owner@test.sticktime", { delay: 10 });
  await inputs[1].type("Passw0rd!owner", { delay: 10 });
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

await signIn();

// 1. log-sim: sim tab active
await page.goto(BASE + "/log", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(2500);
const logDiag = await page.evaluate(() => ({
  url: location.pathname,
  text: document.body.innerText.slice(0, 150).replace(/\n/g, " | "),
  buttons: [...document.querySelectorAll("button")]
    .slice(0, 12)
    .map((b) => b.textContent?.trim().slice(0, 24)),
}));
console.log("log page:", JSON.stringify(logDiag));
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => /^simulator$/i.test(b.textContent?.trim() ?? ""))
    ?.click();
});
await sleep(800);
const simState = await page.evaluate(() => {
  const tab = document.querySelector("[role=tab][aria-selected=true], [role=tab]");
  const selected = [...document.querySelectorAll("[role=tab]")].find(
    (t) => t.getAttribute("aria-selected") === "true",
  );
  return {
    selectedTab: selected?.textContent?.trim() ?? "(no aria-selected tabs)",
    bodyHasSim: /sim/i.test(document.body.innerText),
  };
});
console.log("log-sim state:", JSON.stringify(simState));

// 2. log-session-dialog: dialog open
await page.evaluate(() => {
  [...document.querySelectorAll("button")]
    .find((b) => /log session/i.test(b.textContent ?? ""))
    ?.click();
});
await sleep(900);
const dialogState = await page.evaluate(() => ({
  dialogOpen: !!document.querySelector("[role=dialog]"),
  heading: document.querySelector("[role=dialog] h2, [role=dialog] [data-slot=dialog-title]")
    ?.textContent?.trim(),
}));
console.log("dialog state:", JSON.stringify(dialogState));
await page.keyboard.press("Escape");

// 3. settings: callsign field present with value
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(3000);
const settingsDiag = await page.evaluate(() => ({
  url: location.pathname,
  text: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
  inputs: document.querySelectorAll("input").length,
  labels: [...document.querySelectorAll("label")].map((l) => l.textContent?.trim()).slice(0, 10),
}));
console.log("settings page:", JSON.stringify(settingsDiag, null, 1));
const settingsState = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("label")].map((l) => l.textContent?.trim());
  const callsignInput =
    document.querySelector('input[autocomplete="nickname"], input[maxlength="24"]') ??
    [...document.querySelectorAll("input")].find(
      (i) => i.type === "text" && i.value && i.value.length < 25,
    );
  return {
    hasCallsignLabel: labels.some((t) => /callsign/i.test(t ?? "")),
    callsignValue: callsignInput?.value ?? "(not found)",
  };
});
console.log("settings state:", JSON.stringify(settingsState));

await browser.close();
console.log("OK");
