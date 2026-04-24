import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  createWhatsappBroadcast,
  ensureWhatsappAutomationLoop,
  getWhatsappAutomationDashboard,
  pauseWhatsappBroadcast,
  processWhatsappAutomationBatch,
  resumeWhatsappBroadcast,
  stopWhatsappBroadcast,
} from "@/lib/whatsapp-automation";
import {
  getWhatsappNotificationConfig,
  serializeWhatsappNotificationConfig,
  type WhatsappNotificationConfig,
} from "@/lib/whatsapp-notifications";

type AutomationAction =
  | "start-broadcast"
  | "pause-broadcast"
  | "resume-broadcast"
  | "stop-broadcast"
  | "process-now";

export async function GET() {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    ensureWhatsappAutomationLoop();
    const dashboard = await getWhatsappAutomationDashboard();
    return NextResponse.json({ success: true, dashboard });
  } catch (error) {
    console.error("WhatsApp automation GET error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data automasi WhatsApp." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as {
      action?: AutomationAction;
      broadcastId?: string;
      config?: Partial<WhatsappNotificationConfig>;
    };

    if (!body.action) {
      return NextResponse.json({ error: "Aksi automasi tidak valid." }, { status: 400 });
    }

    const serviceSupabase = await createServiceRoleClient();
    const { config } = await resolveStoredConfig(serviceSupabase, body.config);

    ensureWhatsappAutomationLoop();

    if (body.action === "start-broadcast") {
      await createWhatsappBroadcast({
        config,
        createdBy: adminCheck.admin.user_id || null,
      });
    } else if (body.action === "pause-broadcast") {
      if (!body.broadcastId) {
        return NextResponse.json(
          { error: "ID broadcast wajib diisi untuk menjeda." },
          { status: 400 }
        );
      }
      await pauseWhatsappBroadcast(body.broadcastId);
    } else if (body.action === "resume-broadcast") {
      if (!body.broadcastId) {
        return NextResponse.json(
          { error: "ID broadcast wajib diisi untuk melanjutkan." },
          { status: 400 }
        );
      }
      await resumeWhatsappBroadcast(body.broadcastId);
    } else if (body.action === "stop-broadcast") {
      if (!body.broadcastId) {
        return NextResponse.json(
          { error: "ID broadcast wajib diisi untuk menghentikan." },
          { status: 400 }
        );
      }
      await stopWhatsappBroadcast(body.broadcastId);
    }

    const processResult = await processWhatsappAutomationBatch();
    const dashboard = await getWhatsappAutomationDashboard();

    return NextResponse.json({
      success: true,
      processResult,
      dashboard,
    });
  } catch (error) {
    console.error("WhatsApp automation POST error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memproses automasi WhatsApp.",
      },
      { status: 500 }
    );
  }
}

async function requireAdmin() {
  const sessionSupabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await sessionSupabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: admin } = await sessionSupabase
    .from("admins")
    .select("id, user_id, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
  };
}

async function resolveStoredConfig(
  serviceSupabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  draftConfig?: Partial<WhatsappNotificationConfig>
) {
  const { data: settings, error } = await serviceSupabase
    .from("site_settings")
    .select("id, whatsapp_number, social_links")
    .limit(1)
    .single();

  if (error || !settings) {
    throw new Error(error?.message || "Pengaturan situs tidak ditemukan.");
  }

  const storedConfig = getWhatsappNotificationConfig(
    settings.social_links as Record<string, unknown> | null,
    settings.whatsapp_number
  );

  if (!draftConfig) {
    return {
      settings,
      config: storedConfig,
    };
  }

  const mergedConfig = {
    ...storedConfig,
    ...serializeWhatsappNotificationConfig({
      ...storedConfig,
      ...draftConfig,
    } as WhatsappNotificationConfig),
  } as WhatsappNotificationConfig;

  await serviceSupabase
    .from("site_settings")
    .update({
      social_links: {
        ...(settings.social_links || {}),
        whatsapp_notifications: serializeWhatsappNotificationConfig(mergedConfig),
      },
    })
    .eq("id", settings.id);

  return {
    settings,
    config: mergedConfig,
  };
}
