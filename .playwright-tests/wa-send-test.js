/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const outputDir = path.join(process.cwd(), ".playwright-tests", "output", `${timestamp}-wa-send-test`);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const summary = {
    baseUrl: "http://localhost:3027",
    testRouteStatus: null,
    testRouteBody: null,
    finalUrl: null,
    screenshot: null,
  };

  page.on("response", async (response) => {
    if (!response.url().includes("/api/admin/whatsapp/test")) return;
    summary.testRouteStatus = response.status();
    try {
      summary.testRouteBody = await response.json();
    } catch {
      summary.testRouteBody = await response.text();
    }
  });

  try {
    await page.goto("http://localhost:3027/login?redirect=/admin/whatsapp", {
      waitUntil: "networkidle",
    });

    await page.locator('input[type="email"]').fill("azam@gmail.com");
    await page.locator('input[type="password"]').fill("Nr201105");
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL("**/admin/whatsapp", { timeout: 30000 });

    const testNumber = page.locator('input[placeholder="628xxxxxxx"]').last();
    await testNumber.fill("6285240956744");

    const deviceIdInput = page.locator('input[placeholder="contoh: admin"]');
    if (await deviceIdInput.count()) {
      await deviceIdInput.fill("admin");
    }

    await page.getByRole("button", { name: "Kirim Tes" }).click();
    await page.waitForTimeout(5000);

    summary.finalUrl = page.url();
    summary.screenshot = path.join(outputDir, "wa-send-test.png");
    await page.screenshot({ path: summary.screenshot, fullPage: true });
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    path.join(outputDir, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
