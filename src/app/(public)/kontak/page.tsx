import type { Metadata } from "next";
import { FaWhatsapp, FaEnvelope, FaMapMarkerAlt } from "react-icons/fa";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ContactForm } from "@/components/public/ContactForm";

export const metadata: Metadata = {
  title: "Kontak Kami",
  description: "Hubungi tim AzkazamDigital untuk pertanyaan dan dukungan.",
};

export const dynamic = "force-dynamic";

async function getContactSettings() {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("email, whatsapp_number, address, social_links")
      .limit(1)
      .single();
    const socialLinks = (data?.social_links || {}) as Record<string, unknown>;

    return {
      title: getSocialText(socialLinks, "contact_title", "Hubungi Kami"),
      subtitle: getSocialText(
        socialLinks,
        "contact_subtitle",
        "Ada pertanyaan atau butuh bantuan? Tim kami siap membantu Anda."
      ),
      formTitle: getSocialText(socialLinks, "contact_form_title", "Kirim Pesan"),
      buttonLabel: getSocialText(
        socialLinks,
        "contact_button_label",
        "Kirim Pesan"
      ),
      messagePlaceholder: getSocialText(
        socialLinks,
        "contact_message_placeholder",
        "Tulis pesan Anda..."
      ),
      whatsapp: data?.whatsapp_number || "6281234567890",
      email: data?.email || "hello@azkazamdigital.com",
      address: data?.address || "Jakarta, Indonesia",
    };
  } catch {
    return {
      title: "Hubungi Kami",
      subtitle: "Ada pertanyaan atau butuh bantuan? Tim kami siap membantu Anda.",
      formTitle: "Kirim Pesan",
      buttonLabel: "Kirim Pesan",
      messagePlaceholder: "Tulis pesan Anda...",
      whatsapp: "6281234567890",
      email: "hello@azkazamdigital.com",
      address: "Jakarta, Indonesia",
    };
  }
}

export default async function KontakPage() {
  const contact = await getContactSettings();
  const cleanWhatsapp = contact.whatsapp.replace(/\D/g, "") || "6281234567890";

  return (
    <div className="min-h-screen py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {splitGradientTitle(contact.title)}
          </h1>
          <p className="text-dark-400 max-w-xl mx-auto">
            {contact.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            {
              icon: FaWhatsapp,
              title: "WhatsApp",
              value: contact.whatsapp,
              href: `https://wa.me/${cleanWhatsapp}`,
              color: "from-green-500 to-emerald-500",
            },
            {
              icon: FaEnvelope,
              title: "Email",
              value: contact.email,
              href: `mailto:${contact.email}`,
              color: "from-primary-500 to-blue-500",
            },
            {
              icon: FaMapMarkerAlt,
              title: "Alamat",
              value: contact.address,
              href: "#",
              color: "from-accent-500 to-pink-500",
            },
          ].map((item) => (
            <a
              key={item.title}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl p-6 bg-dark-900 border border-dark-800 hover:border-dark-700 transition-all duration-300 hover:-translate-y-1 text-center"
            >
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-r ${item.color} mb-4 shadow-lg transition-transform group-hover:scale-110`}
              >
                <item.icon className="text-white text-2xl" />
              </div>
              <h3 className="text-white font-semibold mb-1">{item.title}</h3>
              <p className="text-dark-400 text-sm">{item.value}</p>
            </a>
          ))}
        </div>

        <ContactForm
          formTitle={contact.formTitle}
          buttonLabel={contact.buttonLabel}
          messagePlaceholder={contact.messagePlaceholder}
        />
      </div>
    </div>
  );
}

function getSocialText(
  socialLinks: Record<string, unknown>,
  key: string,
  fallback: string
) {
  const value = socialLinks[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function splitGradientTitle(title: string) {
  const parts = title.trim().split(/\s+/);
  if (parts.length < 2) return title;
  const last = parts.pop();

  return (
    <>
      {parts.join(" ")} <span className="gradient-text">{last}</span>
    </>
  );
}
