"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCollectionToolbar } from "@/components/admin/AdminCollectionToolbar";
import { compareAdminDates, matchesAdminSearch } from "@/lib/admin-collections";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { FaEnvelopeOpenText, FaEnvelope, FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { ContactMessage } from "@/types";

type InboxFilter = "all" | "unread" | "read";

export default function AdminInboxPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [loading, setLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false });

    const typedMessages = (data || []) as ContactMessage[];
    setMessages(typedMessages);
    setSelectedId((current) => {
      if (current && typedMessages.some((message) => message.id === current)) {
        return current;
      }

      return typedMessages[0]?.id || null;
    });
    setLoading(false);
    window.dispatchEvent(new Event("admin-contact-unread-changed"));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMessages();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMessages]);

  const filteredMessages = useMemo(() => {
    const visibleMessages = messages.filter((message) => {
      if (filter === "unread" && message.is_read) return false;
      if (filter === "read" && !message.is_read) return false;
      return matchesAdminSearch(
        searchQuery,
        message.subject,
        message.name,
        message.email,
        message.message,
        message.source_path
      );
    });

    return visibleMessages.sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "unread-first":
          if (left.is_read !== right.is_read) {
            return left.is_read ? 1 : -1;
          }
          return compareAdminDates(left.created_at, right.created_at, "desc");
        case "newest":
        default:
          return compareAdminDates(left.created_at, right.created_at, "desc");
      }
    });
  }, [filter, messages, searchQuery, sortBy]);

  const selectedMessage =
    filteredMessages.find((message) => message.id === selectedId) ||
    messages.find((message) => message.id === selectedId) ||
    null;

  async function markMessage(
    messageId: string,
    nextReadState: boolean,
    options?: { silent?: boolean }
  ) {
    const supabase = createClient();
    const { error } = await supabase
      .from("contact_messages")
      .update({
        is_read: nextReadState,
        read_at: nextReadState ? new Date().toISOString() : null,
      })
      .eq("id", messageId);

    if (error) {
      toast.error(error.message);
      return false;
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              is_read: nextReadState,
              read_at: nextReadState ? new Date().toISOString() : null,
            }
          : message
      )
    );
    window.dispatchEvent(new Event("admin-contact-unread-changed"));

    if (!options?.silent) {
      toast.success(nextReadState ? "Pesan ditandai sudah dibaca." : "Pesan ditandai belum dibaca.");
    }

    return true;
  }

  async function openMessage(message: ContactMessage) {
    setSelectedId(message.id);

    if (!message.is_read) {
      await markMessage(message.id, true, { silent: true });
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Hapus pesan ini dari inbox?")) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("contact_messages")
      .delete()
      .eq("id", messageId);

    if (error) {
      toast.error(error.message);
      return;
    }

    setMessages((current) => current.filter((message) => message.id !== messageId));
    setSelectedId((current) => (current === messageId ? null : current));
    window.dispatchEvent(new Event("admin-contact-unread-changed"));
    toast.success("Pesan dihapus.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Inbox</h1>
          <p className="mt-1 text-sm text-dark-400">
            Semua pesan dari form kontak akan masuk ke sini.
          </p>
        </div>
        <div className="flex gap-2">
          {[
            { key: "all", label: "Semua" },
            { key: "unread", label: "Belum Dibaca" },
            { key: "read", label: "Sudah Dibaca" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key as InboxFilter)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                filter === item.key
                  ? "bg-primary-500/20 text-primary-400"
                  : "bg-dark-800 text-dark-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari subjek, nama, email, isi pesan, atau sumber..."
        selects={[
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Pesan terbaru", value: "newest" },
              { label: "Pesan terlama", value: "oldest" },
              { label: "Belum dibaca di atas", value: "unread-first" },
            ],
          },
        ]}
        summary={`${filteredMessages.length} dari ${messages.length} pesan`}
      />

      {loading ? (
        <div className="text-dark-400">Memuat inbox...</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-dark-800 bg-dark-900 overflow-hidden">
            <div className="border-b border-dark-800 px-5 py-4">
              <div className="text-sm font-semibold text-white">
                Daftar Pesan
              </div>
              <div className="mt-1 text-xs text-dark-500">
                {filteredMessages.length} pesan
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {filteredMessages.length === 0 ? (
                <div className="px-5 py-12 text-center text-dark-400">
                  Belum ada pesan untuk filter ini.
                </div>
              ) : (
                filteredMessages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => void openMessage(message)}
                    className={`block w-full border-b border-dark-800 px-5 py-4 text-left transition-colors ${
                      selectedMessage?.id === message.id
                        ? "bg-dark-800"
                        : "hover:bg-dark-800/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">
                          {message.subject}
                        </div>
                        <div className="mt-1 truncate text-xs text-dark-400">
                          {message.name} • {message.email}
                        </div>
                      </div>
                      <span
                        className={`mt-0.5 inline-flex h-2.5 w-2.5 rounded-full ${
                          message.is_read ? "bg-emerald-500/70" : "bg-amber-400"
                        }`}
                      />
                    </div>
                    <div className="mt-3 line-clamp-2 text-xs text-dark-500">
                      {message.message}
                    </div>
                    <div className="mt-3 text-[11px] text-dark-500">
                      {formatDate(message.created_at)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
            {!selectedMessage ? (
              <div className="flex min-h-[360px] items-center justify-center text-center text-dark-400">
                Pilih pesan dari daftar inbox untuk melihat detailnya.
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-dark-500">
                      Detail Pesan
                    </div>
                    <h2 className="mt-2 text-2xl font-bold text-white">
                      {selectedMessage.subject}
                    </h2>
                    <div className="mt-3 grid gap-2 text-sm text-dark-300">
                      <div>
                        Dari: <span className="text-white">{selectedMessage.name}</span>
                      </div>
                      <div>
                        Email: <a href={`mailto:${selectedMessage.email}`} className="text-primary-300 hover:underline">{selectedMessage.email}</a>
                      </div>
                      <div>
                        Dikirim: <span className="text-white">{formatDate(selectedMessage.created_at)}</span>
                      </div>
                      <div>
                        Sumber: <span className="text-white">{selectedMessage.source_path || "/kontak"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void markMessage(selectedMessage.id, !selectedMessage.is_read)}
                      className="inline-flex items-center gap-2 rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-2 text-sm font-medium text-primary-300"
                    >
                      {selectedMessage.is_read ? <FaEnvelope size={13} /> : <FaEnvelopeOpenText size={13} />}
                      {selectedMessage.is_read ? "Tandai Belum Dibaca" : "Tandai Dibaca"}
                    </button>
                    <button
                      onClick={() => void deleteMessage(selectedMessage.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300"
                    >
                      <FaTrash size={12} />
                      Hapus
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-800 bg-dark-800 p-5">
                  <div className="mb-3 text-sm font-semibold text-white">Isi Pesan</div>
                  <div className="whitespace-pre-wrap text-sm leading-7 text-dark-300">
                    {selectedMessage.message}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
