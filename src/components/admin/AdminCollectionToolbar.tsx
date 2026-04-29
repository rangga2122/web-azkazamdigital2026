"use client";

type ToolbarOption = {
  label: string;
  value: string;
};

type ToolbarSelect = {
  label: string;
  onChange: (value: string) => void;
  options: ToolbarOption[];
  value: string;
};

type AdminCollectionToolbarProps = {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  selects?: ToolbarSelect[];
  summary?: string;
};

export function AdminCollectionToolbar({
  searchPlaceholder = "Cari data...",
  searchValue,
  onSearchChange,
  selects = [],
  summary,
}: AdminCollectionToolbarProps) {
  return (
    <div className="mb-5 rounded-2xl border border-dark-800 bg-dark-900 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-400">
            Cari
          </label>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
          />
        </div>
        {selects.map((select) => (
          <div key={select.label} className="min-w-0 xl:w-60">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-dark-400">
              {select.label}
            </label>
            <select
              value={select.value}
              onChange={(event) => select.onChange(event.target.value)}
              className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white focus:outline-none focus:border-primary-500/50"
            >
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {summary ? (
        <div className="mt-3 text-xs text-dark-500">{summary}</div>
      ) : null}
    </div>
  );
}
