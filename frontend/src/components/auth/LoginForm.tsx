import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import { Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { draftTheme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgName = draftTheme.identity.org_name || "AI Voice Platform";
  const logoSrc = draftTheme.identity.logo_url || "/robot-avatar.png";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please check your username and password.");
    } finally {
      setIsSubmitting(false);
    }
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

      {/* Card */}
      <div className="flex-1 flex items-center py-8">
        <div className="w-full max-w-[440px] mx-auto">
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
            <div className="relative rounded-[28.5px] bg-white/90 backdrop-blur-xl px-8 sm:px-10 pt-9 pb-8 overflow-hidden">
              {/* soft inner glows */}
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-blue-400/15 blur-3xl pointer-events-none" />

              {/* Floating logo with orbit */}
              <div className="relative flex flex-col items-center text-center">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="lf-orbit absolute inset-0 rounded-full border border-dashed border-blue-300/70" style={{ animation: "lf-orbit 24s linear infinite" }}>
                    <span className="absolute -top-1 left-1/2 -ml-1 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.7)]" />
                  </div>
                  <div className="absolute inset-3 rounded-full bg-gradient-to-b from-blue-50 to-white border border-blue-100/80" />
                  <img
                    src={logoSrc}
                    alt={`${orgName} logo`}
                    className="lf-float relative w-[92px] h-[92px] object-contain drop-shadow-[0_12px_16px_rgba(37,99,235,0.3)]"
                    style={{ animation: "lf-float 4.5s ease-in-out infinite" }}
                  />
                  <span
                    className="absolute bottom-1 w-14 h-2 rounded-full bg-blue-900/30 blur-md"
                    style={{ animation: "lf-shadow 4.5s ease-in-out infinite" }}
                  />
                </div>

                <h1 className="lf-rise mt-5 text-[1.8rem] font-semibold tracking-tight text-slate-900" style={{ animationDelay: ".25s" }}>
                  Welcome{" "}
                  <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                    back
                  </span>
                </h1>
                <p className="lf-rise mt-1.5 text-sm text-slate-500" style={{ animationDelay: ".32s" }}>
                  Sign in to continue to your workspace
                </p>
              </div>

              {error && (
                <div className="relative mt-6">
                  <Alert type="danger" onDismiss={() => setError(null)}>
                    {error}
                  </Alert>
                </div>
              )}

              <form onSubmit={handleSubmit} className="relative mt-8 space-y-5">
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
                    <label htmlFor="login-username" className="lf-label">Username</label>
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

              <div className="relative mt-7 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <Lock className="w-3 h-3" />
                End-to-end encrypted session
              </div>
            </div>
          </div>

          <p className="lf-rise mt-6 text-center text-xs text-slate-400" style={{ animationDelay: ".7s" }}>
            Need access? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
};
