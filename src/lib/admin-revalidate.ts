"use client";

type AdminRevalidateInput = {
  paths?: string[];
  tags?: string[];
};

export async function triggerAdminRevalidation(input: AdminRevalidateInput) {
  const paths = sanitizeStrings(input.paths);
  const tags = sanitizeStrings(input.tags);

  if (paths.length === 0 && tags.length === 0) {
    return;
  }

  const response = await fetch("/api/admin/revalidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paths, tags }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Gagal menyegarkan cache publik.");
  }
}

function sanitizeStrings(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}
