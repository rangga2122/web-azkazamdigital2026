import { NextRequest, NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import {
  formatWhatsappPhone,
  getWhatsappNotificationConfig,
  serializeWhatsappNotificationConfig,
  sendWhatsappImage,
  sendWhatsappMessage,
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

    const body = (await request.json()) as {
      number?: string;
      config?: Partial<WhatsappNotificationConfig>;
    };
    if (!body.number?.trim()) {
      return NextResponse.json(
        { error: "Nomor tujuan tes wajib diisi." },
        { status: 400 }
      );
    }

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

    if (!config.enabled) {
      return NextResponse.json(
        { error: "Notifikasi WhatsApp belum diaktifkan." },
        { status: 400 }
      );
    }

    const receiver = formatWhatsappPhone(body.number, config.formatNumber);
    if (!receiver) {
      return NextResponse.json(
        { error: "Nomor tujuan tes tidak valid." },
        { status: 400 }
      );
    }

    const message = [
      `Halo, ini adalah tes notifikasi WhatsApp dari ${settings.site_name || "AzkazamDigital"}.`,
      "",
      "Jika pesan ini masuk, berarti integrasi GOWA di aplikasi sudah terhubung.",
    ].join("\n");

    const messageResult = await sendWhatsappMessage(config, receiver, message);
    let imageResult: unknown = null;

    if (config.enableImage && config.defaultImageUrl) {
      const imageUrl = /^https?:\/\//i.test(config.defaultImageUrl)
        ? config.defaultImageUrl
        : new URL(config.defaultImageUrl, request.nextUrl.origin).toString();

      imageResult = await sendWhatsappImage(config, receiver, imageUrl, "Tes gambar WhatsApp");
    }

    return NextResponse.json({
      success: true,
      messageResult,
      imageResult,
    });
  } catch (error) {
    console.error("WhatsApp test route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Terjadi kesalahan saat mengirim tes WhatsApp.",
      },
      { status: 500 }
    );
  }
}
