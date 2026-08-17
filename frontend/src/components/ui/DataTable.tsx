import React, { useState, useMemo } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./Table";
import { Input } from "./Input";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchKey?: keyof T | string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pagination?: boolean;
  pageSize?: number;
  actions?: React.ReactNode;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
  emptyTitle = "No records found",
  emptyDescription = "There are no entries to display at this moment.",
  emptyAction,
  pagination = false,
  pageSize = 10,
  actions,
  className = "",
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!searchTerm || !searchKey) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) => {
      const val = item[searchKey as string];
      if (val === undefined || val === null) return false;
      return String(val).toLowerCase().includes(term);
    });
  }, [data, searchTerm, searchKey]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      if (sortDir === "asc") {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search & Actions Bar */}
      {(searchKey || actions) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {searchKey ? (
            <div className="max-w-xs w-full">
              <Input
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          ) : <div />}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table Surface */}
      {sortedData.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={searchTerm ? `No results matching "${searchTerm}"` : emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] overflow-hidden bg-[var(--color-surface)] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-[var(--color-surface-muted)]/50 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)]">
                <tr>
                  {columns.map((col) => {
                    const isSorted = sortKey === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`px-4 py-2.5 font-medium text-xs text-[var(--color-muted)] ${
                          col.sortable ? "cursor-pointer select-none hover:text-[var(--color-heading)]" : ""
                        } ${col.headerClassName || ""} ${col.className || ""}`}
                        onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.header}</span>
                          {col.sortable && (
                            <span className="shrink-0 text-[var(--color-muted)]">
                              {isSorted ? (
                                sortDir === "asc" ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                                )
                              ) : (
                                <ChevronsUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {paginatedData.map((item, rowIdx) => (
                  <tr
                    key={item.id || rowIdx}
                    className="hover:bg-[var(--color-surface-muted)]/40 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-sm text-[var(--color-text)] ${col.className || ""}`}
                      >
                        {col.render ? col.render(item, rowIdx) : item[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination && totalPages > 1 && (
            <div className="px-4 py-2.5 bg-[var(--color-surface-muted)]/30 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-muted)]">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} entries
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-2 font-medium text-[var(--color-heading)]">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
