import React from "react";
import { ProductExperiencePanel } from "./auth/ProductExperiencePanel";
import { LoginForm } from "./auth/LoginForm";

export const LoginPage: React.FC = () => {
  return (
    <div className="min-h-screen w-screen overflow-x-hidden flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-[#f0f5fc] via-[#f7fafe] to-[#e8f1fb] select-none">
      <div className="w-full max-w-[1400px] h-[92vh] max-h-[880px] min-h-[640px] flex flex-col lg:flex-row items-stretch rounded-[2rem] bg-white/40 backdrop-blur-md border border-white/80 shadow-[0_20px_50px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Left Product & Visual Experience Panel */}
        <div className="hidden lg:flex lg:w-[60%] xl:w-[62%] h-full">
          <ProductExperiencePanel />
        </div>

        {/* Right Elevated Auth Form Card */}
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-12 xl:px-14 py-8 h-full bg-white rounded-[2rem] lg:rounded-l-[2.5rem] lg:rounded-r-[2rem] shadow-[-15px_0_35px_rgba(0,0,0,0.03)] border-l border-slate-100/90 z-20 overflow-y-auto">
          <LoginForm />
        </div>
      </div>
    </div>
  );
};
