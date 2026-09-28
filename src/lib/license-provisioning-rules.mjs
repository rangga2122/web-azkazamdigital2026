export function resolveSingleLicenseProductMatch({ mappedProducts, namedProducts }) {
  if (mappedProducts.length === 1) return mappedProducts[0];
  if (mappedProducts.length > 1) {
    throw new Error("Produk katalog terhubung ke lebih dari satu produk lisensi.");
  }
  if (namedProducts.length === 1) return namedProducts[0];
  if (namedProducts.length > 1) {
    throw new Error("Nama produk cocok dengan lebih dari satu produk lisensi.");
  }
  return null;
}

export function resolveNewLicenseExpiryDate({ requestedExpiryDate, defaultExpiryDays, today }) {
  if (requestedExpiryDate) return requestedExpiryDate;
  if (!Number.isFinite(defaultExpiryDays) || defaultExpiryDays <= 0) return null;

  const result = new Date(today);
  result.setDate(result.getDate() + defaultExpiryDays);
  const year = result.getFullYear();
  const month = String(result.getMonth() + 1).padStart(2, "0");
  const day = String(result.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shouldProcessPaidTransition(previousStatus, nextStatus) {
  return previousStatus !== "paid" && nextStatus === "paid";
}
