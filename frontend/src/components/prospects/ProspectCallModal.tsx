import React, { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Prospect, AgentConfig, TwilioConfig, AvailableAgentsResponse } from "../../types";
import { fetchApi } from "../../api-client";
import { toast } from "sonner";
import {
  Bot,
  PhoneOutgoing,
  ShieldAlert,
  User,
  Building2,
  Sparkles,
  PhoneCall,
  AlertTriangle,
  Radio
} from "lucide-react";

interface ProspectCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  prospect: Prospect | null;
  onCallInitiated?: (sessionId: string, callSid: string) => void;
}

export function ProspectCallModal({
  isOpen,
  onClose,
  prospect,
  onCallInitiated,
}: ProspectCallModalProps) {
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>("");
  const [customGreeting, setCustomGreeting] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  useEffect(() => {
    if (isOpen && prospect) {
      loadDependencies();
    }
  }, [isOpen, prospect]);

  const loadDependencies = async () => {
    try {
      setIsLoading(true);
      const [twRes, agentsRes] = await Promise.all([
        fetchApi<TwilioConfig>("/twilio/config").catch(() => null),
        fetchApi<AvailableAgentsResponse>("/agents/available").catch(() => ({ my_agents: [], default_agents: [] })),
      ]);

      if (twRes) {
        setTwilioConfig(twRes);
        const nums = twRes.phone_number ? twRes.phone_number.split(",").map((n) => n.trim()).filter(Boolean) : [];
        if (nums.length > 0) {
          setSelectedFromNumber(nums[0]);
        }
      }

      const allAgents = [...(agentsRes.my_agents || []), ...(agentsRes.default_agents || [])];
      setAvailableAgents(allAgents);
      if (allAgents.length > 0) {
        setSelectedAgentId(twRes?.default_agent_id || allAgents[0].agent_id);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load calling configurations.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!prospect) return null;

  const isDNC = prospect.is_dnc || prospect.status === "Do Not Contact";
  const availableNumbers = twilioConfig?.phone_number
    ? twilioConfig.phone_number.split(",").map((n) => n.trim()).filter(Boolean)
    : [];

  const handleStartCall = async () => {
    if (isDNC) {
      toast.error("Call blocked: This contact is marked as 'Do Not Contact'.");
      return;
    }

    if (!selectedAgentId) {
      toast.error("Please select an AI Voice Agent.");
      return;
    }

    try {
      setIsCalling(true);
      const selectedAgent = availableAgents.find((a) => a.agent_id === selectedAgentId);

      const res = await fetchApi<{ call_session_id: string; call_sid: string }>("/voice/test-call", {
        method: "POST",
        body: JSON.stringify({
          to_number: prospect.phone_number,
          from_number: selectedFromNumber || availableNumbers[0] || "",
          agent_id: selectedAgentId,
          prospect_id: prospect.id,
          custom_prompt: customGreeting.trim() || undefined,
          agent_config_override: customGreeting.trim() && selectedAgent
            ? { ...selectedAgent, greeting: customGreeting.trim() }
            : undefined,
        }),
      });

      toast.success(`Outbound call dispatched to ${prospect.full_name}! (SID: ${res.call_sid.slice(0, 10)}...)`);
      if (onCallInitiated) {
        onCallInitiated(res.call_session_id, res.call_sid);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate AI call.");
    } finally {
      setIsCalling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dispatch AI Voice Call"
      description={`Initiate an automated outbound voice session with ${prospect.full_name}.`}
      maxWidth="md"
    >
      <div className="space-y-4 text-xs text-left">
        {/* DNC Warning */}
        {isDNC && (
          <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Do Not Contact (DNC) Hard Block Active</p>
              <p className="text-[11px] leading-relaxed mt-0.5">
                This contact is marked as <strong>Do Not Contact</strong>. The platform strictly prevents initiating calls to this phone number to maintain compliance.
              </p>
            </div>
          </div>
        )}

        {/* Prospect Info Card */}
        <div className="p-3 rounded-[var(--radius-main,0.375rem)] bg-[var(--color-surface-muted)] border border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center font-bold text-xs uppercase">
              {prospect.full_name.charAt(0) || "C"}
            </div>
            <div>
              <div className="font-semibold text-[var(--color-heading)] flex items-center gap-2">
                <span>{prospect.full_name}</span>
                <Badge variant={prospect.status === "Do Not Contact" ? "danger" : "primary"}>
                  {prospect.status}
                </Badge>
              </div>
              <div className="text-[11px] text-[var(--color-muted)] flex items-center gap-2 mt-0.5">
                <span className="font-mono">{prospect.phone_number}</span>
                {prospect.company && <span>&bull; {prospect.company}</span>}
              </div>
            </div>
          </div>

          <div className="text-right text-[11px] text-[var(--color-muted)]">
            <span>Calls: <strong>{prospect.total_calls}</strong></span>
          </div>
        </div>

        {/* Agent Selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">
            Select AI Voice Agent
          </label>
          <div className="relative">
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              disabled={isDNC || isLoading}
              className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)] disabled:opacity-50"
            >
              {availableAgents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.name} &mdash; {agent.role} ({agent.voice?.voice || "Standard Voice"})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Outbound Caller ID Selector */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">
            Outbound Caller ID (From)
          </label>
          {availableNumbers.length > 0 ? (
            <select
              value={selectedFromNumber}
              onChange={(e) => setSelectedFromNumber(e.target.value)}
              disabled={isDNC || isLoading}
              className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)] font-mono disabled:opacity-50"
            >
              {availableNumbers.map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
          ) : (
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-600 dark:text-amber-400">
              No phone numbers configured in Phone &amp; Voice settings.
            </div>
          )}
        </div>

        {/* Custom Greeting Override */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-heading)] mb-1">
            Custom Opening Greeting (Optional Override)
          </label>
          <textarea
            rows={2}
            placeholder={`Leave blank to use the agent's default greeting, or customize specifically for ${prospect.full_name}...`}
            value={customGreeting}
            onChange={(e) => setCustomGreeting(e.target.value)}
            disabled={isDNC || isLoading}
            className="w-full px-2.5 py-1.5 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-heading)] disabled:opacity-50"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isDNC || availableNumbers.length === 0}
            isLoading={isCalling}
            onClick={handleStartCall}
            leftIcon={<PhoneOutgoing className="w-3.5 h-3.5" />}
          >
            {isDNC ? "Call Blocked (DNC)" : "Place AI Voice Call"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
