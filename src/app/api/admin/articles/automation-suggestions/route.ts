import { NextRequest, NextResponse } from "next/server";
import { generateAutomationSuggestions } from "@/lib/article-ai";
import { verifyLmAdmin } from "@/lib/lm-admin";

type AutomationSuggestionPayload = {
  topicQueue?: string;
  targetKeywords?: string;
  siteContext?: string;
  avoidTopics?: string;
};

export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as AutomationSuggestionPayload;
    const suggestions = await generateAutomationSuggestions({
      topicQueue: body.topicQueue?.trim() || "",
      targetKeywords: body.targetKeywords?.trim() || "",
      siteContext: body.siteContext?.trim() || "",
      avoidTopics: body.avoidTopics?.trim() || "",
    });

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Automation suggestion generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal membuat saran automasi artikel dengan AI.",
      },
      { status: 500 }
    );
  }
}

async function requireAdmin() {
  const admin = await verifyLmAdmin();

  if (!admin.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    admin,
  };
}
