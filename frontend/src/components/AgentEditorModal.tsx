import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Save, CheckCircle2 } from "lucide-react";
import { Button } from "./ui/Button";
import { Alert } from "./ui/Alert";
import { AgentConfig } from "../types";
import { CREATOR_STEPS, getInitialAgentData } from "./agent-creator/constants";
import { useAuth } from "../context/AuthContext";
import { AgentStepHeader } from "./agent-creator/AgentStepHeader";
import { AgentStepper } from "./agent-creator/AgentStepper";
import { Step1Basics } from "./agent-creator/Step1Basics";
import { Step2RoleConversation } from "./agent-creator/Step2RoleConversation";
import { Step3VoiceLanguage } from "./agent-creator/Step3VoiceLanguage";
import { Step4PersonalityCommunication } from "./agent-creator/Step4PersonalityCommunication";
import { Step5BehaviorSafety } from "./agent-creator/Step5BehaviorSafety";
import { Step6PromptInstructions } from "./agent-creator/Step6PromptInstructions";
import { Step6TestPreview } from "./agent-creator/Step6TestPreview";
import { Step7ReviewActivate } from "./agent-creator/Step7ReviewActivate";

interface AgentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAgent?: AgentConfig | null;
  onSave: (agent: AgentConfig, activate: boolean) => Promise<void>;
  onTestCall?: (agent: AgentConfig) => void;
  onDirtyChange?: (isDirty: boolean, currentAgent: AgentConfig) => void;
}

export function AgentEditorModal({
  isOpen,
  onClose,
  initialAgent,
  onSave,
  onTestCall,
  onDirtyChange
}: AgentEditorModalProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [selectedPurposeId, setSelectedPurposeId] = useState<string>("follow_up");

  // Agent State
  const [agentData, setAgentData] = useState<AgentConfig>(() => {
    const init = getInitialAgentData();
    return {
      ...init,
      organization_id: user?.organization_id || "org_platform_root"
    };
  });

  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  useEffect(() => {
    let baseAgent: AgentConfig;
    if (initialAgent) {
      const cloned = JSON.parse(JSON.stringify(initialAgent));
      if (!cloned.organization_id || cloned.organization_id === "default") {
        cloned.organization_id = user?.organization_id || "org_platform_root";
      }
      if (!cloned.runtime) {
        cloned.runtime = {};
      }
      cloned.runtime = {
        barge_in_enabled: true,
        interruption_sensitivity: 0.8,
        silence_timeout: 5,
        silence_reprompt_message: "Are you still there? I'm here if you have any questions.",
        silence_hangup_delay: 5,
        maximum_call_duration: 300,
        conclusion_message: "Thank you for your time. Have a great day!",
        customer_response_timeout: 15,
        retry_attempts: 2,
        auto_hangup_on_completion: true,
        ...cloned.runtime
      };
      if (!cloned.personality) {
        cloned.personality = getInitialAgentData().personality;
      }
      if (!cloned.voice) {
        cloned.voice = getInitialAgentData().voice;
      }
      if (!cloned.llm) {
        cloned.llm = getInitialAgentData().llm;
      }
      if (cloned.include_business_knowledge === undefined) {
        cloned.include_business_knowledge = true;
      }
      if (cloned.custom_knowledge === undefined) {
        cloned.custom_knowledge = "";
      }
      baseAgent = cloned;
    } else {
      const init = getInitialAgentData();
      baseAgent = {
        ...init,
        organization_id: user?.organization_id || "org_platform_root"
      };
    }
    setAgentData(baseAgent);
    setInitialSnapshot(JSON.stringify(baseAgent));
    setCurrentStep(1);
    setErrorMsg(null);
    setShowValidationErrors(false);
  }, [initialAgent, isOpen, user]);

  useEffect(() => {
    if (!initialSnapshot) return;
    const isDirty = JSON.stringify(agentData) !== initialSnapshot;
    onDirtyChange?.(isDirty, agentData);
  }, [agentData, initialSnapshot, onDirtyChange]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  if (!isOpen) return null;

  const validateStep = (stepNumber: number): boolean => {
    if (stepNumber === 1) {
      if (!agentData.name || !agentData.name.trim() || !agentData.description || !agentData.description.trim()) {
        setShowValidationErrors(true);
        return false;
      }
    } else if (stepNumber === 2) {
      if (!agentData.objective || !agentData.objective.trim()) {
        setShowValidationErrors(true);
        return false;
      }
    } else if (stepNumber === 6) {
      if (!agentData.greeting || !agentData.greeting.trim()) {
        setShowValidationErrors(true);
        return false;
      }
    }

    setErrorMsg(null);
    return true;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) {
      return;
    }
    setShowValidationErrors(false);
    setErrorMsg(null);
    setCurrentStep((prev) => Math.min(prev + 1, CREATOR_STEPS.length));
  };

  const handleSelectStep = (targetStep: number) => {
    if (targetStep > currentStep) {
      for (let s = currentStep; s < targetStep; s++) {
        if (!validateStep(s)) {
          setCurrentStep(s);
          return;
        }
      }
    }
    setShowValidationErrors(false);
    setErrorMsg(null);
    setCurrentStep(targetStep);
  };

  async function handleSaveAction(activate: boolean) {
    if (!agentData.name.trim()) {
      setErrorMsg("Please provide an agent name.");
      setShowValidationErrors(true);
      setCurrentStep(1);
      return;
    }
    if (!agentData.description || !agentData.description.trim()) {
      setErrorMsg("Please provide an agent description.");
      setShowValidationErrors(true);
      setCurrentStep(1);
      return;
    }
    if (!agentData.objective.trim()) {
      setErrorMsg("Please provide a primary objective for the agent.");
      setShowValidationErrors(true);
      setCurrentStep(2);
      return;
    }
    if (!agentData.greeting.trim()) {
      setErrorMsg("Please provide a spoken greeting message.");
      setShowValidationErrors(true);
      setCurrentStep(6);
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      await onSave(agentData, activate);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save agent configuration.");
    } finally {
      setSaving(false);
    }
  }

  const currentStepObj = CREATOR_STEPS.find((s) => s.id === currentStep) || CREATOR_STEPS[0];
  const nextStepObj = CREATOR_STEPS.find((s) => s.id === currentStep + 1);

  return (
    <div className="w-full max-w-full space-y-4 animate-agent-entrance text-left">
      {/* 1. Global Page Header */}
      <AgentStepHeader
        agentData={agentData}
        initialAgent={initialAgent}
        currentStep={currentStep}
        totalSteps={CREATOR_STEPS.length}
        currentStepLabel={currentStepObj.title}
        saving={saving}
        onBack={onClose}
        onSave={handleSaveAction}
        onTestCall={onTestCall}
      />

      {/* 2. Progress Stepper Bar */}
      <AgentStepper
        currentStep={currentStep}
        onSelectStep={handleSelectStep}
      />

      {/* 3. Main Step Canvas */}
      <main className="p-5 sm:p-6 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs space-y-4 text-left text-xs">
        {errorMsg && (
          <Alert type="danger" onDismiss={() => setErrorMsg(null)}>
            {errorMsg}
          </Alert>
        )}

        {/* STEP 1: Agent Basics */}
        {currentStep === 1 && (
          <Step1Basics
            agentData={agentData}
            setAgentData={setAgentData}
            selectedPurposeId={selectedPurposeId}
            setSelectedPurposeId={setSelectedPurposeId}
            showValidationErrors={showValidationErrors}
          />
        )}

        {/* STEP 2: Role & Conversation */}
        {currentStep === 2 && (
          <Step2RoleConversation
            agentData={agentData}
            setAgentData={setAgentData}
            selectedPurposeId={selectedPurposeId}
            showValidationErrors={showValidationErrors}
          />
        )}

        {/* STEP 3: Voice & Language */}
        {currentStep === 3 && (
          <Step3VoiceLanguage
            agentData={agentData}
            setAgentData={setAgentData}
          />
        )}

        {/* STEP 4: Personality & Communication */}
        {currentStep === 4 && (
          <Step4PersonalityCommunication
            agentData={agentData}
            setAgentData={setAgentData}
          />
        )}

        {/* STEP 5: Behavior & Safety */}
        {currentStep === 5 && (
          <Step5BehaviorSafety
            agentData={agentData}
            setAgentData={setAgentData}
          />
        )}

        {/* STEP 6: AI Prompt & Spoken Instructions */}
        {currentStep === 6 && (
          <Step6PromptInstructions
            agentData={agentData}
            setAgentData={setAgentData}
          />
        )}

        {/* STEP 7: Live Test & Preview */}
        {currentStep === 7 && (
          <Step6TestPreview
            agentData={agentData}
            onTestCall={onTestCall}
          />
        )}

        {/* STEP 8: Review & Activate */}
        {currentStep === 8 && (
          <Step7ReviewActivate
            agentData={agentData}
            saving={saving}
            onJumpToStep={(stepId) => handleSelectStep(stepId)}
            onSave={handleSaveAction}
          />
        )}
      </main>

      {/* 4. Bottom Footer Navigation Controls */}
      <footer className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs flex items-center justify-between">
        <div>
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setErrorMsg(null);
                setShowValidationErrors(false);
                setCurrentStep((prev) => prev - 1);
              }}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              className="cursor-pointer text-xs h-8 px-3"
            >
              Previous Step
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="cursor-pointer text-xs h-8 px-3"
            >
              Cancel & Back to List
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentStep < CREATOR_STEPS.length ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleNextStep}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              className="cursor-pointer text-xs h-8 px-3.5 font-semibold"
            >
              Next: {nextStepObj?.label} &rarr;
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => handleSaveAction(false)}
                leftIcon={<Save className="w-3.5 h-3.5" />}
                className="cursor-pointer text-xs h-8 px-3"
              >
                Save Draft
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={() => handleSaveAction(true)}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                className="cursor-pointer text-xs h-8 px-3.5 font-semibold"
              >
                {saving ? "Saving..." : "Deploy & Activate"}
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
