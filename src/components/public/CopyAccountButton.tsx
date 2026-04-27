"use client";

import { useState } from "react";
import { FaCopy } from "react-icons/fa";

type CopyAccountButtonProps = {
  accountNumber: string | null;
};

export function CopyAccountButton({
  accountNumber,
}: CopyAccountButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!accountNumber) {
      return;
    }

    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!accountNumber}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
      title="Salin nomor rekening"
    >
      <FaCopy size={11} />
      {copied ? "Tersalin" : "Salin"}
    </button>
  );
}
