import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import QRCode from "qrcode";
import {
  Eye,
  EyeOff,
  User,
  Lock,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Copy,
  Check,
  ArrowLeft,
  KeyRound
} from "lucide-react";

export const LoginForm: React.FC = () => {
  const { login, verify2FA } = useAuth();
  const { draftTheme } = useTheme();

  // Credentials state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2FA state: "credentials" | "setup_2fa" | "verify_2fa"
  const [step, setStep] = useState<"credentials" | "setup_2fa" | "verify_2fa">("credentials");
  const [tempToken, setTempToken] = useState<string>("");
  const [secretKey, setSecretKey] = useState<string>("");
  const [otpauthUrl, setOtpauthUrl] = useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [totpCode, setTotpCode] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  const orgName = draftTheme.identity.org_name || "AI Voice Platform";
  const logoSrc = draftTheme.identity.logo_url || "/robot-avatar.png";

  // Generate QR code image when 2FA setup is triggered
  useEffect(() => {
    if (step === "setup_2fa" && otpauthUrl) {
      QRCode.toDataURL(otpauthUrl, {
        width: 190,
        margin: 1,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("QR Code generation error:", err));
    }
  }, [step, otpauthUrl]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(username, password);
      if (res.require_2fa) {
        setTempToken(res.temp_token || "");
        if (res.is_setup) {
          setSecretKey(res.secret_key || "");
          setOtpauthUrl(res.otpauth_url || "");
          setStep("setup_2fa");
        } else {
          setStep("verify_2fa");
        }
      }
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please check your username and password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = totpCode.trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setError("Please enter the complete 6-digit code from Microsoft Authenticator.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await verify2FA(tempToken, cleanCode);
    } catch (err: any) {
      setError(err.message || "Invalid 6-digit code. Please verify the code in Microsoft Authenticator and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySecretKey = () => {
    if (!secretKey) return;
    navigator.clipboard.writeText(secretKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleBackToLogin = () => {
    setStep("credentials");
    setTotpCode("");
    setTempToken("");
    setError(null);
  };

  return (
    <div className="relative flex-1 flex flex-col">
      <style>{`
        @keyframes lf-rise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform:none; } }
        @keyframes lf-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes lf-shadow { 0%,100% { transform: scaleX(1); opacity:.35; } 50% { transform: scaleX(.8); opacity:.2; } }
        @keyframes lf-border { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes lf-orbit { to { transform: rotate(360deg); } }
        @keyframes lf-shine { 0% { transform: translateX(-120%) skewX(-20deg); } 100% { transform: translateX(260%) skewX(-20deg); } }
        .lf-rise { opacity:0; animation: lf-rise .7s cubic-bezier(.2,.7,.2,1) forwards; }
        .lf-btn:hover .lf-shine { animation: lf-shine .9s ease; }
        .lf-btn:hover .lf-arrow { transform: translateX(4px); }
        .lf-field { position:relative; display:flex; align-items:center; height:62px; padding:0 14px 0 11px; border-radius:18px; border:1px solid #e2e8f0; background:linear-gradient(180deg,#f8fafc,#f1f5f9); transition: background .25s, border-color .25s, box-shadow .25s; }
        .lf-field:hover { border-color:#cbd5e1; }
        .lf-field:focus-within { background:#fff; border-color:#a5b4fc; box-shadow:0 0 0 4px rgba(99,102,241,.12), 0 10px 24px -12px rgba(79,70,229,.35); }
        .lf-chip { flex:none; width:38px; height:38px; display:grid; place-items:center; border-radius:13px; background:#fff; border:1px solid #e2e8f0; color:#64748b; transition: all .25s; }
        .lf-field:focus-within .lf-chip { background:linear-gradient(135deg,#3b82f6,#6366f1); border-color:transparent; color:#fff; box-shadow:0 6px 14px -4px rgba(79,70,229,.55); transform:rotate(-6deg) scale(1.04); }
        .lf-input { flex:1; min-width:0; height:100%; padding:20px 8px 0 14px; border:0; outline:0; background:transparent; font-size:14.5px; font-weight:500; color:#0f172a; }
        .lf-input:-webkit-autofill { -webkit-box-shadow:0 0 0 40px #f1f5f9 inset; -webkit-text-fill-color:#0f172a; }
        .lf-label { position:absolute; left:63px; top:50%; transform:translateY(-50%); font-size:14px; color:#94a3b8; pointer-events:none; transition: all .2s cubic-bezier(.2,.7,.2,1); }
        .lf-input:focus ~ .lf-label, .lf-input:not(:placeholder-shown) ~ .lf-label, .lf-input:-webkit-autofill ~ .lf-label { top:14px; transform:none; font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#6366f1; }
        .lf-line { position:absolute; left:18px; right:18px; bottom:-1px; height:2px; border-radius:2px; background:linear-gradient(90deg,#3b82f6,#6366f1,#22d3ee); transform:scaleX(0); transform-origin:left; transition: transform .4s cubic-bezier(.2,.7,.2,1); }
        .lf-field:focus-within .lf-line { transform:scaleX(1); }
        .lf-eye { flex:none; width:32px; height:32px; display:grid; place-items:center; border-radius:10px; color:#94a3b8; cursor:pointer; transition: all .2s; }
        .lf-eye:hover { background:#eef2ff; color:#4f46e5; }
        @media (prefers-reduced-motion: reduce) { .lf-rise { animation:none; opacity:1; } .lf-float, .lf-orbit, .lf-border { animation:none !important; } }
      `}</style>

      {/* Top bar */}
      <div className="lf-rise flex items-center justify-between" style={{ animationDelay: "0s" }}>
        <div className="flex items-center gap-3.5">
          <span className="relative flex w-11 h-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-white to-blue-50 border border-blue-100 shadow-[0_8px_18px_-8px_rgba(37,99,235,0.45)]">
            <img src={logoSrc} alt="" className="w-8 h-8 object-contain" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[1.15rem] font-bold tracking-[-0.02em] bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-600 bg-clip-text text-transparent">
              {orgName}
            </span>
            <span className="mt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Intelligent Voice Workspace
            </span>
          </span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 backdrop-blur px-3 py-1 text-[11px] font-medium text-slate-600">
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </span>
          Voice Engine Active
        </span>
      </div>

      {/* Main Card */}
      <div className="flex-1 flex items-center py-6 sm:py-8">
        <div className="w-full max-w-[460px] mx-auto">
          {/* Animated gradient border */}
          <div
            className="lf-border lf-rise rounded-[30px] p-[1.5px] shadow-[0_30px_60px_-20px_rgba(59,91,219,0.35)]"
            style={{
              animationDelay: ".1s",
              backgroundImage:
                "linear-gradient(110deg, #93c5fd, #a5b4fc, #67e8f9, #93c5fd, #a5b4fc)",
              backgroundSize: "200% 100%",
              animation: "lf-rise .7s cubic-bezier(.2,.7,.2,1) .1s forwards, lf-border 8s linear infinite",
            }}
          >
            <div className="relative rounded-[28.5px] bg-white/95 backdrop-blur-xl px-7 sm:px-9 pt-8 pb-8 overflow-hidden">
              {/* Soft inner glow */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-blue-400/15 blur-3xl pointer-events-none" />

              {/* Header Badge & Title */}
              <div className="relative flex flex-col items-center text-center">
                {step === "credentials" ? (
                  <>
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <div className="lf-orbit absolute inset-0 rounded-full border border-dashed border-blue-300/70" style={{ animation: "lf-orbit 24s linear infinite" }}>
                        <span className="absolute -top-1 left-1/2 -ml-1 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.7)]" />
                      </div>
                      <div className="absolute inset-3 rounded-full bg-gradient-to-b from-blue-50 to-white border border-blue-100/80" />
                      <img
                        src={logoSrc}
                        alt={`${orgName} logo`}
                        className="lf-float relative w-[80px] h-[80px] object-contain drop-shadow-[0_12px_16px_rgba(37,99,235,0.3)]"
                        style={{ animation: "lf-float 4.5s ease-in-out infinite" }}
                      />
                      <span
                        className="absolute bottom-1 w-12 h-2 rounded-full bg-blue-900/30 blur-md"
                        style={{ animation: "lf-shadow 4.5s ease-in-out infinite" }}
                      />
                    </div>

                    <h1 className="lf-rise mt-4 text-[1.7rem] font-semibold tracking-tight text-slate-900" style={{ animationDelay: ".25s" }}>
                      Welcome{" "}
                      <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                        back
                      </span>
                    </h1>
                    <p className="lf-rise mt-1 text-xs sm:text-sm text-slate-500" style={{ animationDelay: ".32s" }}>
                      Sign in to continue to your workspace
                    </p>
                  </>
                ) : step === "setup_2fa" ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-3">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      Set Up Authenticator
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                      Scan the QR code with <strong>Microsoft Authenticator</strong> on your phone to link your SuperAdmin account.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-3">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      Two-Factor Authentication
                    </h1>
                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                      Enter the 6-digit code currently displayed in <strong>Microsoft Authenticator</strong>.
                    </p>
                  </>
                )}
              </div>

              {/* Error Alert */}
              {error && (
                <div className="relative mt-4">
                  <Alert type="danger" onDismiss={() => setError(null)}>
                    {error}
                  </Alert>
                </div>
              )}

              {/* STEP 1: CREDENTIALS FORM */}
              {step === "credentials" && (
                <form onSubmit={handleCredentialsSubmit} className="relative mt-6 space-y-4">
                  <div className="lf-rise" style={{ animationDelay: ".4s" }}>
                    <div className="lf-field">
                      <span className="lf-chip"><User className="w-[18px] h-[18px]" /></span>
                      <input
                        id="login-username"
                        className="lf-input"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder=" "
                        autoComplete="username"
                        autoFocus
                        required
                      />
                      <label htmlFor="login-username" className="lf-label">Username or Email</label>
                      <span className="lf-line" />
                    </div>
                  </div>

                  <div className="lf-rise" style={{ animationDelay: ".48s" }}>
                    <div className="lf-field">
                      <span className="lf-chip"><Lock className="w-[18px] h-[18px]" /></span>
                      <input
                        id="login-password"
                        className="lf-input"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder=" "
                        autoComplete="current-password"
                        required
                      />
                      <label htmlFor="login-password" className="lf-label">Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="lf-eye"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <span className="lf-line" />
                    </div>
                  </div>

                  <div className="lf-rise pt-1" style={{ animationDelay: ".56s" }}>
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      isLoading={isSubmitting}
                      rightIcon={!isSubmitting ? <ArrowRight className="lf-arrow w-4 h-4 transition-transform duration-200" /> : undefined}
                      className="lf-btn relative overflow-hidden w-full h-12 text-sm font-semibold rounded-2xl text-white cursor-pointer border-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:200%_100%] hover:bg-right shadow-[0_12px_28px_-8px_rgba(79,70,229,0.6),inset_0_1px_0_rgba(255,255,255,0.25)] active:scale-[0.985] transition-all duration-500"
                    >
                      <span className="lf-shine pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/25 -translate-x-[120%]" />
                      <span className="relative">Sign in</span>
                    </Button>
                  </div>
                </form>
              )}

              {/* STEP 2: FIRST-TIME 2FA SETUP (QR CODE + VERIFY) */}
              {step === "setup_2fa" && (
                <form onSubmit={handle2FASubmit} className="relative mt-5 space-y-4">
                  {/* QR Code Container */}
                  <div className="flex flex-col items-center justify-center p-3.5 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner">
                    {qrCodeDataUrl ? (
                      <img
                        src={qrCodeDataUrl}
                        alt="Authenticator QR Code"
                        className="w-[170px] h-[170px] rounded-lg shadow-sm border border-slate-100 bg-white p-1"
                      />
                    ) : (
                      <div className="w-[170px] h-[170px] rounded-lg bg-slate-200 animate-pulse flex items-center justify-center text-xs text-slate-400">
                        Loading QR Code...
                      </div>
                    )}
                    <span className="mt-2 text-[11px] text-slate-500 text-center font-medium">
                      In Microsoft Authenticator: tap <strong>+</strong> &rarr; <strong>Other account</strong> &rarr; Scan QR
                    </span>
                  </div>

                  {/* Manual Secret Key Copy Box */}
                  <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                      <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-[11px] font-semibold text-slate-700 truncate tracking-wide">
                        {secretKey}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySecretKey}
                      className="px-2 py-1 rounded-md text-[11px] font-medium bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                    >
                      {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey ? "Copied!" : "Copy Key"}</span>
                    </button>
                  </div>

                  {/* 6-Digit Code Input */}
                  <div>
                    <label htmlFor="totp-setup-code" className="block text-xs font-semibold text-slate-700 mb-1.5 text-left">
                      Enter 6-Digit Verification Code
                    </label>
                    <input
                      id="totp-setup-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full h-12 text-center text-xl font-mono tracking-[0.3em] font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                      autoFocus
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isSubmitting}
                    disabled={totpCode.trim().length !== 6}
                    className="w-full h-11 text-sm font-semibold rounded-xl text-white cursor-pointer bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 shadow-md shadow-indigo-500/25 transition-all"
                  >
                    Activate &amp; Sign In
                  </Button>

                  {/* Back to Login */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to sign in</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: RETURNING 2FA VERIFICATION */}
              {step === "verify_2fa" && (
                <form onSubmit={handle2FASubmit} className="relative mt-5 space-y-5">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                    <p className="text-xs font-medium text-slate-700">
                      Open your <strong>Microsoft Authenticator</strong> app
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Look for account <strong>{username}</strong> and enter the 6-digit code.
                    </p>
                  </div>

                  {/* 6-Digit Code Input */}
                  <div>
                    <label htmlFor="totp-verify-code" className="block text-xs font-semibold text-slate-700 mb-1.5 text-left">
                      6-Digit Security Code
                    </label>
                    <input
                      id="totp-verify-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-full h-14 text-center text-2xl font-mono tracking-[0.4em] font-bold rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 outline-none transition-all shadow-inner"
                      autoFocus
                      required
                    />
                  </div>

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isSubmitting}
                    disabled={totpCode.trim().length !== 6}
                    className="w-full h-11 text-sm font-semibold rounded-xl text-white cursor-pointer bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 shadow-md shadow-emerald-500/25 transition-all"
                  >
                    Verify &amp; Sign In
                  </Button>

                  {/* Back to Login */}
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to sign in</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Bottom Encrypted Badge */}
              <div className="relative mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <Lock className="w-3 h-3" />
                End-to-end encrypted session
              </div>
            </div>
          </div>

          <p className="lf-rise mt-5 text-center text-xs text-slate-400" style={{ animationDelay: ".7s" }}>
            Need access? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
};
