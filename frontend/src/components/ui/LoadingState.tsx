import React from "react";
import { Loader2 } from "lucide-react";

export const LoadingState: React.FC<{ message?: string; fullPage?: boolean }> = ({
  message = "Loading...",
  fullPage = false,
}) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3 p-8">
      <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">
        {message}
      </span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};
