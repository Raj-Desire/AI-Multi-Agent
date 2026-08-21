import React, { useState, useEffect } from "react";
import {
  Check,
  Brain,
  Sparkles,
  BookOpen,
  HelpCircle,
  Layers,
  Plus,
  Loader2,
  Briefcase,
  CheckCircle2,
  Tag,
  DollarSign
} from "lucide-react";
import { Badge } from "../ui/Badge";
import { AVAILABLE_CAPABILITIES } from "./constants";
import { AgentConfig, CompanyBusinessProfile, BusinessServiceItem, AgentServiceItem } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";

interface Step2RoleConversationProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  selectedPurposeId: string;
}

export function Step2RoleConversation({
  agentData,
  setAgentData,
  selectedPurposeId
}: Step2RoleConversationProps) {
  const currentCaps: string[] = agentData.skills || [];

  // Knowledge base profile & services state
  const [kbProfile, setKbProfile] = useState<CompanyBusinessProfile | null>(null);
  const [loadingKb, setLoadingKb] = useState(false);
  const [isAddingService, setIsAddingService] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newServicePricing, setNewServicePricing] = useState("");

  useEffect(() => {
    loadKnowledgeBase();
  }, []);

  async function loadKnowledgeBase() {
    try {
      setLoadingKb(true);
      const profile = await fetchApi<CompanyBusinessProfile>("/business-profile");
      if (profile) {
        setKbProfile(profile);

        // If agentData.services is not yet initialized or empty, initialize from KB services
        if (!agentData.services || agentData.services.length === 0) {
          if (profile.services && profile.services.length > 0) {
            const initialServices: AgentServiceItem[] = profile.services.map((s, idx) => ({
              name: s.name,
              description: s.description || "",
              enabled: s.enabled ?? true,
              priority: idx + 1
            }));
            setAgentData((prev) => ({
              ...prev,
              services: initialServices
            }));
          }
        }
      }
    } catch (err) {
      console.error("Failed to load Knowledge Base profile in Step 2:", err);
    } finally {
      setLoadingKb(false);
    }
  }

  const toggleCapability = (id: string) => {
    const next = currentCaps.includes(id)
      ? currentCaps.filter((c) => c !== id)
      : [...currentCaps, id];
    setAgentData({ ...agentData, skills: next });
  };

  // Helper to check if a service is enabled for this agent
  const isServiceSelected = (serviceName: string): boolean => {
    if (!agentData.services || agentData.services.length === 0) return true;
    const match = agentData.services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase());
    return match ? match.enabled : true;
  };

  // Toggle selection of a knowledge base service for this agent
  const toggleServiceSelection = (service: BusinessServiceItem) => {
    const currentServices: AgentServiceItem[] = agentData.services ? [...agentData.services] : [];
    const existingIndex = currentServices.findIndex(
      (s) => s.name.toLowerCase() === service.name.toLowerCase()
    );

    if (existingIndex >= 0) {
      currentServices[existingIndex] = {
        ...currentServices[existingIndex],
        enabled: !currentServices[existingIndex].enabled
      };
    } else {
      currentServices.push({
        name: service.name,
        description: service.description || "",
        enabled: false,
        priority: currentServices.length + 1
      });
    }

    setAgentData({ ...agentData, services: currentServices });
  };

  // Add new service and persist to Knowledge Base
  const handleAddNewService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim() || !kbProfile) {
      toast.error("Please enter a valid service name.");
      return;
    }

    try {
      setSavingService(true);
      const newService: BusinessServiceItem = {
        name: newServiceName.trim(),
        description: newServiceDesc.trim(),
        pricing: newServicePricing.trim() || undefined,
        enabled: true
      };

      const updatedProfile: CompanyBusinessProfile = {
        ...kbProfile,
        services: [...(kbProfile.services || []), newService]
      };

      const saved = await fetchApi<CompanyBusinessProfile>("/business-profile", {
        method: "POST",
        body: JSON.stringify(updatedProfile)
      });

      if (saved) {
        setKbProfile(saved);

        // Also add to agent's selected services
        const currentServices = agentData.services ? [...agentData.services] : [];
        currentServices.push({
          name: newService.name,
          description: newService.description || "",
          enabled: true,
          priority: currentServices.length + 1
        });

        setAgentData((prev) => ({
          ...prev,
          services: currentServices
        }));

        setNewServiceName("");
        setNewServiceDesc("");
        setNewServicePricing("");
        setIsAddingService(false);

        toast.success(`Service "${newService.name}" saved to Knowledge Base & enabled for this agent!`);
      }
    } catch (err: any) {
      console.error("Failed to save service to Knowledge Base:", err);
      toast.error(err.message || "Failed to save service to Knowledge Base.");
    } finally {
      setSavingService(false);
    }
  };

  const allKbServices = kbProfile?.services || [];
  const selectedCount = allKbServices.filter((s) => isServiceSelected(s.name)).length;

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="border-b border-[var(--color-border)] pb-2.5">
        <h2 className="text-sm font-bold text-[var(--color-heading)]">Role & Business Knowledge</h2>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          Define the primary objective of your calls, opening greeting, capabilities, and business knowledge facts.
        </p>
      </div>

      {/* Section 1: Objective */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Primary Agent Objective <span className="text-[var(--color-danger)]">*</span>
          </label>
          <input
            type="text"
            value={agentData.objective || ""}
            onChange={(e) => setAgentData({ ...agentData, objective: e.target.value })}
            placeholder="e.g., Qualify inbound real-estate buyer leads and schedule tours"
            className="w-full h-9 px-3 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
          />
          <p className="text-[11px] text-[var(--color-muted)]">
            In 1–2 sentences, what is the single most important goal of every phone call?
          </p>
        </div>
      </div>

      {/* Section 2: Conversational Capabilities */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-heading)]">
            Conversational Capabilities & Skills
          </label>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Select the pre-trained workflows and skills to enable for this agent.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {AVAILABLE_CAPABILITIES.map((cap) => {
            const isEnabled = currentCaps.includes(cap.id);
            return (
              <div
                key={cap.id}
                onClick={() => toggleCapability(cap.id)}
                className={`p-3 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isEnabled
                    ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-heading)] shadow-2xs"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-border)]/80 text-[var(--color-muted)]"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                    isEnabled
                      ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  {isEnabled && <Check className="w-3 h-3 stroke-[2.5]" />}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-[var(--color-heading)] leading-snug">
                    {cap.label}
                  </h4>
                  <p className="text-[11px] leading-tight mt-0.5 opacity-80">
                    {cap.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Verified Company Knowledge Base & Services */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)]">
        <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-[var(--color-primary)]" />
                Organization Business Knowledge Base
              </span>
              <Badge variant="primary" className="text-[10px] py-0 px-1.5 font-semibold">
                Auto-Integrated
              </Badge>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agentData.include_business_knowledge ?? true}
                onChange={(e) =>
                  setAgentData({
                    ...agentData,
                    include_business_knowledge: e.target.checked
                  })
                }
                className="w-4 h-4 accent-[var(--color-primary)] cursor-pointer"
              />
              <span className="text-xs font-medium text-[var(--color-heading)]">
                Include in Calls
              </span>
            </label>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
            When enabled, this agent automatically knows your company services, head office address, operating hours, email, phone, and standard FAQs configured in <strong>Company Knowledge</strong>.
          </p>

          {/* Knowledge Base Services & Skills Management */}
          {(agentData.include_business_knowledge ?? true) && (
            <div className="p-3 bg-[var(--color-surface-muted)]/50 border border-[var(--color-border)]/80 rounded-[var(--radius-main,0.375rem)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[var(--color-primary)]" />
                  <div>
                    <h3 className="text-xs font-bold text-[var(--color-heading)]">
                      Knowledge Base Services & Skills
                    </h3>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Select or deselect which services this agent offers, or add new services directly to your Knowledge Base.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="sm" className="text-[10px]">
                    {selectedCount} / {allKbServices.length} Selected
                  </Badge>
                  {!isAddingService && (
                    <button
                      type="button"
                      onClick={() => setIsAddingService(true)}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover,var(--color-primary))] rounded flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3 h-3 stroke-[2.5]" />
                      <span>Add Service</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Inline Add Service Form */}
              {isAddingService && (
                <form
                  onSubmit={handleAddNewService}
                  className="p-3 bg-[var(--color-surface)] border border-[var(--color-primary)]/40 rounded-[var(--radius-main,0.375rem)] space-y-2.5 animate-fade-in"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
                    <span className="text-xs font-bold text-[var(--color-heading)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      Add Service to Knowledge Base
                    </span>
                    <span className="text-[10px] text-[var(--color-muted)]">
                      Will be saved globally & assigned to this agent
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--color-heading)]">
                        Service Name <span className="text-[var(--color-danger)]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        placeholder="e.g. VIP Consultation, Express Loan Verification"
                        className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--color-heading)]">
                        Pricing / Detail (Optional)
                      </label>
                      <input
                        type="text"
                        value={newServicePricing}
                        onChange={(e) => setNewServicePricing(e.target.value)}
                        placeholder="e.g. Free initial session, $99/mo"
                        className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="block text-[11px] font-semibold text-[var(--color-heading)]">
                        Service Description
                      </label>
                      <input
                        type="text"
                        value={newServiceDesc}
                        onChange={(e) => setNewServiceDesc(e.target.value)}
                        placeholder="e.g. Conducts 1-on-1 discovery, reviews qualifications, and schedules follow-up."
                        className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingService(false);
                        setNewServiceName("");
                        setNewServiceDesc("");
                        setNewServicePricing("");
                      }}
                      className="px-2.5 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-heading)] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingService || !newServiceName.trim()}
                      className="px-3 py-1 text-xs font-semibold bg-[var(--color-primary)] text-white rounded hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {savingService ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Saving to KB...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3 stroke-[2.5]" />
                          <span>Save & Enable for Agent</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Service Cards Grid */}
              {loadingKb ? (
                <div className="py-4 flex items-center justify-center gap-2 text-xs text-[var(--color-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                  <span>Loading services from Knowledge Base...</span>
                </div>
              ) : allKbServices.length === 0 ? (
                <div className="p-4 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)]">
                  <Briefcase className="w-6 h-6 text-[var(--color-muted)] mx-auto mb-1.5 opacity-60" />
                  <p className="text-xs font-semibold text-[var(--color-heading)]">
                    No services in Knowledge Base yet
                  </p>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    Click "Add Service" above to create your first company service.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allKbServices.map((service, idx) => {
                    const isSelected = isServiceSelected(service.name);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleServiceSelection(service)}
                        className={`p-2.5 rounded-[var(--radius-main,0.375rem)] border transition-all cursor-pointer flex items-start gap-2.5 text-left relative ${
                          isSelected
                            ? "bg-[var(--color-surface)] border-[var(--color-primary)] shadow-2xs ring-1 ring-[var(--color-primary)]/40"
                            : "bg-[var(--color-surface)] border-[var(--color-border)] opacity-65 hover:opacity-100 hover:border-[var(--color-border)]"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${
                            isSelected
                              ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                              : "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="text-xs font-bold text-[var(--color-heading)] leading-snug truncate">
                              {service.name}
                            </h4>
                            {service.pricing && (
                              <span className="text-[10px] font-semibold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-1.5 py-0.2 rounded shrink-0">
                                {service.pricing}
                              </span>
                            )}
                          </div>
                          {service.description && (
                            <p className="text-[11px] text-[var(--color-muted)] leading-tight mt-0.5 line-clamp-2">
                              {service.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Custom Knowledge Section */}
          <div className="pt-2 border-t border-[var(--color-border)]/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold text-[var(--color-heading)]">
                Additional Custom Knowledge & Specific Facts (Optional)
              </label>
              <span className="text-[10px] text-[var(--color-muted)]">
                Agent-specific context
              </span>
            </div>
            <textarea
              rows={2}
              value={agentData.custom_knowledge || ""}
              onChange={(e) => setAgentData({ ...agentData, custom_knowledge: e.target.value })}
              placeholder="e.g. Special promotion: 20% discount on first-time consultations this month. In-person meetings require 24 hours prior notice."
              className="w-full p-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

