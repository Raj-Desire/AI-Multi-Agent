import React from "react";
import { ProductExperiencePanel } from "./auth/ProductExperiencePanel";
import { LoginForm } from "./auth/LoginForm";

export const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen w-screen overflow-x-hidden flex bg-white">
      {/* Left: sign-in form */}
      <div className="relative w-full lg:w-[44%] xl:w-[40%] min-h-screen flex flex-col px-6 sm:px-12 lg:px-14 py-8 bg-[#f4f7ff] overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-indigo-200/40 blur-[110px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-24 w-[380px] h-[380px] rounded-full bg-cyan-200/50 blur-[110px] pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(rgba(99,102,241,0.18) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />
        <LoginForm />
      </div>

      {/* Right: quiet product preview (desktop only) */}
      <div className="hidden lg:flex flex-1">
        <ProductExperiencePanel />
      </div>
    </div>
  );
};
