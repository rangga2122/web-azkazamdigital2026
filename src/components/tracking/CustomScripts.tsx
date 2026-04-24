import { createServiceRoleClient } from "@/lib/supabase/server";

export async function CustomScripts({
  position,
}: {
  position: "head" | "body";
}) {
  let script = "";

  try {
    const supabase = await createServiceRoleClient();
    const column =
      position === "head" ? "custom_head_script" : "custom_body_script";
    const { data } = await supabase
      .from("site_settings")
      .select(column)
      .limit(1)
      .single();

    if (data) {
      script = (data as Record<string, string>)[column] || "";
    }
  } catch {
    // Silently fail if not configured
  }

  if (!script) return null;

  return <div dangerouslySetInnerHTML={{ __html: script }} />;
}
