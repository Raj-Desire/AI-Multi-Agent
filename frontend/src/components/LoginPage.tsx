import React from "react";
import { ProductExperiencePanel } from "./auth/ProductExperiencePanel";
import { LoginForm } from "./auth/LoginForm";

export const LoginPage: React.FC = () => {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row bg-[var(--color-surface,#ffffff)] transition-colors">
      {/* Left Product Experience Panel (Desktop & Tablet Wide) */}
      <div className="hidden lg:block lg:w-[52%] xl:w-[50%] shrink-0 h-full overflow-hidden">
        <ProductExperiencePanel />
      </div>

      {/* Right Login Authentication Panel */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-14 xl:px-18 py-6 h-full overflow-y-auto lg:overflow-hidden bg-[var(--color-surface,#ffffff)]">
        <LoginForm />
      </div>
    </div>
  );
};
