// Same rule as the backend (app/core/password_policy.py): 6+ characters, one number, one capital letter.
export const MIN_PASSWORD_LENGTH = 6;

export interface PasswordCheck {
  id: "length" | "number" | "capital";
  label: string;
  passed: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  const value = password || "";
  return [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, passed: value.length >= MIN_PASSWORD_LENGTH },
    { id: "number", label: "At least one number (0-9)", passed: /[0-9]/.test(value) },
    { id: "capital", label: "At least one capital letter (A-Z)", passed: /[A-Z]/.test(value) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return passwordChecks(password).every((c) => c.passed);
}

export const PASSWORD_RULE_MESSAGE =
  "Password must be at least 6 characters and include at least one number and one capital letter.";
