/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3017";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "azam@gmail.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "Nr201105";

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const buyerEmail = `pw.lp.${timestamp}@example.com`;
const buyerPhone = `62821${timestamp.slice(-8)}`;
const buyerName = `Landing Page ${timestamp.slice(-4)}`;
const buyerPassword = "TestPass123!";
const outputDir = path.join(
  process.cwd(),
  ".playwright-tests",
  "output",
  `${timestamp}-affiliate-lp`
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
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();

    log(`open checkout ${baseUrl}/order/robotta-produk`);
    await publicPage.goto(`${baseUrl}/order/robotta-produk`, {
      waitUntil: "networkidle",
    });
    await publicPage.getByPlaceholder("Masukkan nama lengkap").fill(buyerName);
    await publicPage.getByPlaceholder("nama@email.com").fill(buyerEmail);
    await publicPage.getByPlaceholder("6281234567890").fill(buyerPhone);
    await screenshot(publicPage, "01-robotta-checkout");

    await publicPage.getByRole("button", { name: "Pesan Sekarang" }).click();
    await publicPage.waitForURL(/\/thank-you\//, { timeout: 30000 });
    const orderCode = publicPage.url().split("/").pop();
    await screenshot(publicPage, "02-robotta-thank-you");
    log(`order created:${orderCode}`);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    log("login admin");
    await adminPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await adminPage.getByPlaceholder("admin@azkazamdigital.com").fill(adminEmail);
    await adminPage.getByPlaceholder("password").fill(adminPassword);
    await adminPage.getByRole("button", { name: "Masuk" }).click();
    await adminPage.waitForURL(/\/admin/, { timeout: 30000 });
    await screenshot(adminPage, "03-admin-dashboard");

    log("open admin orders");
    await adminPage.goto(`${baseUrl}/admin/orders`, { waitUntil: "networkidle" });
    await adminPage.waitForTimeout(3000);
    await screenshot(adminPage, "04-admin-orders");
    await adminPage.getByText(orderCode, { exact: false }).waitFor({ timeout: 60000 });
    const orderRow = adminPage.locator("tbody tr").filter({ hasText: orderCode }).first();
    await orderRow.locator("select").selectOption("paid");
    await orderRow.locator("span").filter({ hasText: /^Dibayar$/ }).first().waitFor({
      timeout: 30000,
    });
    await screenshot(adminPage, "05-admin-order-paid");

    const affiliateContext = await browser.newContext();
    const affiliatePage = await affiliateContext.newPage();
    await affiliatePage.goto(`${baseUrl}/affiliate/register`, {
      waitUntil: "networkidle",
    });
    await affiliatePage.getByPlaceholder("Nama lengkap").fill(buyerName);
    await affiliatePage.getByPlaceholder("email@example.com").fill(buyerEmail);
    await affiliatePage.getByPlaceholder("6281234567890").fill(buyerPhone);
    await affiliatePage.getByPlaceholder("BCA, BRI, Mandiri, DANA, dll.").fill("BCA");
    await affiliatePage.getByPlaceholder("Nama sesuai rekening").fill(buyerName.toUpperCase());
    await affiliatePage.getByPlaceholder("Nomor rekening / e-wallet").fill("1234567890");
    await affiliatePage.getByPlaceholder("Min. 6 karakter").fill(buyerPassword);
    await affiliatePage.getByRole("button", { name: "Daftar Afiliasi" }).click();
    await affiliatePage.waitForURL(/\/affiliate\/login/, { timeout: 30000 });

    await affiliatePage.goto(`${baseUrl}/affiliate/login`, { waitUntil: "networkidle" });
    await affiliatePage.getByPlaceholder("affiliate@email.com").fill(buyerEmail);
    await affiliatePage.getByPlaceholder("password").fill(buyerPassword);
    await affiliatePage.getByRole("button", { name: "Masuk" }).click();
    await affiliatePage.waitForURL(/\/dashboard/, { timeout: 30000 });
    await affiliatePage.getByRole("button", { name: "Afiliasi Saya" }).click();
    await screenshot(affiliatePage, "06-dashboard-affiliate");

    const pageText = await affiliatePage.locator("body").innerText();
    if (!pageText.includes("Robotta")) {
      throw new Error("Dashboard tidak menampilkan produk Robotta.");
    }
    if (!pageText.includes("Landing Page Produk")) {
      throw new Error("Section landing page tidak muncul di dashboard afiliasi.");
    }
    if (!pageText.includes("robotta123")) {
      throw new Error("Landing page terkait produk tidak tampil.");
    }
    if (!pageText.includes("/robotta123?ref=")) {
      throw new Error("Link landing page affiliate tidak membawa referral code.");
    }

    const summary = {
      ok: true,
      orderCode,
      buyerName,
      buyerEmail,
      buyerPhone,
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
