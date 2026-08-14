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
      setError("Please enter both email/username and password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Failed to log in. Please check your credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen theme-bg flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          {draftTheme.identity.logo_url ? (
            <img
              src={draftTheme.identity.logo_url}
              alt="Organization Logo"
              className="w-14 h-14 mx-auto rounded-2xl object-contain border theme-border shadow-md mb-4 bg-white dark:bg-slate-900 p-1"
            />
          ) : (
            <div
              style={{ backgroundColor: draftTheme.colors.primary }}
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-lg shadow-indigo-500/30 mb-4"
            >
              <PhoneCall className="w-7 h-7" />
            </div>
          )}
          <h1 className="text-2xl font-black tracking-tight theme-text">
            {draftTheme.identity.org_name || "Desire AI"}
          </h1>
          <p className="text-xs theme-muted mt-1 font-medium">
            Multi-Agent AI Voice Platform
          </p>
        </div>

        {/* Login Card */}
        <Card className="shadow-xl">
          <CardContent className="p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold theme-text">Welcome back</h2>
              <p className="text-xs theme-muted mt-0.5">Sign in to your organization account</p>
            </div>

            {error && (
              <Alert type="danger" onDismiss={() => setError(null)}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email or Username"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@desireai.com"
                leftIcon={<UserIcon className="w-4 h-4" />}
                required
              />

              <div>
                <Input
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                className="w-full mt-2"
              >
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="text-center text-xs theme-muted flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Role-Based Tenant Isolation</span>
        </div>
      </div>
    </div>
  );
};
