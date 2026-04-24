/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const BASE_URL = "http://localhost:3028";
const VIDEO_URL = "https://www.w3schools.com/html/mov_bbb.mp4";

function readEnv() {
  const envText = fs.readFileSync(".env.local", "utf8");
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.startsWith("#"))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      })
  );
}

async function waitFor(check, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function main() {
  const env = readEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-").slice(0, 15);
  const outputDir = path.join(
    process.cwd(),
    ".playwright-tests",
    "output",
    `${timestamp}-wa-automation-e2e`
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const { data: settings } = await supabase
    .from("site_settings")
    .select("id, social_links")
    .limit(1)
    .single();
  const { data: product } = await supabase
    .from("products")
    .select("id, title, price")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  const stamp = Date.now();
  const broadcastDate = "2099-01-01";
  const followupEmail = `followup.${stamp}@example.com`;
  const broadcastEmail = `broadcast.${stamp}@example.com`;
  const socialLinks = settings.social_links || {};
  const whatsappConfig = {
    ...(socialLinks.whatsapp_notifications || {}),
    enabled: true,
    deviceId: "admin",
    notifyAdmin: true,
    notifyCustomer: true,
    notifyCustomerStatus: true,
    formatNumber: true,
    broadcastTemplate: "Broadcast tes untuk {customer_name} dari {site_title}.",
    broadcastStatuses: ["failed"],
    broadcastDateFrom: broadcastDate,
    broadcastDateTo: broadcastDate,
    broadcastMinDelaySeconds: 1,
    broadcastMaxDelaySeconds: 1,
    broadcastEnableImage: false,
    broadcastImageUrl: "",
    broadcastEnableVideo: false,
    broadcastVideoUrl: "",
    followupEnabled: true,
    followupStatuses: ["pending"],
    followupDelayHours: 1,
    followupTemplate: "FU1 untuk {customer_name} order #{order_id}",
    followup2Enabled: true,
    followupDelayHours2: 1,
    followupTemplate2: "FU2 untuk {customer_name} order #{order_id}",
    followup3Enabled: true,
    followupDelayHours3: 1,
    followupTemplate3: "FU3 untuk {customer_name} order #{order_id}",
  };

  await supabase
    .from("site_settings")
    .update({
      social_links: {
        ...socialLinks,
        whatsapp_notifications: whatsappConfig,
      },
    })
    .eq("id", settings.id);

  const broadcastOrderCode = `BRD-${stamp}`;
  await supabase.from("orders").insert({
    order_code: broadcastOrderCode,
    user_id: null,
    product_id: product.id,
    affiliate_id: null,
    buyer_name: "Broadcast Admin Test",
    buyer_email: broadcastEmail,
    buyer_whatsapp: "6285240956744",
    product_name: product.title,
    price: product.price,
    subtotal: product.price,
    discount_amount: 0,
    unique_code: 0,
    total_amount: product.price,
    notes: "broadcast automation test",
    coupon_code: null,
    referral_code: null,
    status: "failed",
    tracking_payload: { test: true, kind: "broadcast" },
    created_at: `${broadcastDate}T10:00:00.000Z`,
    updated_at: `${broadcastDate}T10:00:00.000Z`,
  });

  const orderResponse = await fetch(`${BASE_URL}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: product.id,
      buyer_name: "Followup Admin Test",
      buyer_email: followupEmail,
      buyer_whatsapp: "6285240956744",
      unique_code: 77,
    }),
  });
  const orderPayload = await orderResponse.json();
  if (!orderResponse.ok) {
    throw new Error(JSON.stringify(orderPayload));
  }

  const { data: followupOrder } = await supabase
    .from("orders")
    .select("id, order_code")
    .eq("order_code", orderPayload.order_code)
    .single();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  const summary = {
    baseUrl: BASE_URL,
    broadcastOrderCode,
    followupOrderCode: followupOrder.order_code,
    broadcastTextStatus: null,
    broadcastVideoStatus: null,
    followupStatuses: [],
    screenshots: [],
  };

  try {
    await page.goto(`${BASE_URL}/login?redirect=/admin/whatsapp`, {
      waitUntil: "networkidle",
    });
    await page.locator('input[type="email"]').fill("azam@gmail.com");
    await page.locator('input[type="password"]').fill("Nr201105");
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL("**/admin/whatsapp", { timeout: 30000 });

    await page.getByRole("button", { name: "Broadcast" }).click();
    await page.getByRole("button", { name: "Mulai Broadcast" }).click();

    const firstBroadcast = await waitFor(
      async () => {
        const { data } = await supabase
          .from("whatsapp_broadcasts")
          .select("*")
          .eq("template", "Broadcast tes untuk {customer_name} dari {site_title}.")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data && data.sent_count >= 1) return data;
        return null;
      },
      30000,
      "text broadcast to send"
    );

    summary.broadcastTextStatus = firstBroadcast.status;
    const shot1 = path.join(outputDir, "01-broadcast-text.png");
    await page.screenshot({ path: shot1, fullPage: true });
    summary.screenshots.push(shot1);

    await page.locator('label:has-text("Kirim video pada broadcast") input[type="checkbox"]').check();
    await page.locator('input[placeholder="https://example.com/promo.mp4"]').fill(VIDEO_URL);
    await page.getByRole("button", { name: "Mulai Broadcast" }).click();

    const secondBroadcast = await waitFor(
      async () => {
        const { data } = await supabase
          .from("whatsapp_broadcasts")
          .select("*")
          .eq("send_video", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data && data.sent_count >= 1) return data;
        return null;
      },
      30000,
      "video broadcast to send"
    );

    summary.broadcastVideoStatus = secondBroadcast.status;
    const shot2 = path.join(outputDir, "02-broadcast-video.png");
    await page.screenshot({ path: shot2, fullPage: true });
    summary.screenshots.push(shot2);

    const { data: followupJobs } = await supabase
      .from("whatsapp_followup_jobs")
      .select("id, level")
      .eq("order_id", followupOrder.id)
      .order("level", { ascending: true });

    await page.getByRole("button", { name: "Follow-up" }).click();

    for (const job of followupJobs || []) {
      await supabase
        .from("whatsapp_followup_jobs")
        .update({
          scheduled_for: new Date(Date.now() - 60_000).toISOString(),
          status: "pending",
          error: null,
          locked_at: null,
        })
        .eq("id", job.id);

      await page.getByRole("button", { name: "Proses Sekarang" }).click();

      const processedJob = await waitFor(
        async () => {
          const { data } = await supabase
            .from("whatsapp_followup_jobs")
            .select("status, sent_at")
            .eq("id", job.id)
            .maybeSingle();
          if (data?.status === "sent") return data;
          return null;
        },
        30000,
        `followup level ${job.level}`
      );

      summary.followupStatuses.push({
        level: job.level,
        status: processedJob.status,
        sent_at: processedJob.sent_at,
      });
    }

    const shot3 = path.join(outputDir, "03-followups.png");
    await page.screenshot({ path: shot3, fullPage: true });
    summary.screenshots.push(shot3);
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
