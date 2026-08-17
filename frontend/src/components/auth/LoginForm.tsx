import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { PhoneCall, Lock, User as UserIcon, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { draftTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgName = draftTheme.identity.org_name || "Desire AI";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email or username and password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please verify your email and password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm sm:max-w-md mx-auto space-y-6 sm:space-y-7 text-left">
      {/* Mobile-only compact brand representation */}
      <div className="lg:hidden flex items-center gap-2 mb-1">
        {draftTheme.identity.logo_url ? (
          <img
            src={draftTheme.identity.logo_url}
            alt={orgName}
            className="w-7 h-7 rounded-md object-contain border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5"
          />
        ) : (
          <div
            style={{ backgroundColor: "var(--color-primary, #4f46e5)" }}
            className="w-7 h-7 rounded-md flex items-center justify-center text-white shadow-xs"
          >
            <PhoneCall className="w-3.5 h-3.5" />
          </div>
        )}
        <span className="font-semibold text-sm text-[var(--color-heading)]">{orgName}</span>
      </div>

      {/* Form Header */}
      <div className="space-y-1.5">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--color-heading)]">
          Sign In
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
          Sign in to your {orgName} workspace to manage voice agents and calling campaigns.
        </p>
      </div>

      {/* Error alert if any */}
      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Unboxed Form Elements */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3.5">
          <Input
            label="Email or Username"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            leftIcon={<UserIcon className="w-4 h-4" />}
            autoComplete="username"
            required
            className="h-10 sm:h-11 text-sm bg-[var(--color-surface)]"
          />

          <div>
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              autoComplete="current-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors cursor-pointer p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              }
              required
              className="h-10 sm:h-11 text-sm bg-[var(--color-surface)]"
            />
          </div>
        </div>

        {/* Primary Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          rightIcon={!isSubmitting ? <ArrowRight className="w-4 h-4" /> : undefined}
          className="w-full h-10 sm:h-11 text-sm font-semibold rounded-[var(--radius-main,0.375rem)] shadow-sm hover:shadow transition-all"
        >
          Sign In
        </Button>
      </form>

      {/* Security Tagline */}
      <div className="pt-1 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs text-[var(--color-muted)] opacity-85">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        <span>Secure workspace &bull; Tenant isolated &bull; WebRTC Voice</span>
      </div>

      {/* Minimal Bottom Help / Support Info */}
      <div className="pt-4 sm:pt-5 border-t border-[var(--color-border)] flex items-center justify-between text-[11px] sm:text-xs text-[var(--color-muted)]">
        <span>Need an account? Contact admin</span>
        <div className="flex items-center gap-2.5">
          <span className="hover:text-[var(--color-heading)] cursor-pointer">Support</span>
          <span>&bull;</span>
          <span className="hover:text-[var(--color-heading)] cursor-pointer">Privacy</span>
        </div>
      </div>
    </div>
  );
};
