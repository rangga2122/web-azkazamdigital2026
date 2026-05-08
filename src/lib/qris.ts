import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import QRCode from "qrcode";

type TlvItem = {
  id: string;
  value: string;
};

const payloadCache = new Map<string, string>();
const svgCache = new Map<string, string>();

export async function createDynamicQrisSvgFromSource(
  sourceUrl: string,
  amount: number
) {
  const normalizedSource = sourceUrl.trim();
  const normalizedAmount = normalizeQrisAmount(amount);
  const cacheKey = `${normalizedSource}::${normalizedAmount}`;
  const cached = svgCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const basePayload = await decodeQrisPayloadFromImageUrl(sourceUrl);
  const dynamicPayload = buildDynamicQrisPayload(basePayload, amount);
  const svg = await QRCode.toString(dynamicPayload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });

  svgCache.set(cacheKey, svg);
  return svg;
}

export async function createQrisSvgFromPayload(payload: string) {
  const normalizedPayload = String(payload || "").trim();
  if (!normalizedPayload) {
    throw new Error("Payload QRIS kosong.");
  }

  return QRCode.toString(normalizedPayload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });
}

export async function decodeQrisPayloadFromImageUrl(sourceUrl: string) {
  const normalizedSource = sourceUrl.trim();
  if (!normalizedSource) {
    throw new Error("Sumber QRIS belum diatur.");
  }

  const cached = payloadCache.get(normalizedSource);
  if (cached) return cached;

  const imageBuffer = await readQrisImage(normalizedSource);
  const pngBuffer = await sharp(imageBuffer).png().toBuffer();
  const png = PNG.sync.read(pngBuffer);
  const decoded = jsQR(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height
  );

  if (!decoded?.data) {
    throw new Error("QRIS tidak bisa dibaca dari gambar yang diunggah.");
  }

  payloadCache.set(normalizedSource, decoded.data);
  return decoded.data;
}

export function buildDynamicQrisPayload(basePayload: string, amount: number) {
  const normalizedAmount = normalizeQrisAmount(amount);
  const items = parseTlvPayload(basePayload).filter((item) => item.id !== "63");
  const nextItems = upsertTlvItem(items, "01", "12");
  const withCurrency = upsertTlvItem(nextItems, "53", "360");
  const withAmount = upsertTlvItem(withCurrency, "54", normalizedAmount);
  const payloadWithoutCrc = `${serializeTlv(withAmount)}6304`;
  const crc = crc16Ccitt(payloadWithoutCrc);

  return `${payloadWithoutCrc}${crc}`;
}

function normalizeQrisAmount(amount: number) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Nominal QRIS tidak valid.");
  }

  const rounded = Math.round(numericAmount);
  return String(rounded);
}

async function readQrisImage(sourceUrl: string) {
  if (/^https?:\/\//i.test(sourceUrl)) {
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Gagal mengambil gambar QRIS (${response.status}).`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  if (!sourceUrl.startsWith("/")) {
    throw new Error("URL QRIS harus berupa path publik atau URL penuh.");
  }

  const localPath = path.join(
    process.cwd(),
    "public",
    sourceUrl.replace(/^\/+/, "")
  );
  return fs.readFile(localPath);
}

function parseTlvPayload(payload: string) {
  const items: TlvItem[] = [];
  let cursor = 0;

  while (cursor + 4 <= payload.length) {
    const id = payload.slice(cursor, cursor + 2);
    const length = Number.parseInt(payload.slice(cursor + 2, cursor + 4), 10);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;

    if (!Number.isFinite(length) || valueEnd > payload.length) {
      throw new Error("Payload QRIS tidak valid.");
    }

    items.push({
      id,
      value: payload.slice(valueStart, valueEnd),
    });

    cursor = valueEnd;
  }

  return items;
}

function serializeTlv(items: TlvItem[]) {
  return items
    .map((item) => `${item.id}${item.value.length.toString().padStart(2, "0")}${item.value}`)
    .join("");
}

function upsertTlvItem(items: TlvItem[], id: string, value: string) {
  const nextItems = [...items];
  const index = nextItems.findIndex((item) => item.id === id);

  if (index >= 0) {
    nextItems[index] = { id, value };
    return nextItems;
  }

  const insertAfter =
    id === "54"
      ? nextItems.findIndex((item) => item.id === "53")
      : id === "53"
        ? nextItems.findIndex((item) => item.id === "52")
        : -1;

  if (insertAfter >= 0) {
    nextItems.splice(insertAfter + 1, 0, { id, value });
    return nextItems;
  }

  nextItems.push({ id, value });
  return nextItems;
}

function crc16Ccitt(input: string) {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}
