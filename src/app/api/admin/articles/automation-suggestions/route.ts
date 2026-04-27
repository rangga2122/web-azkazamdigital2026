import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateAutomationSuggestions } from "@/lib/article-ai";

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
