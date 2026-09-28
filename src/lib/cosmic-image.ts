const COSMIC_MCP_URL =
  process.env.COSMIC_MCP_URL?.trim() || "https://gen.azkazamdigital.com/mcp";
const COSMIC_MCP_KEY = process.env.COSMIC_MCP_KEY?.trim() || "";

let cosmicSessionId: string | null = null;

async function cosmicHandshake(): Promise<string | null> {
  if (!COSMIC_MCP_KEY) return null;

  const res = await fetch(COSMIC_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${COSMIC_MCP_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "azkazam-article-image", version: "1.0.0" },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(
      `Cosmic MCP handshake gagal dengan status ${res.status}.`
    );
  }

  const sessionId = res.headers.get("mcp-session-id");
  if (sessionId) {
    cosmicSessionId = sessionId;
    await fetch(COSMIC_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${COSMIC_MCP_KEY}`,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  }
  return sessionId ?? cosmicSessionId;
}

async function callCosmicTool(
  name: string,
  args: Record<string, unknown>,
  timeoutMs = 120000
): Promise<string> {
  if (!COSMIC_MCP_KEY) {
    throw new Error("COSMIC_MCP_KEY belum diset di environment.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${COSMIC_MCP_KEY}`,
  };

  let sessionId = cosmicSessionId;
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  let res = await fetch(COSMIC_MCP_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 404 || res.status === 400) {
    // Sesi kedaluwarsa -> handshake ulang sekali
    sessionId = await cosmicHandshake();
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    res = await fetch(COSMIC_MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  if (!res.ok) {
    throw new Error(`Permintaan ke Cosmic MCP gagal dengan status ${res.status}.`);
  }

  const payload = (await res.json().catch(() => null)) as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message?: string };
  } | null;

  if (!res.ok || payload?.error) {
    cosmicSessionId = null;
    throw new Error(
      payload?.error?.message ||
        `Permintaan ke Cosmic MCP gagal dengan status ${res.status}.`
    );
  }

  const text = (payload?.result?.content || [])
    .map((item) => item.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Respons Cosmic MCP tidak berisi konten.");
  }
  return text;
}

function slugifyFileName(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "artikel"
  );
}

/**
 * Generate gambar cover artikel via Cosmic MCP lalu simpan ke public/uploads.
 * Mengembalikan URL publik (mis. https://www.azkazamdigital.com/uploads/xxx.jpg)
 * atau null bila gagal (artikel tetap lanjut tanpa cover).
 */
export async function generateAndSaveCoverImage(options: {
  title: string;
  slug: string;
  baseUrl?: string;
}): Promise<string | null> {
  try {
    if (!COSMIC_MCP_KEY) return null;

    if (!cosmicSessionId) {
      await cosmicHandshake();
    }

    const prompt = `Ilustrasi blog profesional untuk artikel berjudul "${options.title}". 
Gambar relevan dengan topik artikel, gaya flat illustration premium modern, komposisi bersih 16:9 untuk cover blog teknologi Indonesia, tanpa teks atau kata apapun di dalam gambar.`;

    const text = await callCosmicTool("generate_image", {
      prompt,
      aspect_ratio: "16:9",
    });

    const match = text.match(/https?:\/\/\S+/);
    if (!match) return null;
    const artifactUrl = match[0];

    const imgRes = await fetch(artifactUrl, { signal: AbortSignal.timeout(60000) });
    if (!imgRes.ok) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    if (buffer.length < 10000) return null;

    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const fileName = `auto-${slugifyFileName(options.slug)}-${Date.now()}.jpg`;
    await writeFile(path.join(uploadDir, fileName), buffer);

    const baseUrl = (
      options.baseUrl ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://www.azkazamdigital.com"
    ).replace(/\/+$/, "");
    return `${baseUrl}/uploads/${fileName}`;
  } catch {
    // Gambar gagal tidak boleh menggagalkan artikel
    return null;
  }
}
