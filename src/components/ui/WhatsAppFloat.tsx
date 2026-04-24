"use client";

import { FaWhatsapp } from "react-icons/fa";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function WhatsAppFloatingButton() {
  const pathname = usePathname();
  const [whatsapp, setWhatsapp] = useState("");
  const [enabled, setEnabled] = useState(false);

  const isProtectedArea =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/affiliate/dashboard") ||
    pathname?.startsWith("/order/") ||
    pathname?.startsWith("/thank-you/") ||
    pathname === "/login";

  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("site_settings")
          .select("whatsapp_number, whatsapp_button_enabled")
          .limit(1)
          .single();

        if (data) {
          setWhatsapp(data.whatsapp_number || "");
          setEnabled(data.whatsapp_button_enabled || false);
        }
      } catch {
        // Fail silently
      }
    }
    loadSettings();
  }, []);

  if (isProtectedArea || !enabled || !whatsapp) return null;

  const url = `https://wa.me/${whatsapp}?text=${encodeURIComponent("Halo! Ada yang bisa dibantu?")}`;

  return (
    <a
      data-whatsapp-float
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-green-500 px-5 py-3.5 text-white shadow-lg shadow-green-500/30 transition-all duration-300 hover:scale-105 hover:bg-green-600 hover:shadow-green-500/50 group"
      aria-label="Chat WhatsApp"
    >
      <FaWhatsapp className="text-2xl" />
      <span className="hidden sm:inline text-sm font-medium">Chat Kami</span>
      {/* Pulse ring */}
      <span className="absolute -inset-1 rounded-full animate-ping bg-green-500/30 group-hover:bg-green-500/50" />
    </a>
  );
}
