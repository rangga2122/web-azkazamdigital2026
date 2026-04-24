"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FaSearch } from "react-icons/fa";
import type { Category } from "@/types";

interface ProductFilterProps {
  categories: Category[];
  currentCategory?: string;
  currentSearch?: string;
}

export function ProductFilter({
  categories,
  currentCategory,
  currentSearch,
}: ProductFilterProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch || "");

  function applyFilter(category?: string) {
    const params = new URLSearchParams();
    if (category) params.set("kategori", category);
    if (search) params.set("search", search);
    router.push(`/produk?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    applyFilter(currentCategory);
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => applyFilter(undefined)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            !currentCategory
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
              : "bg-dark-800 text-dark-400 border border-dark-700 hover:text-white"
          }`}
        >
          Semua
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => applyFilter(cat.slug)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              currentCategory === cat.slug
                ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
                : "bg-dark-800 text-dark-400 border border-dark-700 hover:text-white"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" size={14} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="pl-10 pr-4 py-2.5 rounded-lg bg-dark-800 border border-dark-700 text-white text-sm focus:outline-none focus:border-primary-500/50 w-60"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          Cari
        </button>
      </form>
    </div>
  );
}
