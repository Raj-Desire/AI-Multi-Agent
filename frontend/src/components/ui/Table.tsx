import React from "react";

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div className="ui-table-container w-full overflow-x-auto border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface)]">
      <table className={`ui-table w-full text-left text-sm border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <thead
      className={`bg-[var(--color-surface-muted)]/60 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-muted)] ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <tbody className={`divide-y divide-[var(--color-border)] ${className}`} {...props}>
      {children}
    </tbody>
  );
};

export const TableRow: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <tr
      className={`hover:bg-[var(--color-surface-muted)]/40 transition-colors ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
};

export const TableHead: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <th className={`px-4 py-2.5 text-[var(--color-muted)] font-medium text-xs ${className}`} {...props}>
      {children}
    </th>
  );
};

export const TableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <td className={`px-4 py-3 text-[var(--color-text)] text-sm ${className}`} {...props}>
      {children}
    </td>
  );
};

export const TableEmpty: React.FC<{ message?: string; colSpan?: number }> = ({
  message = "No records found",
  colSpan = 5,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-10 text-[var(--color-muted)] text-sm">
        {message}
      </td>
    </tr>
  );
};
