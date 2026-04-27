import { NextRequest, NextResponse } from "next/server";
import { processScheduledArticleGeneration } from "@/lib/article-automation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  try {
    const expectedSecret = process.env.ARTICLE_AUTOMATION_CRON_SECRET?.trim();
    if (!expectedSecret) {
      return NextResponse.json(
        { error: "ARTICLE_AUTOMATION_CRON_SECRET belum diset." },
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

    const result = await processScheduledArticleGeneration();

    return NextResponse.json({
      triggeredAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Article cron route error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memproses cron artikel.",
      },
      { status: 500 }
    );
  }
}
