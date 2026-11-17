import React from "react";
import { Check, Circle } from "lucide-react";
import { passwordChecks } from "../../utils/password";

/** Live checklist under a password field: each rule turns green as it is met. */
export const PasswordRules: React.FC<{ password: string }> = ({ password }) => {
  const checks = passwordChecks(password);
  return (
    <ul className="space-y-1 text-[11px]" aria-live="polite">
      {checks.map((c) => (
        <li
          key={c.id}
          className={`flex items-center gap-1.5 ${c.passed ? "text-emerald-600" : "text-[var(--color-muted)]"}`}
        >
          {c.passed ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
          <span>{c.label}</span>
        </li>
      ))}
    </ul>
  );
};
