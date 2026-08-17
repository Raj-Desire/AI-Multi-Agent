import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { PhoneCall, Lock, User as UserIcon, Eye, EyeOff, ShieldCheck } from "lucide-react";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { draftTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter your email and password.");
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
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-4 sm:p-6 transition-colors">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          {draftTheme.identity.logo_url ? (
            <img
              src={draftTheme.identity.logo_url}
              alt="Organization Logo"
              className="w-10 h-10 mx-auto rounded-lg object-contain border border-[var(--color-border)] bg-[var(--color-surface)] p-1"
            />
          ) : (
            <div
              style={{ backgroundColor: "var(--color-primary)" }}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-white shadow-xs"
            >
              <PhoneCall className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--color-heading)]">
              {draftTheme.identity.org_name || "Desire AI"}
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              Sign in to your voice calling workspace
            </p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-4">
            {error && (
              <Alert type="danger" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Input
                label="Email or Username"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                leftIcon={<UserIcon className="w-3.5 h-3.5" />}
                required
              />

              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                leftIcon={<Lock className="w-3.5 h-3.5" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                }
                required
              />

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isSubmitting}
                className="w-full mt-2"
              >
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="text-center text-xs text-[var(--color-muted)] flex items-center justify-center gap-1.5 opacity-80">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Tenant Isolated &bull; WebRTC Voice</span>
        </div>
      </div>
    </div>
  );
};
