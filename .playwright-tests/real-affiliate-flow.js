/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3015";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "azam@gmail.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "Nr201105";

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const buyerEmail = `pw.real.${timestamp}@example.com`;
const buyerPhone = `62812${timestamp.slice(-8)}`;
const buyerName = `Playwright Real ${timestamp.slice(-4)}`;
const buyerPassword = "TestPass123!";
const outputDir = path.join(process.cwd(), ".playwright-tests", "output", timestamp);
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

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();

    log(`open checkout ${baseUrl}/order/order-roket`);
    await publicPage.goto(`${baseUrl}/order/order-roket`, { waitUntil: "networkidle" });
    await screenshot(publicPage, "01-checkout");

    await publicPage.getByPlaceholder("Masukkan nama lengkap").click();
    await publicPage.getByPlaceholder("Masukkan nama lengkap").fill(buyerName);
    await publicPage.getByPlaceholder("nama@email.com").click();
    await publicPage.getByPlaceholder("nama@email.com").fill(buyerEmail);
    await publicPage.getByPlaceholder("6281234567890").click();
    await publicPage.getByPlaceholder("6281234567890").fill(buyerPhone);
    await screenshot(publicPage, "02-checkout-filled");

    await publicPage.getByRole("button", { name: "Pesan Sekarang" }).click();
    await publicPage.waitForURL(/\/thank-you\//, { timeout: 30000 });
    const thankYouUrl = publicPage.url();
    const orderCode = thankYouUrl.split("/").pop();
    log(`order created:${orderCode}`);
    await screenshot(publicPage, "03-thank-you");

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    log("login admin");
    await adminPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await adminPage.getByPlaceholder("admin@azkazamdigital.com").fill(adminEmail);
    await adminPage.getByPlaceholder("password").fill(adminPassword);
    await adminPage.getByRole("button", { name: "Masuk" }).click();
    await adminPage.waitForURL(/\/admin/, { timeout: 30000 });
    await screenshot(adminPage, "04-admin-dashboard");

    log("open admin orders");
    await adminPage.goto(`${baseUrl}/admin/orders`, { waitUntil: "networkidle" });
    await adminPage.getByText(orderCode, { exact: false }).waitFor({ timeout: 30000 });
    const orderRow = adminPage.locator("tbody tr").filter({ hasText: orderCode }).first();
    await orderRow.locator("select").selectOption("paid");
    await wait(2500);
    await screenshot(adminPage, "05-admin-order-paid");

    const rowText = await orderRow.innerText();
    if (!rowText.toLowerCase().includes("dibayar")) {
      throw new Error(`Order row did not switch to paid. Row text: ${rowText}`);
    }

    log("open admin settings");
    await adminPage.goto(`${baseUrl}/admin/settings`, { waitUntil: "networkidle" });
    await adminPage.getByRole("heading", { name: "Pengaturan Situs" }).waitFor({ timeout: 30000 });
    await adminPage.locator('input[placeholder="BCA"]').scrollIntoViewIfNeeded();
    await screenshot(adminPage, "06-admin-settings");

    const bankValue = await adminPage.locator('input[placeholder="BCA"]').inputValue();
    if ((bankValue || "").trim().toUpperCase() !== "BCA") {
      throw new Error(`Payment bank value mismatch. Got: ${bankValue}`);
    }

    const affiliateContext = await browser.newContext();
    const affiliatePage = await affiliateContext.newPage();

    log("register affiliate");
    await affiliatePage.goto(`${baseUrl}/affiliate/register`, { waitUntil: "networkidle" });
    await affiliatePage.getByPlaceholder("Nama lengkap").fill(buyerName);
    await affiliatePage.getByPlaceholder("email@example.com").fill(buyerEmail);
    await affiliatePage.getByPlaceholder("6281234567890").fill(buyerPhone);
    await affiliatePage.getByPlaceholder("BCA, BRI, Mandiri, DANA, dll.").fill("BCA");
    await affiliatePage.getByPlaceholder("Nama sesuai rekening").fill(buyerName.toUpperCase());
    await affiliatePage.getByPlaceholder("Nomor rekening / e-wallet").fill("1234567890");
    await affiliatePage.getByPlaceholder("Min. 6 karakter").fill(buyerPassword);
    await screenshot(affiliatePage, "07-affiliate-register-filled");
    await affiliatePage.getByRole("button", { name: "Daftar Afiliasi" }).click();
    await affiliatePage.waitForURL(/\/affiliate\/login/, { timeout: 30000 });
    await screenshot(affiliatePage, "08-affiliate-register-result");

    log("login affiliate");
    await affiliatePage.goto(`${baseUrl}/affiliate/login`, { waitUntil: "networkidle" });
    await affiliatePage.getByPlaceholder("affiliate@email.com").fill(buyerEmail);
    await affiliatePage.getByPlaceholder("password").fill(buyerPassword);
    await affiliatePage.getByRole("button", { name: "Masuk" }).click();
    await affiliatePage.waitForURL(/\/dashboard/, { timeout: 30000 });
    await screenshot(affiliatePage, "09-dashboard-overview");

    await affiliatePage.getByRole("button", { name: "Afiliasi Saya" }).click();
    await wait(1000);
    await screenshot(affiliatePage, "10-dashboard-affiliate");

    const dashboardText = await affiliatePage.locator("body").innerText();
    if (!dashboardText.includes("Roket")) {
      throw new Error("Dashboard affiliate page did not show purchased product Roket.");
    }
    if (!dashboardText.includes("/produk/order-roket?ref=")) {
      throw new Error("Dashboard affiliate page did not show affiliate link.");
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
