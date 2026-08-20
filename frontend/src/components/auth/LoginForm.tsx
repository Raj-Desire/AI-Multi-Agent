import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { Lock, Mail, Eye, EyeOff, ArrowRight } from "lucide-react";

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { draftTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgName = draftTheme.identity.org_name || "AI Calling";

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
    <div className="w-full max-w-sm sm:max-w-md mx-auto space-y-6 text-left">
      {/* 1. Centered Robot Avatar & Heading */}
      <div className="text-center space-y-3">
        <div className="w-28 h-28 mx-auto flex items-center justify-center drop-shadow-2xl">
          <img
            src="/robot-avatar.png"
            alt="AI Robot"
            className="w-full h-full object-contain"
          />
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Welcome Back
        </h2>
        <p className="text-xs text-slate-500">
          Sign in to your {orgName} account
        </p>
      </div>

      {/* Error alert if any */}
      {error && (
        <Alert type="danger" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 2. Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3.5">
          <Input
            label="Email Address"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
            autoComplete="username"
            required
            className="h-11 text-xs sm:text-sm bg-white rounded-xl border-slate-200 focus:border-blue-600 shadow-2xs"
          />

          <div>
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
              autoComplete="current-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              required
              className="h-11 text-xs sm:text-sm bg-white rounded-xl border-slate-200 focus:border-blue-600 shadow-2xs"
            />
          </div>
        </div>

        {/* Remember Me & Forgot Password Row */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
            />
            <span>Remember me</span>
          </label>
          <span className="text-blue-600 font-semibold hover:underline cursor-pointer">
            Forgot Password?
          </span>
        </div>

        {/* Primary Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isSubmitting}
          rightIcon={!isSubmitting ? <ArrowRight className="w-4 h-4" /> : undefined}
          className="w-full h-11 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition-all cursor-pointer"
        >
          Sign In
        </Button>
      </form>
    </div>
  );
};
