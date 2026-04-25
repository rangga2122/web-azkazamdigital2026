import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  getWhatsappNotificationConfig,
  listWhatsappDevices,
  serializeWhatsappNotificationConfig,
  type WhatsappNotificationConfig,
} from "@/lib/whatsapp-notifications";

export async function POST(request: NextRequest) {
  try {
    const sessionSupabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: admin } = await sessionSupabase
      .from("admins")
      .select("id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      config?: Partial<WhatsappNotificationConfig>;
    };

    const serviceSupabase = await createServiceRoleClient();
    const { data: settings, error } = await serviceSupabase
      .from("site_settings")
      .select("site_name, whatsapp_number, social_links")
      .limit(1)
      .single();

    if (error || !settings) {
      return NextResponse.json(
        { error: "Pengaturan situs tidak ditemukan." },
        { status: 404 }
      );
    }

    const storedConfig = getWhatsappNotificationConfig(
      settings.social_links as Record<string, unknown> | null,
      settings.whatsapp_number
    );

    const config = body.config
      ? {
          ...storedConfig,
          ...serializeWhatsappNotificationConfig({
            ...storedConfig,
            ...body.config,
          } as WhatsappNotificationConfig),
        }
      : storedConfig;

    if (!config.apiUrl.trim() || !config.apiUsername.trim() || !config.apiPassword.trim()) {
      return NextResponse.json(
        { error: "Konfigurasi API WhatsApp belum lengkap." },
        { status: 400 }
      );
    }

    const devices = await listWhatsappDevices(config);

    return NextResponse.json({
      success: true,
      provider: config.provider,
      devices,
    });
  } catch (error) {
    console.error("WhatsApp devices route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat memuat device WhatsApp.",
      },
      { status: 500 }
    );
  }
}
