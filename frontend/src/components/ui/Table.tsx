import React from "react";

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-left text-sm border-collapse ${className}`} {...props}>
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
      className={`bg-white border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-sub ${className}`}
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
    <tbody className={`divide-y divide-slate-100 ${className}`} {...props}>
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
      className={`hover:bg-slate-50/70 transition-colors ${className}`}
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
    <th className={`px-4 py-3.5 text-sub font-bold text-xs uppercase tracking-wider ${className}`} {...props}>
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
    <td className={`px-4 py-3.5 text-body text-sm ${className}`} {...props}>
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
      <td colSpan={colSpan} className="text-center py-10 text-sub text-sm">
        {message}
      </td>
    </tr>
  );
};
