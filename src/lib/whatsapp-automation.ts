import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  buildWhatsappOrderContext,
  formatWhatsappPhone,
  getWhatsappNotificationConfig,
  processWhatsappSpintax,
  resolveBroadcastMediaUrl,
  resolveBroadcastTemplate,
  resolveWhatsappTemplate,
  sendWhatsappImage,
  sendWhatsappMessage,
  sendWhatsappVideo,
  type WhatsappBroadcastRecipientContext,
  type WhatsappNotificationConfig,
  type WhatsappStatus,
} from "@/lib/whatsapp-notifications";

type ServiceSupabase = Awaited<ReturnType<typeof createServiceRoleClient>>;

type BroadcastRow = {
  id: string;
  status: string;
  template: string;
  send_image: boolean;
  image_url: string | null;
  send_video: boolean;
  video_url: string | null;
  min_delay_seconds: number;
  max_delay_seconds: number;
  filter_statuses: string[] | null;
  filter_date_from: string | null;
  filter_date_to: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  current_index: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  stopped_at: string | null;
  last_processed_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type BroadcastRecipientRow = {
  id: string;
  broadcast_id: string;
  order_id: string | null;
  sequence_no: number;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  last_order_code: string | null;
  last_order_date: string | null;
  last_order_total: number;
  status: string;
  send_after: string;
  attempts: number;
  sent_at: string | null;
  error: string | null;
};

type FollowupJobRow = {
  id: string;
  order_id: string;
  level: number;
  scheduled_for: string;
  status: string;
  attempts: number;
  locked_at: string | null;
  sent_at: string | null;
  cancelled_at: string | null;
  error: string | null;
};

type OrderRow = {
  id: string;
  order_code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  product_name: string;
  product_id: string | null;
  total_amount: number;
  status: string;
  created_at: string;
};

type ProcessSummary = {
  followupsProcessed: number;
  broadcastRecipientsProcessed: number;
};

type FollowupLevelConfig = {
  enabled: boolean;
  delayHours: number;
  template: string;
};

const AUTOMATION_LOOP_KEY = "__azkazaWhatsappAutomationLoop";
const AUTOMATION_INTERVAL_MS = 30_000;
const RETRY_DELAY_MS = 15 * 60 * 1000;
const BROADCAST_RETRY_DELAY_MS = 60 * 1000;
const MAX_SEND_ATTEMPTS = 3;
const FAR_FUTURE_SEND_AFTER = "2099-12-31T23:59:59.000Z";

export async function createWhatsappBroadcast(args: {
  config: WhatsappNotificationConfig;
  createdBy?: string | null;
}) {
  const supabase = await createServiceRoleClient();
  const config = args.config;

  if (!config.enabled) {
    throw new Error("Notifikasi WhatsApp belum aktif.");
  }

  const { data: activeBroadcast } = await supabase
    .from("whatsapp_broadcasts")
    .select("id, status")
    .in("status", ["running", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeBroadcast) {
    throw new Error("Masih ada broadcast yang sedang berjalan atau dijeda.");
  }

  const orders = await getBroadcastOrders(supabase, config);
  const recipients = buildUniqueBroadcastRecipients(orders, config);

  if (recipients.length === 0) {
    throw new Error("Tidak ada pelanggan yang cocok dengan filter broadcast.");
  }

  const nowIso = new Date().toISOString();
  const { data: broadcast, error: broadcastError } = await supabase
    .from("whatsapp_broadcasts")
    .insert({
      status: "running",
      template: config.broadcastTemplate,
      send_image: config.broadcastEnableImage,
      image_url: config.broadcastImageUrl || null,
      send_video: config.broadcastEnableVideo,
      video_url: config.broadcastVideoUrl || null,
      min_delay_seconds: config.broadcastMinDelaySeconds,
      max_delay_seconds: config.broadcastMaxDelaySeconds,
      filter_statuses: config.broadcastStatuses,
      filter_date_from: config.broadcastDateFrom || null,
      filter_date_to: config.broadcastDateTo || null,
      total_recipients: recipients.length,
      sent_count: 0,
      failed_count: 0,
      current_index: 0,
      started_at: nowIso,
      created_by: args.createdBy || null,
    })
    .select("*")
    .single();

  if (broadcastError || !broadcast) {
    throw new Error(broadcastError?.message || "Gagal membuat broadcast.");
  }

  const recipientRows = recipients.map((recipient, index) => ({
    broadcast_id: broadcast.id,
    order_id: recipient.orderId,
    sequence_no: index + 1,
    customer_name: recipient.customerName,
    customer_email: recipient.customerEmail || null,
    customer_phone: recipient.customerPhone,
    last_order_code: recipient.lastOrderCode,
    last_order_date: recipient.lastOrderDateIso,
    last_order_total: recipient.lastOrderTotal,
    status: "pending",
    send_after: index === 0 ? nowIso : FAR_FUTURE_SEND_AFTER,
    attempts: 0,
  }));

  const { error: recipientsError } = await supabase
    .from("whatsapp_broadcast_recipients")
    .insert(recipientRows);

  if (recipientsError) {
    await supabase.from("whatsapp_broadcasts").delete().eq("id", broadcast.id);
    throw new Error(recipientsError.message || "Gagal menyusun antrian broadcast.");
  }

  return broadcast as BroadcastRow;
}

export async function pauseWhatsappBroadcast(broadcastId: string) {
  const supabase = await createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("whatsapp_broadcasts")
    .update({
      status: "paused",
      paused_at: nowIso,
    })
    .eq("id", broadcastId)
    .eq("status", "running")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Broadcast tidak bisa dijeda.");
  }

  return data as BroadcastRow;
}

export async function resumeWhatsappBroadcast(broadcastId: string) {
  const supabase = await createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("whatsapp_broadcasts")
    .update({
      status: "running",
      paused_at: null,
    })
    .eq("id", broadcastId)
    .eq("status", "paused")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Broadcast tidak bisa dilanjutkan.");
  }

  await scheduleNextBroadcastRecipient(
    supabase,
    data.id,
    Number(data.current_index || 0),
    nowIso
  );

  return data as BroadcastRow;
}

export async function stopWhatsappBroadcast(broadcastId: string) {
  const supabase = await createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("whatsapp_broadcasts")
    .update({
      status: "stopped",
      stopped_at: nowIso,
    })
    .eq("id", broadcastId)
    .in("status", ["running", "paused"])
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || "Broadcast tidak bisa dihentikan.");
  }

  await supabase
    .from("whatsapp_broadcast_recipients")
    .update({
      status: "skipped",
      error: "Broadcast dihentikan oleh admin.",
    })
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending");

  return data as BroadcastRow;
}

export async function syncOrderWhatsappFollowups(args: {
  config: WhatsappNotificationConfig;
  order: Pick<
    OrderRow,
    | "id"
    | "order_code"
    | "buyer_name"
    | "buyer_email"
    | "buyer_whatsapp"
    | "product_name"
    | "product_id"
    | "total_amount"
    | "status"
    | "created_at"
  >;
  supabase?: ServiceSupabase;
}) {
  const supabase = args.supabase || (await createServiceRoleClient());
  const { config, order } = args;

  const activeLevels = getActiveFollowupLevels(config);
  if (
    !config.enabled ||
    activeLevels.length === 0 ||
    !config.followupStatuses.includes(order.status as WhatsappStatus)
  ) {
    await cancelOrderFollowupJobs(
      supabase,
      order.id,
      "Order tidak lagi memenuhi syarat follow-up."
    );
    return { scheduledLevels: [] as number[], cancelled: true };
  }

  const { data: existingJobs } = await supabase
    .from("whatsapp_followup_jobs")
    .select("*")
    .eq("order_id", order.id)
    .order("level", { ascending: true });

  const existingByLevel = new Map(
    (existingJobs || []).map((job) => [job.level, job as FollowupJobRow])
  );
  const scheduleMap = buildFollowupSchedule(order.created_at, config);
  const scheduledLevels: number[] = [];

  for (const level of [1, 2, 3]) {
    const levelConfig = getFollowupLevelConfig(config, level);
    const existing = existingByLevel.get(level);
    if (!levelConfig.enabled || !scheduleMap[level]) {
      if (existing && existing.status !== "sent") {
        await supabase
          .from("whatsapp_followup_jobs")
          .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            error: "Level follow-up dinonaktifkan.",
            locked_at: null,
          })
          .eq("id", existing.id);
      }
      continue;
    }

    scheduledLevels.push(level);

    if (existing?.status === "sent") {
      continue;
    }

    const payload = {
      order_id: order.id,
      level,
      scheduled_for: scheduleMap[level],
      status: "pending",
      cancelled_at: null,
      locked_at: null,
      error: null,
    };

    if (existing) {
      await supabase
        .from("whatsapp_followup_jobs")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabase.from("whatsapp_followup_jobs").insert(payload);
    }
  }

  return { scheduledLevels, cancelled: false };
}

export async function processWhatsappAutomationBatch() {
  const supabase = await createServiceRoleClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("site_name, whatsapp_number, social_links")
    .limit(1)
    .single();

  if (!settings) {
    return { followupsProcessed: 0, broadcastRecipientsProcessed: 0 } satisfies ProcessSummary;
  }

  const config = getWhatsappNotificationConfig(
    settings.social_links as Record<string, unknown> | null,
    settings.whatsapp_number
  );

  if (!config.enabled) {
    return { followupsProcessed: 0, broadcastRecipientsProcessed: 0 } satisfies ProcessSummary;
  }

  const siteName = settings.site_name || "AzkazamDigital";
  const processedFollowups = await processDueFollowupJobs(
    supabase,
    config,
    siteName
  );
  const processedBroadcasts = await processRunningBroadcasts(
    supabase,
    config,
    siteName
  );

  return {
    followupsProcessed: processedFollowups,
    broadcastRecipientsProcessed: processedBroadcasts,
  } satisfies ProcessSummary;
}

export function ensureWhatsappAutomationLoop() {
  if (typeof window !== "undefined") {
    return;
  }

  if (!shouldRunAutomationLoop()) {
    return;
  }

  const globalState = globalThis as Record<string, unknown>;
  if (globalState[AUTOMATION_LOOP_KEY]) {
    return;
  }

  const timer = setInterval(() => {
    void processWhatsappAutomationBatch().catch((error) => {
      console.error("WhatsApp automation loop error:", error);
    });
  }, AUTOMATION_INTERVAL_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  globalState[AUTOMATION_LOOP_KEY] = timer;
}

export async function getWhatsappAutomationDashboard() {
  const supabase = await createServiceRoleClient();
  const nowIso = new Date().toISOString();

  const [
    activeBroadcastResult,
    recentBroadcastsResult,
    recentFollowupsResult,
    pendingFollowupsResult,
    dueFollowupsResult,
    sentFollowupsResult,
    failedFollowupsResult,
  ] = await Promise.all([
    supabase
      .from("whatsapp_broadcasts")
      .select("*")
      .in("status", ["running", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("whatsapp_broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("whatsapp_followup_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("whatsapp_followup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("whatsapp_followup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("scheduled_for", nowIso),
    supabase
      .from("whatsapp_followup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent"),
    supabase
      .from("whatsapp_followup_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
  ]);

  const followupJobs = (recentFollowupsResult.data || []) as FollowupJobRow[];
  const orderIds = [...new Set(followupJobs.map((job) => job.order_id).filter(Boolean))];
  const { data: orders } = orderIds.length
    ? await supabase
        .from("orders")
        .select("id, order_code, buyer_name, buyer_whatsapp, status")
        .in("id", orderIds)
    : { data: [] as Array<{ id: string; order_code: string; buyer_name: string; buyer_whatsapp: string; status: string }> };

  const ordersById = new Map((orders || []).map((order) => [order.id, order]));

  return {
    activeBroadcast: (activeBroadcastResult.data || null) as BroadcastRow | null,
    recentBroadcasts: (recentBroadcastsResult.data || []) as BroadcastRow[],
    recentFollowups: followupJobs.map((job) => ({
      ...job,
      order: ordersById.get(job.order_id) || null,
    })),
    followupCounts: {
      pending: pendingFollowupsResult.count || 0,
      dueNow: dueFollowupsResult.count || 0,
      sent: sentFollowupsResult.count || 0,
      failed: failedFollowupsResult.count || 0,
    },
  };
}

async function getBroadcastOrders(
  supabase: ServiceSupabase,
  config: WhatsappNotificationConfig
) {
  let query = supabase
    .from("orders")
    .select(
      "id, order_code, buyer_name, buyer_email, buyer_whatsapp, total_amount, created_at, status"
    )
    .in("status", config.broadcastStatuses)
    .order("created_at", { ascending: false });

  if (config.broadcastDateFrom) {
    query = query.gte("created_at", `${config.broadcastDateFrom}T00:00:00.000Z`);
  }

  if (config.broadcastDateTo) {
    query = query.lte("created_at", `${config.broadcastDateTo}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Gagal mengambil data pelanggan broadcast.");
  }

  return (data || []) as Array<{
    id: string;
    order_code: string;
    buyer_name: string;
    buyer_email: string;
    buyer_whatsapp: string;
    total_amount: number;
    created_at: string;
    status: string;
  }>;
}

function buildUniqueBroadcastRecipients(
  orders: Array<{
    id: string;
    order_code: string;
    buyer_name: string;
    buyer_email: string;
    buyer_whatsapp: string;
    total_amount: number;
    created_at: string;
  }>,
  config: WhatsappNotificationConfig
) {
  const uniqueCustomers = new Map<
    string,
    {
      orderId: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      lastOrderCode: string;
      lastOrderDateIso: string;
      lastOrderTotal: number;
    }
  >();

  for (const order of orders) {
    const phone = formatWhatsappPhone(order.buyer_whatsapp || "", config.formatNumber);
    if (!phone || uniqueCustomers.has(phone)) {
      continue;
    }

    uniqueCustomers.set(phone, {
      orderId: order.id,
      customerName: order.buyer_name,
      customerEmail: order.buyer_email,
      customerPhone: phone,
      lastOrderCode: order.order_code,
      lastOrderDateIso: order.created_at,
      lastOrderTotal: Number(order.total_amount || 0),
    });
  }

  return [...uniqueCustomers.values()];
}

function getActiveFollowupLevels(config: WhatsappNotificationConfig) {
  const levels: number[] = [];
  if (!config.followupEnabled) {
    return levels;
  }

  levels.push(1);
  if (config.followup2Enabled) {
    levels.push(2);
  }
  if (config.followup3Enabled) {
    levels.push(3);
  }
  return levels;
}

function buildFollowupSchedule(
  orderCreatedAt: string,
  config: WhatsappNotificationConfig
) {
  const baseTime = new Date(orderCreatedAt).getTime();
  const level1 = new Date(baseTime + config.followupDelayHours * 60 * 60 * 1000);
  const schedule: Record<number, string | null> = {
    1: config.followupEnabled ? level1.toISOString() : null,
    2: null,
    3: null,
  };

  if (config.followupEnabled && config.followup2Enabled) {
    const level2 = new Date(
      level1.getTime() + config.followupDelayHours2 * 60 * 60 * 1000
    );
    schedule[2] = level2.toISOString();

    if (config.followup3Enabled) {
      const level3 = new Date(
        level2.getTime() + config.followupDelayHours3 * 60 * 60 * 1000
      );
      schedule[3] = level3.toISOString();
    }
  }

  return schedule;
}

function getFollowupLevelConfig(
  config: WhatsappNotificationConfig,
  level: number
): FollowupLevelConfig {
  if (level === 1) {
    return {
      enabled: config.followupEnabled,
      delayHours: config.followupDelayHours,
      template: config.followupTemplate,
    };
  }

  if (level === 2) {
    return {
      enabled: config.followupEnabled && config.followup2Enabled,
      delayHours: config.followupDelayHours2,
      template: config.followupTemplate2,
    };
  }

  return {
    enabled: config.followupEnabled && config.followup2Enabled && config.followup3Enabled,
    delayHours: config.followupDelayHours3,
    template: config.followupTemplate3,
  };
}

async function cancelOrderFollowupJobs(
  supabase: ServiceSupabase,
  orderId: string,
  reason: string
) {
  await supabase
    .from("whatsapp_followup_jobs")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      error: reason,
      locked_at: null,
    })
    .eq("order_id", orderId)
    .in("status", ["pending", "processing", "failed"]);
}

async function processDueFollowupJobs(
  supabase: ServiceSupabase,
  config: WhatsappNotificationConfig,
  siteName: string
) {
  const nowIso = new Date().toISOString();
  const { data: dueJobs } = await supabase
    .from("whatsapp_followup_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(5);

  let processed = 0;

  for (const row of (dueJobs || []) as FollowupJobRow[]) {
    const claimed = await claimFollowupJob(supabase, row.id);
    if (!claimed) {
      continue;
    }

    const { data: order } = await supabase
      .from("orders")
      .select(
        "id, order_code, buyer_name, buyer_email, buyer_whatsapp, product_name, product_id, total_amount, status, created_at"
      )
      .eq("id", row.order_id)
      .maybeSingle();

    if (!order) {
      await markFollowupCancelled(supabase, row.id, "Order follow-up tidak ditemukan.");
      continue;
    }

    const levelConfig = getFollowupLevelConfig(config, claimed.level);
    if (
      !config.enabled ||
      !levelConfig.enabled ||
      !config.followupStatuses.includes(order.status as WhatsappStatus)
    ) {
      await markFollowupCancelled(
        supabase,
        row.id,
        "Order tidak lagi memenuhi aturan follow-up."
      );
      continue;
    }

    if (claimed.level > 1) {
      const { data: previousJob } = await supabase
        .from("whatsapp_followup_jobs")
        .select("sent_at")
        .eq("order_id", order.id)
        .eq("level", claimed.level - 1)
        .maybeSingle();

      if (!previousJob?.sent_at) {
        await releaseFollowupJob(supabase, row.id);
        continue;
      }
    }

    const receiver = formatWhatsappPhone(order.buyer_whatsapp, config.formatNumber);
    if (!receiver) {
      await markFollowupCancelled(
        supabase,
        row.id,
        "Nomor WhatsApp order tidak valid untuk follow-up."
      );
      continue;
    }

    const message = resolveWhatsappTemplate(
      levelConfig.template,
      buildWhatsappOrderContext({
        id: order.id,
        orderCode: order.order_code,
        buyerName: order.buyer_name,
        buyerEmail: order.buyer_email,
        buyerWhatsapp: order.buyer_whatsapp,
        productName: order.product_name,
        totalAmount: Number(order.total_amount || 0),
        status: order.status,
        createdAt: order.created_at,
        siteName,
      })
    );

    try {
      await sendWhatsappMessage(config, receiver, message);
      await supabase
        .from("whatsapp_followup_jobs")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          locked_at: null,
          attempts: claimed.attempts + 1,
          error: null,
        })
        .eq("id", row.id);
      processed += 1;
    } catch (error) {
      await handleFollowupSendFailure(supabase, claimed, error);
    }
  }

  return processed;
}

async function processRunningBroadcasts(
  supabase: ServiceSupabase,
  config: WhatsappNotificationConfig,
  siteName: string
) {
  const nowIso = new Date().toISOString();
  const { data: broadcasts } = await supabase
    .from("whatsapp_broadcasts")
    .select("*")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(3);

  let processed = 0;

  for (const broadcast of (broadcasts || []) as BroadcastRow[]) {
    const { data: recipient } = await supabase
      .from("whatsapp_broadcast_recipients")
      .select("*")
      .eq("broadcast_id", broadcast.id)
      .eq("status", "pending")
      .lte("send_after", nowIso)
      .order("sequence_no", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!recipient) {
      await completeBroadcastIfDone(supabase, broadcast.id);
      continue;
    }

    const claimed = await claimBroadcastRecipient(supabase, recipient.id);
    if (!claimed) {
      continue;
    }

    const orderDate = claimed.last_order_date
      ? new Date(claimed.last_order_date).toLocaleString("id-ID")
      : "-";
    const recipientContext: WhatsappBroadcastRecipientContext = {
      customerName: claimed.customer_name,
      customerEmail: claimed.customer_email || "-",
      customerPhone: claimed.customer_phone,
      lastOrderCode: claimed.last_order_code || "-",
      lastOrderDate: orderDate,
      lastOrderTotal: new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(Number(claimed.last_order_total || 0)),
      siteTitle: siteName,
    };

    const message = processWhatsappSpintax(
      resolveBroadcastTemplate(broadcast.template, recipientContext)
    );

    try {
      if (broadcast.template.trim()) {
        await sendWhatsappMessage(config, claimed.customer_phone, message);
      }

      const imageUrl = resolveBroadcastMediaUrl(
        broadcast.image_url || "",
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      );
      if (broadcast.send_image && imageUrl) {
        await sendWhatsappImage(config, claimed.customer_phone, imageUrl, "");
      }

      const videoUrl = resolveBroadcastMediaUrl(
        broadcast.video_url || "",
        process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
      );
      if (broadcast.send_video && videoUrl) {
        await sendWhatsappVideo(config, claimed.customer_phone, videoUrl, "");
      }

      await supabase
        .from("whatsapp_broadcast_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: claimed.attempts + 1,
          error: null,
        })
        .eq("id", claimed.id);

      await supabase
        .from("whatsapp_broadcasts")
        .update({
          sent_count: broadcast.sent_count + 1,
          current_index: claimed.sequence_no,
          last_processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", broadcast.id);

      const delayMs =
        randomInt(
          Math.max(1, Number(broadcast.min_delay_seconds || 1)),
          Math.max(
            Math.max(1, Number(broadcast.min_delay_seconds || 1)),
            Math.max(1, Number(broadcast.max_delay_seconds || 1))
          )
        ) * 1000;
      await scheduleNextBroadcastRecipient(
        supabase,
        broadcast.id,
        claimed.sequence_no,
        new Date(Date.now() + delayMs).toISOString()
      );

      processed += 1;
    } catch (error) {
      await handleBroadcastSendFailure(supabase, broadcast, claimed, error);
    }
  }

  return processed;
}

async function claimFollowupJob(supabase: ServiceSupabase, jobId: string) {
  const { data } = await supabase
    .from("whatsapp_followup_jobs")
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  return (data || null) as FollowupJobRow | null;
}

async function releaseFollowupJob(supabase: ServiceSupabase, jobId: string) {
  await supabase
    .from("whatsapp_followup_jobs")
    .update({
      status: "pending",
      locked_at: null,
    })
    .eq("id", jobId);
}

async function markFollowupCancelled(
  supabase: ServiceSupabase,
  jobId: string,
  reason: string
) {
  await supabase
    .from("whatsapp_followup_jobs")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      locked_at: null,
      error: reason,
    })
    .eq("id", jobId);
}

async function handleFollowupSendFailure(
  supabase: ServiceSupabase,
  job: FollowupJobRow,
  error: unknown
) {
  const attempts = job.attempts + 1;
  const message =
    error instanceof Error ? error.message : "Gagal mengirim follow-up WhatsApp.";

  if (attempts < MAX_SEND_ATTEMPTS) {
    await supabase
      .from("whatsapp_followup_jobs")
      .update({
        status: "pending",
        scheduled_for: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
        attempts,
        locked_at: null,
        error: message,
      })
      .eq("id", job.id);
    return;
  }

  await supabase
    .from("whatsapp_followup_jobs")
    .update({
      status: "failed",
      attempts,
      locked_at: null,
      error: message,
    })
    .eq("id", job.id);
}

async function claimBroadcastRecipient(
  supabase: ServiceSupabase,
  recipientId: string
) {
  const { data } = await supabase
    .from("whatsapp_broadcast_recipients")
    .update({
      status: "processing",
    })
    .eq("id", recipientId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  return (data || null) as BroadcastRecipientRow | null;
}

async function handleBroadcastSendFailure(
  supabase: ServiceSupabase,
  broadcast: BroadcastRow,
  recipient: BroadcastRecipientRow,
  error: unknown
) {
  const attempts = recipient.attempts + 1;
  const message =
    error instanceof Error ? error.message : "Gagal mengirim pesan broadcast.";

  if (attempts < MAX_SEND_ATTEMPTS) {
    await supabase
      .from("whatsapp_broadcast_recipients")
      .update({
        status: "pending",
        send_after: new Date(Date.now() + BROADCAST_RETRY_DELAY_MS).toISOString(),
        attempts,
        error: message,
      })
      .eq("id", recipient.id);

    await supabase
      .from("whatsapp_broadcasts")
      .update({
        last_error: message,
        last_processed_at: new Date().toISOString(),
      })
      .eq("id", broadcast.id);
    return;
  }

  await supabase
    .from("whatsapp_broadcast_recipients")
    .update({
      status: "failed",
      attempts,
      error: message,
    })
    .eq("id", recipient.id);

  await supabase
    .from("whatsapp_broadcasts")
    .update({
      failed_count: broadcast.failed_count + 1,
      current_index: recipient.sequence_no,
      last_error: message,
      last_processed_at: new Date().toISOString(),
    })
    .eq("id", broadcast.id);

  const delayMs =
    randomInt(
      Math.max(1, Number(broadcast.min_delay_seconds || 1)),
      Math.max(
        Math.max(1, Number(broadcast.min_delay_seconds || 1)),
        Math.max(1, Number(broadcast.max_delay_seconds || 1))
      )
    ) * 1000;
  await scheduleNextBroadcastRecipient(
    supabase,
    broadcast.id,
    recipient.sequence_no,
    new Date(Date.now() + delayMs).toISOString()
  );
}

async function scheduleNextBroadcastRecipient(
  supabase: ServiceSupabase,
  broadcastId: string,
  currentSequence: number,
  nextDueIso: string
) {
  const { data: nextRecipient } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("id")
    .eq("broadcast_id", broadcastId)
    .eq("status", "pending")
    .gt("sequence_no", currentSequence)
    .order("sequence_no", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextRecipient) {
    await completeBroadcastIfDone(supabase, broadcastId);
    return;
  }

  await supabase
    .from("whatsapp_broadcast_recipients")
    .update({
      send_after: nextDueIso,
    })
    .eq("id", nextRecipient.id);
}

async function completeBroadcastIfDone(
  supabase: ServiceSupabase,
  broadcastId: string
) {
  const [{ count: pendingCount }, { count: processingCount }] = await Promise.all([
    supabase
      .from("whatsapp_broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "pending"),
    supabase
      .from("whatsapp_broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcastId)
      .eq("status", "processing"),
  ]);

  if ((pendingCount || 0) === 0 && (processingCount || 0) === 0) {
    await supabase
      .from("whatsapp_broadcasts")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", broadcastId)
      .eq("status", "running");
  }
}

function randomInt(min: number, max: number) {
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shouldRunAutomationLoop() {
  const mode = (process.env.WHATSAPP_AUTOMATION_MODE || "hybrid").trim().toLowerCase();
  return mode === "loop" || mode === "hybrid";
}
