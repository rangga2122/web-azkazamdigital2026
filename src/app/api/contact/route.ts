import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

type ContactPayload = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  source_path?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ContactPayload;
    const name = body.name?.trim() || "";
    const email = body.email?.trim().toLowerCase() || "";
    const subject = body.subject?.trim() || "";
    const message = body.message?.trim() || "";
    const sourcePath = body.source_path?.trim() || "/kontak";

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "Semua field wajib diisi." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Format email tidak valid." },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from("contact_messages").insert({
      name,
      email,
      subject,
      message,
      source_path: sourcePath,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Pesan gagal dikirim." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Pesan berhasil dikirim. Tim kami akan segera menghubungi Anda.",
    });
  } catch (error) {
    console.error("Contact submit error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat mengirim pesan." },
      { status: 500 }
    );
  }
}
