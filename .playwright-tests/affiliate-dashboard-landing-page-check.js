/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3017";
const buyerEmail = process.env.TEST_BUYER_EMAIL || "pw.lp.20260424053851@example.com";
const buyerPassword = process.env.TEST_BUYER_PASSWORD || "TestPass123!";
const outputDir = path.join(
  process.cwd(),
  ".playwright-tests",
  "output",
  `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-dashboard-lp-check`
);
fs.mkdirSync(outputDir, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(outputDir, "run.log"), `${line}\n`);
}

async function screenshot(page, name) {
  const file = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`screenshot:${file}`);
}

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    log("login affiliate");
    await page.goto(`${baseUrl}/affiliate/login`, { waitUntil: "networkidle" });
    await page.getByPlaceholder("affiliate@email.com").fill(buyerEmail);
    await page.getByPlaceholder("password").fill(buyerPassword);
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    await page.getByText("Produk Paid").waitFor({ timeout: 30000 });
    await screenshot(page, "01-dashboard-overview");

    await page.getByText("Afiliasi Saya", { exact: true }).click();
    await page.waitForTimeout(1500);
    await screenshot(page, "02-dashboard-affiliate");

    const bodyText = await page.locator("body").innerText();
    if (!bodyText.includes("Robotta")) {
      throw new Error("Produk Robotta tidak tampil di menu Afiliasi Saya.");
    }
    if (!bodyText.includes("Landing Page Produk")) {
      throw new Error("Section landing page produk tidak tampil.");
    }
    if (!bodyText.includes("robotta123")) {
      throw new Error("Slug landing page terkait produk tidak tampil.");
    }
    if (!/\/robotta123\?ref=[A-Z0-9]+/.test(bodyText)) {
      throw new Error("Link landing page affiliate tidak membawa referral code.");
    }

    const summary = {
      ok: true,
      buyerEmail,
      outputDir,
    };
    fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
    log(`success:${JSON.stringify(summary)}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  const failure = {
    ok: false,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    outputDir,
  };
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
