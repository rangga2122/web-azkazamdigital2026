import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { createDynamicQrisSvgFromSource } from "@/lib/qris";
import { getSiteUrl } from "@/lib/site-url";
import { formatPrice } from "@/lib/utils";

type BaseEmailPayload = {
  buyerName: string;
  buyerEmail: string;
  productName: string;
  orderCode: string;
  totalAmount: number;
  siteName: string;
  supportEmail: string | null;
};

type PaymentInstructions = {
  provider?: "manual" | "pakasir";
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  qrisUrl: string | null;
  qrisSourceUrl?: string | null;
  qrisAmount?: number | null;
  gatewayFee?: number | null;
  totalPayAmount?: number | null;
};

type OrderInvoiceEmailPayload = BaseEmailPayload & {
  subtotal: number;
  discountAmount: number;
  uniqueCode: number;
  thankYouUrl: string;
  whatsappConfirmationUrl: string;
  payment: PaymentInstructions;
};

type PaidOrderEmailPayload = BaseEmailPayload & {
  dashboardUrl: string;
  loginUrl: string;
  registerUrl: string;
  invoiceUrl: string;
  affiliateCode: string | null;
  loginEmail: string;
  defaultPassword: string | null;
  accessSubject?: string | null;
  accountCreatedAutomatically: boolean;
  accessMessage?: string | null;
};

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

function money(value: number) {
  return formatPrice(Number(value || 0));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFromAddress(siteName: string, supportEmail: string | null) {
  const fromName = process.env.SMTP_FROM_NAME || siteName;
  const fromEmail =
    process.env.SMTP_FROM_EMAIL || supportEmail || undefined;

  if (!fromEmail) {
    throw new Error("SMTP_FROM_EMAIL or site support email is required.");
  }

  return {
    fromName,
    fromEmail,
  };
}

function absoluteUrl(url: string | null) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;

  return new URL(url, getSiteUrl()).toString();
}

function formatMultilineHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function getContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "image/webp";
}

async function resolveInlineQrisImage(payment: PaymentInstructions) {
  const cid = "payment-qris@azkazamdigital";
  const qrisSourceUrl = payment.qrisSourceUrl?.trim() || null;
  const qrisAmount = Number(payment.qrisAmount || 0);
  const qrisUrl = payment.qrisUrl;

  try {
    if (qrisSourceUrl && Number.isFinite(qrisAmount) && qrisAmount > 0) {
      const svg = await createDynamicQrisSvgFromSource(qrisSourceUrl, qrisAmount);

      return {
        cid,
        attachment: {
          filename: "qris-dynamic.svg",
          content: Buffer.from(svg, "utf-8"),
          contentType: "image/svg+xml",
          cid,
        },
      };
    }

    if (!qrisUrl) return null;

    if (/^https?:\/\//i.test(qrisUrl)) {
      const response = await fetch(qrisUrl);
      if (!response.ok) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      const remoteUrl = new URL(qrisUrl);
      const fileName = path.basename(remoteUrl.pathname) || "qris-image";

      return {
        cid,
        attachment: {
          filename: fileName,
          content: buffer,
          contentType: getContentType(fileName),
          cid,
        },
      };
    }

    if (qrisUrl.startsWith("/")) {
      const localPath = path.join(process.cwd(), "public", qrisUrl.replace(/^\/+/, ""));
      const content = await fs.readFile(localPath);
      const fileName = path.basename(localPath);

      return {
        cid,
        attachment: {
          filename: fileName,
          content,
          contentType: getContentType(fileName),
          cid,
        },
      };
    }
  } catch (error) {
    console.error("Resolve inline QRIS image error:", error);
  }

  return null;
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== "false",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    );
  }

  return transporterPromise;
}

export async function verifySmtpConnection() {
  const transporter = await getTransporter();
  return transporter.verify();
}

export async function sendOrderInvoiceEmail(payload: OrderInvoiceEmailPayload) {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error("SMTP configuration is incomplete.");
  }

  const transporter = await getTransporter();
  const { fromName, fromEmail } = getFromAddress(
    payload.siteName,
    payload.supportEmail
  );
  const paymentProvider = payload.payment.provider === "pakasir" ? "pakasir" : "manual";
  const gatewayFee = Math.max(Number(payload.payment.gatewayFee || 0), 0);
  const totalPayAmount = Number(payload.payment.totalPayAmount || payload.totalAmount || 0);
  const qrisUrl = absoluteUrl(payload.payment.qrisUrl);
  const inlineQrisImage = await resolveInlineQrisImage(payload.payment);
  const qrisImageSource = inlineQrisImage ? `cid:${inlineQrisImage.cid}` : qrisUrl;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
        <h1 style="margin:0 0 16px;color:#0f172a;font-size:24px;">Invoice pesanan Anda</h1>
        <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.6;">
          Halo ${escapeHtml(payload.buyerName)}, pesanan untuk
          <strong>${escapeHtml(payload.productName)}</strong> sudah kami terima dan saat ini menunggu pembayaran.
        </p>
        <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0 0 8px;color:#475569;font-size:13px;">Kode order</p>
          <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">${escapeHtml(payload.orderCode)}</p>
          <p style="margin:0 0 8px;color:#475569;font-size:13px;">Total pembayaran</p>
          <p style="margin:0;color:#dc2626;font-size:24px;font-weight:800;">${money(totalPayAmount)}</p>
        </div>

        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;">Subtotal</td>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:right;font-weight:600;">${money(payload.subtotal)}</td>
          </tr>
          ${
            payload.discountAmount > 0
              ? `<tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;">Diskon</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#16a34a;text-align:right;font-weight:600;">-${money(payload.discountAmount)}</td>
                </tr>`
              : ""
          }
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;">Kode unik</td>
            <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:right;font-weight:600;">${money(payload.uniqueCode)}</td>
          </tr>
          ${
            gatewayFee > 0
              ? `<tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;">Biaya QRIS</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;text-align:right;font-weight:600;">${money(gatewayFee)}</td>
                </tr>`
              : ""
          }
          <tr>
            <td style="padding:14px 0 0;color:#0f172a;font-weight:700;">Total transfer</td>
            <td style="padding:14px 0 0;color:#0f172a;text-align:right;font-weight:800;">${money(totalPayAmount)}</td>
          </tr>
        </table>

        ${
          paymentProvider === "manual"
            ? `<div style="margin:0 0 20px;padding:16px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;">
                <h2 style="margin:0 0 12px;color:#1d4ed8;font-size:16px;">Transfer ke rekening</h2>
                <p style="margin:0 0 6px;color:#0f172a;font-size:14px;"><strong>${escapeHtml(payload.payment.bankName || "-")}</strong></p>
                <p style="margin:0 0 6px;color:#dc2626;font-size:20px;font-weight:800;">${escapeHtml(payload.payment.accountNumber || "-")}</p>
                <p style="margin:0;color:#475569;font-size:13px;">a.n. ${escapeHtml(payload.payment.accountName || "-")}</p>
              </div>`
            : ""
        }

        ${
          qrisImageSource
            ? `<div style="margin:0 0 20px;padding:16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
                <h2 style="margin:0 0 12px;color:#0f172a;font-size:16px;">${paymentProvider === "pakasir" ? "Bayar dengan QRIS Otomatis" : "Bayar dengan QRIS"}</h2>
                <p style="margin:0 0 12px;color:#475569;font-size:13px;">${paymentProvider === "pakasir" ? "Scan QRIS berikut untuk membayar pesanan Anda. Nilai pembayaran akan terisi otomatis." : "Scan QRIS berikut atau buka link gambar jika email Anda memblokir gambar."}</p>
                <div style="margin:0 0 12px;text-align:center;">
                  <img src="${qrisImageSource}" alt="QRIS pembayaran" style="max-width:220px;width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0;background:#ffffff;padding:8px;" />
                </div>
                ${
                  qrisUrl
                    ? `<a href="${qrisUrl}" style="color:#2563eb;font-weight:700;">Buka gambar QRIS</a>`
                    : ""
                }
              </div>`
            : ""
        }

        <div style="margin:24px 0 8px;">
          <a href="${payload.thankYouUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;margin-right:8px;">
            Lihat Invoice
          </a>
          <a href="${payload.whatsappConfirmationUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
            Konfirmasi via WhatsApp
          </a>
        </div>

        <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
          Setelah transfer, balas email ini atau klik tombol konfirmasi WhatsApp. Begitu pembayaran diterima, kami akan otomatis mengirim email konfirmasi dan link dashboard afiliasi Anda.
        </p>
        ${
          payload.supportEmail
            ? `<p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:1.6;">Butuh bantuan? Balas email ini atau hubungi ${escapeHtml(payload.supportEmail)}.</p>`
            : ""
        }
      </div>
    </div>
  `;

  const text = [
    `Halo ${payload.buyerName},`,
    "",
    `Pesanan ${payload.productName} sudah kami terima.`,
    `Kode order: ${payload.orderCode}`,
    `Subtotal: ${money(payload.subtotal)}`,
    payload.discountAmount > 0 ? `Diskon: -${money(payload.discountAmount)}` : null,
    `Kode unik: ${money(payload.uniqueCode)}`,
    gatewayFee > 0 ? `Biaya QRIS: ${money(gatewayFee)}` : null,
    `Total transfer: ${money(totalPayAmount)}`,
    "",
    paymentProvider === "manual"
      ? `Rekening: ${payload.payment.bankName || "-"} / ${payload.payment.accountNumber || "-"} / ${payload.payment.accountName || "-"}`
      : "Metode bayar: QRIS otomatis",
    payload.payment.qrisUrl ? `QRIS: ${absoluteUrl(payload.payment.qrisUrl)}` : null,
    `Invoice: ${payload.thankYouUrl}`,
    `Konfirmasi WhatsApp: ${payload.whatsappConfirmationUrl}`,
    "",
    "Setelah pembayaran diterima, kami akan kirim email konfirmasi dan link dashboard afiliasi Anda.",
  ]
    .filter(Boolean)
    .join("\n");

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: payload.buyerEmail,
    subject: `Invoice pesanan ${payload.orderCode} - ${payload.productName}`,
    text,
    html,
    attachments: inlineQrisImage ? [inlineQrisImage.attachment] : [],
  });
}

export async function sendPaidOrderEmail(payload: PaidOrderEmailPayload) {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error("SMTP configuration is incomplete.");
  }

  const transporter = await getTransporter();
  const { fromName, fromEmail } = getFromAddress(
    payload.siteName,
    payload.supportEmail
  );

  const affiliateSection = payload.affiliateCode
    ? `
      <p style="margin:16px 0 0;color:#0f172a;font-size:14px;line-height:1.6;">
        Username afiliasi Anda sudah aktif dengan kode
        <strong>${escapeHtml(payload.affiliateCode)}</strong>.
      </p>
    `
    : "";

  const loginSection = payload.accountCreatedAutomatically
    ? `
      <div style="margin:20px 0;padding:16px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;">
        <h2 style="margin:0 0 12px;color:#1d4ed8;font-size:16px;">Akun login otomatis sudah dibuat</h2>
        <p style="margin:0 0 8px;color:#0f172a;font-size:14px;">Email login: <strong>${escapeHtml(payload.loginEmail)}</strong></p>
        <p style="margin:0;color:#0f172a;font-size:14px;">Password default: <strong>${escapeHtml(payload.defaultPassword || "-")}</strong></p>
      </div>
    `
    : `
      <p style="margin:16px 0 0;color:#0f172a;font-size:14px;line-height:1.6;">
        Login menggunakan email pembelian Anda:
        <strong>${escapeHtml(payload.loginEmail)}</strong>
      </p>
    `;

  const accessMessage = String(payload.accessMessage || "").trim();
  const accessSection = accessMessage
    ? `
      <div style="margin:20px 0;padding:16px;border-radius:10px;background:#ecfeff;border:1px solid #a5f3fc;">
        <h2 style="margin:0 0 12px;color:#0f766e;font-size:16px;">Akses Produk</h2>
        <p style="margin:0;color:#0f172a;font-size:14px;line-height:1.7;">${formatMultilineHtml(accessMessage)}</p>
      </div>
    `
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
        <h1 style="margin:0 0 16px;color:#0f172a;font-size:24px;">Pesanan Anda sudah kami terima</h1>
        <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.6;">
          Halo ${escapeHtml(payload.buyerName)}, pembayaran untuk <strong>${escapeHtml(payload.productName)}</strong> sudah berhasil diverifikasi.
        </p>
        <div style="margin:20px 0;padding:16px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;">
          <p style="margin:0 0 8px;color:#475569;font-size:13px;">Kode order</p>
          <p style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">${escapeHtml(payload.orderCode)}</p>
          <p style="margin:0 0 8px;color:#475569;font-size:13px;">Total pembayaran</p>
          <p style="margin:0;color:#0f172a;font-size:16px;font-weight:700;">${money(payload.totalAmount)}</p>
        </div>
        <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.6;">
          Produk Anda sudah aktif, dan dashboard afiliasi Anda siap digunakan.
        </p>
        ${affiliateSection}
        ${loginSection}
        ${accessSection}
        <div style="margin:24px 0 8px;">
          <a href="${payload.invoiceUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;margin-right:8px;">
            Buka Invoice
          </a>
          <a href="${payload.dashboardUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;margin-right:8px;">
            Buka Dashboard Afiliasi
          </a>
          <a href="${payload.loginUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;">
            Login
          </a>
        </div>
        ${
          payload.accountCreatedAutomatically
            ? `<p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                 Setelah berhasil login, Anda bisa mengganti password default dari dashboard profil.
               </p>`
            : `<p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
                 Jika Anda belum pernah membuat password untuk email ini, silakan klaim akun melalui
                 <a href="${payload.registerUrl}" style="color:#2563eb;">halaman pendaftaran afiliasi</a>.
               </p>`
        }
        <p style="margin:12px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
          Dashboard: <a href="${payload.dashboardUrl}" style="color:#2563eb;">${payload.dashboardUrl}</a>
        </p>
        ${
          payload.supportEmail
            ? `<p style="margin:20px 0 0;color:#64748b;font-size:13px;">Butuh bantuan? Balas email ini atau hubungi ${escapeHtml(payload.supportEmail)}.</p>`
            : ""
        }
      </div>
    </div>
  `;

  const text = [
    `Halo ${payload.buyerName},`,
    "",
    `Pembayaran untuk ${payload.productName} sudah berhasil diverifikasi.`,
    `Kode order: ${payload.orderCode}`,
    `Total: ${money(payload.totalAmount)}`,
    `Invoice: ${payload.invoiceUrl}`,
    "",
    "Pesanan Anda sudah kami terima dan produk sudah aktif.",
    "Dashboard afiliasi Anda juga sudah siap digunakan.",
    payload.affiliateCode
      ? `Kode afiliasi Anda: ${payload.affiliateCode}`
      : null,
    `Email login: ${payload.loginEmail}`,
    payload.accountCreatedAutomatically && payload.defaultPassword
      ? `Password default: ${payload.defaultPassword}`
      : "Gunakan password akun Anda yang sudah ada.",
    accessMessage ? "" : null,
    accessMessage ? "Akses produk:" : null,
    accessMessage || null,
    `Dashboard: ${payload.dashboardUrl}`,
    `Login: ${payload.loginUrl}`,
    !payload.accountCreatedAutomatically
      ? `Klaim akun / buat password: ${payload.registerUrl}`
      : "Setelah login, segera ganti password default Anda di dashboard profil.",
    payload.supportEmail ? `Bantuan: ${payload.supportEmail}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: payload.buyerEmail,
    subject:
      payload.accessSubject?.trim() ||
      `Pembayaran diterima - ${payload.productName}`,
    text,
    html,
  });
}
