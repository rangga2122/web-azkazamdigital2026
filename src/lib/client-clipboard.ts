"use client";

export async function copyTextToClipboard(text: string) {
  const normalizedText = String(text || "");

  if (!normalizedText) {
    throw new Error("Teks yang akan disalin kosong.");
  }

  if (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(normalizedText);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard tidak tersedia di perangkat ini.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = normalizedText;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  textArea.style.opacity = "0";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, normalizedText.length);

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Browser menolak proses salin.");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
