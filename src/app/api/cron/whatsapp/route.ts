import { NextRequest, NextResponse } from "next/server";
import { processWhatsappAutomationBatch } from "@/lib/whatsapp-automation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  try {
    const expectedSecret = process.env.WHATSAPP_AUTOMATION_CRON_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { error: "WHATSAPP_AUTOMATION_CRON_SECRET belum diset." },
        { status: 500 }
      );
    }

    const providedSecret =
      request.headers.get("x-cron-secret")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      request.nextUrl.searchParams.get("key")?.trim() ||
      "";

    if (!providedSecret || providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized cron request." }, { status: 401 });
    }

    const result = await processWhatsappAutomationBatch();

    return NextResponse.json({
      success: true,
      triggeredAt: new Date().toISOString(),
      mode: "cron",
      ...result,
    });
  } catch (error) {
    console.error("WhatsApp cron route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memproses cron WhatsApp.",
      },
      { status: 500 }
    );
  }
}
