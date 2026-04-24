/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3016";
const adminEmail = process.env.TEST_ADMIN_EMAIL || "azam@gmail.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD || "Nr201105";
const buyerEmail = process.env.TEST_BUYER_EMAIL || "halo@azkazamdigital.com";

const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const buyerPhone = `62812${timestamp.slice(-8)}`;
const buyerName = `Email Flow ${timestamp.slice(-4)}`;
const outputDir = path.join(process.cwd(), ".playwright-tests", "output", `${timestamp}-email`);
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

    log(`open checkout ${baseUrl}/order/order-roket`);
    await publicPage.goto(`${baseUrl}/order/order-roket`, {
      waitUntil: "networkidle",
    });
    await screenshot(publicPage, "01-checkout");

    await publicPage.getByPlaceholder("Masukkan nama lengkap").fill(buyerName);
    await publicPage.getByPlaceholder("nama@email.com").fill(buyerEmail);
    await publicPage.getByPlaceholder("6281234567890").fill(buyerPhone);
    await screenshot(publicPage, "02-checkout-filled");

    const orderResponsePromise = publicPage.waitForResponse((response) => {
      return response.url().includes("/api/orders") && response.request().method() === "POST";
    });

    await publicPage.getByRole("button", { name: "Pesan Sekarang" }).click();
    const orderResponse = await orderResponsePromise;
    const orderPayload = await orderResponse.json();

    await publicPage.waitForURL(/\/thank-you\//, { timeout: 30000 });
    const orderCode = publicPage.url().split("/").pop();
    await screenshot(publicPage, "03-thank-you");

    log(`order created:${orderCode}`);
    log(`invoice email payload:${JSON.stringify(orderPayload.email || null)}`);

    if (!orderPayload?.email || !orderPayload.email.messageId) {
      throw new Error(
        `Invoice email did not return messageId. Payload: ${JSON.stringify(orderPayload)}`
      );
    }

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

    const paidResponsePromise = adminPage.waitForResponse((response) => {
      return (
        response.url().includes("/api/admin/orders/") &&
        response.url().includes("/status") &&
        response.request().method() === "POST"
      );
    });

    await orderRow.locator("select").selectOption("paid");
    const paidResponse = await paidResponsePromise;
    const paidPayload = await paidResponse.json();
    await orderRow.locator("span").filter({ hasText: /^Dibayar$/ }).first().waitFor({
      timeout: 30000,
    });
    await screenshot(adminPage, "05-admin-order-paid");

    log(`paid email payload:${JSON.stringify(paidPayload.email || null)}`);

    if (!paidPayload?.email || !paidPayload.email.messageId) {
      throw new Error(
        `Paid email did not return messageId. Payload: ${JSON.stringify(paidPayload)}`
      );
    }

    const summary = {
      ok: true,
      buyerName,
      buyerEmail,
      buyerPhone,
      orderCode,
      invoiceEmail: orderPayload.email,
      paidEmail: paidPayload.email,
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
