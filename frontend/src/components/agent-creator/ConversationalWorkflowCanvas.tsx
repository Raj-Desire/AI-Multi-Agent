import React, { useState } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  HelpCircle,
  PhoneForwarded,
  ShieldAlert,
  Sparkles,
  Info,
  Layers,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { InfoTooltip } from "../ui/Tooltip";
import { WorkflowStageNode, WorkflowBranch, AgentConfig } from "../../types";

interface ConversationalWorkflowCanvasProps {
  agentData: AgentConfig;
  setAgentData: React.Dispatch<React.SetStateAction<AgentConfig>>;
  onSyncToPrompt?: () => void;
}

const DEFAULT_STAGES: WorkflowStageNode[] = [
  {
    id: "stage_greeting",
    title: "1. Greeting & Permission",
    stage_type: "greeting",
    instruction: "Warmly introduce the assistant and ask permission for a 30-second conversation.",
    order: 1,
    key_points: ["State caller name & organization", "Low-friction opening question"],
    branches: [
      {
        condition_label: "Caller has a moment (Yes / Sure)",
        target_stage_id: "stage_discovery",
        keywords: ["yes", "sure", "okay", "go ahead"]
      },
      {
        condition_label: "Caller is busy or driving",
        target_stage_id: "stage_reschedule",
        keywords: ["busy", "driving", "call later", "not now"]
      }
    ]
  },
  {
    id: "stage_discovery",
    title: "2. Need Discovery & Qualification",
    stage_type: "discovery",
    instruction: "Ask one concise question to understand caller requirements, team size, or priority goals.",
    order: 2,
    key_points: ["Single-question cadence", "Listen actively without interrupting"],
    branches: [
      {
        condition_label: "Questions about rates & solutions",
        target_stage_id: "stage_knowledge",
        keywords: ["pricing", "cost", "features", "packages"]
      },
      {
        condition_label: "Price or timing hesitation",
        target_stage_id: "stage_objection",
        keywords: ["expensive", "too much", "next quarter"]
      }
    ]
  },
  {
    id: "stage_knowledge",
    title: "3. Direct Facts & Solution Sharing",
    stage_type: "knowledge",
    instruction: "Deliver exact facts and figures from company knowledge in 1-2 spoken sentences.",
    order: 3,
    key_points: ["Clear figures", "Never invent unverified details"],
    branches: [
      {
        condition_label: "Interested in meeting or scheduling",
        target_stage_id: "stage_action",
        keywords: ["book", "demo", "schedule", "meet", "appointment"]
      }
    ]
  },
  {
    id: "stage_objection",
    title: "4. Objection Handling",
    stage_type: "objection",
    instruction: "Empathize warmly with caller hesitations and present value or flexible options.",
    order: 4,
    key_points: ["Acknowledge concern first", "Do not be defensive or pushy"],
    branches: [
      {
        condition_label: "Receptivity regained",
        target_stage_id: "stage_action",
        keywords: ["makes sense", "let's try", "fair enough"]
      }
    ]
  },
  {
    id: "stage_action",
    title: "5. Confirm Next Step / Booking",
    stage_type: "action",
    instruction: "Confirm agreement on consultation slot, SMS follow-up, or specialist callback.",
    order: 5,
    key_points: ["Confirm date, time, and phone", "State follow-up channel"],
    branches: [
      {
        condition_label: "Action confirmed",
        target_stage_id: "stage_closing",
        keywords: ["confirmed", "sounds good", "perfect"]
      }
    ]
  },
  {
    id: "stage_closing",
    title: "6. Polite Wrap-Up & Closing",
    stage_type: "closing",
    instruction: "Thank the caller courteously and deliver a pleasant sign-off statement.",
    order: 6,
    key_points: ["Short friendly sign-off", "Conclude cleanly"],
    is_terminal: true,
    branches: []
  }
];

export function ConversationalWorkflowCanvas({
  agentData,
  setAgentData,
  onSyncToPrompt
}: ConversationalWorkflowCanvasProps) {
  const currentStages: WorkflowStageNode[] =
    agentData.workflow_stages && agentData.workflow_stages.length > 0
      ? agentData.workflow_stages
      : DEFAULT_STAGES;

  const [expandedStageId, setExpandedStageId] = useState<string | null>(
    currentStages[0]?.id || "stage_greeting"
  );
  const [newBranchCondition, setNewBranchCondition] = useState("");
  const [newBranchTarget, setNewBranchTarget] = useState("");
  const [newBranchKeywords, setNewBranchKeywords] = useState("");

  const updateStages = (stages: WorkflowStageNode[]) => {
    // Re-index order
    const ordered = stages.map((s, idx) => ({ ...s, order: idx + 1 }));
    setAgentData((prev) => ({
      ...prev,
      workflow_stages: ordered
    }));
  };

  const handleAddStage = () => {
    const newId = `stage_${Date.now()}`;
    const newStage: WorkflowStageNode = {
      id: newId,
      title: `Custom Step ${currentStages.length + 1}`,
      stage_type: "custom",
      instruction: "Explain instructions for this step in 1-2 spoken sentences.",
      order: currentStages.length + 1,
      key_points: ["Key conversational objective"],
      branches: []
    };
    updateStages([...currentStages, newStage]);
    setExpandedStageId(newId);
  };

  const handleDeleteStage = (id: string) => {
    if (currentStages.length <= 1) return;
    updateStages(currentStages.filter((s) => s.id !== id));
  };

  const handleMoveStage = (index: number, direction: "up" | "down") => {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentStages.length) return;
    const copy = [...currentStages];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    updateStages(copy);
  };

  const handleUpdateStageField = (
    id: string,
    field: keyof WorkflowStageNode,
    value: any
  ) => {
    updateStages(
      currentStages.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleAddBranch = (stageId: string) => {
    if (!newBranchCondition.trim() || !newBranchTarget) return;
    const kwArray = newBranchKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const newBranch: WorkflowBranch = {
      condition_label: newBranchCondition.trim(),
      target_stage_id: newBranchTarget,
      keywords: kwArray
    };

    updateStages(
      currentStages.map((s) => {
        if (s.id === stageId) {
          return {
            ...s,
            branches: [...(s.branches || []), newBranch]
          };
        }
        return s;
      })
    );

    setNewBranchCondition("");
    setNewBranchKeywords("");
    setNewBranchTarget("");
  };

  const handleDeleteBranch = (stageId: string, branchIdx: number) => {
    updateStages(
      currentStages.map((s) => {
        if (s.id === stageId) {
          const branches = [...(s.branches || [])];
          branches.splice(branchIdx, 1);
          return { ...s, branches };
        }
        return s;
      })
    );
  };

  const getStageTypeBadge = (type: string) => {
    switch (type) {
      case "greeting":
        return <Badge variant="primary" size="sm">Opening</Badge>;
      case "discovery":
        return <Badge variant="neutral" size="sm">Discovery</Badge>;
      case "knowledge":
        return <Badge variant="success" size="sm">Facts &amp; Knowledge</Badge>;
      case "objection":
        return <Badge variant="warning" size="sm">Objection</Badge>;
      case "action":
        return <Badge variant="info" size="sm">Booking/Action</Badge>;
      case "closing":
        return <Badge variant="neutral" size="sm">Wrap-up</Badge>;
      default:
        return <Badge variant="neutral" size="sm">Custom</Badge>;
    }
  };

  return (
    <div className="space-y-4 text-left animate-fade-in">
      {/* Top Banner & Sync Action */}
      <div className="p-3.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.5rem)] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[var(--color-primary)]" />
            <h3 className="text-xs font-bold text-[var(--color-heading)] uppercase tracking-wider">
              Visual Conversational Workflow Canvas
            </h3>
            <Badge variant="primary" size="sm" className="text-[10px]">
              {currentStages.length} Stages
            </Badge>
          </div>
          <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
            Model multi-turn phone conversation stages, trigger branches, and decision flows visually.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onSyncToPrompt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSyncToPrompt}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />}
              className="cursor-pointer text-xs h-8 px-3"
            >
              Compile Canvas to Prompt
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAddStage}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            className="cursor-pointer text-xs h-8 px-3 font-semibold"
          >
            Add Workflow Stage
          </Button>
        </div>
      </div>

      {/* Visual Timeline of Stages */}
      <div className="space-y-3">
        {currentStages.map((stage, idx) => {
          const isExpanded = expandedStageId === stage.id;
          const isFirst = idx === 0;
          const isLast = idx === currentStages.length - 1;

          return (
            <div
              key={stage.id}
              className={`p-3.5 bg-[var(--color-surface)] border rounded-[var(--radius-main,0.5rem)] transition-all shadow-2xs ${
                isExpanded
                  ? "border-[var(--color-primary)]/70 ring-1 ring-[var(--color-primary)]/20"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-strong,var(--color-border))]"
              }`}
            >
              {/* Stage Header */}
              <div
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--color-heading)] truncate">
                        {stage.title}
                      </span>
                      {getStageTypeBadge(stage.stage_type)}
                      {(stage.branches || []).length > 0 && (
                        <span className="text-[10px] text-[var(--color-muted)] font-mono flex items-center gap-1">
                          <GitBranch className="w-3 h-3 text-[var(--color-primary)]" />
                          {(stage.branches || []).length} branches
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)] truncate max-w-md mt-0.5">
                      {stage.instruction}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => handleMoveStage(idx, "up")}
                    className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move Stage Up"
                  >
                    <MoveUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => handleMoveStage(idx, "down")}
                    className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-[var(--color-surface-muted)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Move Stage Down"
                  >
                    <MoveDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={currentStages.length <= 1}
                    onClick={() => handleDeleteStage(stage.id)}
                    className="p-1 rounded text-[var(--color-danger)]/70 hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Delete Stage"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                    className="p-1 text-[var(--color-muted)] hover:text-[var(--color-heading)] rounded cursor-pointer"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expanded Stage Configuration Body */}
              {isExpanded && (
                <div className="mt-3.5 pt-3.5 border-t border-[var(--color-border)] space-y-3.5 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-8 space-y-1">
                      <label className="text-[10px] font-bold text-[var(--color-muted)] uppercase">
                        Stage Title
                      </label>
                      <input
                        type="text"
                        value={stage.title}
                        onChange={(e) => handleUpdateStageField(stage.id, "title", e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium"
                      />
                    </div>

                    <div className="sm:col-span-4 space-y-1">
                      <label className="text-[10px] font-bold text-[var(--color-muted)] uppercase">
                        Stage Archetype
                      </label>
                      <select
                        value={stage.stage_type}
                        onChange={(e) => handleUpdateStageField(stage.id, "stage_type", e.target.value)}
                        className="w-full h-8 px-2 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-medium cursor-pointer"
                      >
                        <option value="greeting">Opening Greeting</option>
                        <option value="discovery">Discovery &amp; Need</option>
                        <option value="qualification">Lead Qualification</option>
                        <option value="knowledge">Facts &amp; Knowledge</option>
                        <option value="objection">Objection Handling</option>
                        <option value="action">Action &amp; Booking</option>
                        <option value="closing">Wrap-Up &amp; Goodbye</option>
                        <option value="custom">Custom Step</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[var(--color-muted)] uppercase flex items-center justify-between">
                      <span>Conversational Directive (What the agent should do/say)</span>
                      <span className="text-[9px] text-[var(--color-primary)]">Strict 1-2 sentence spoken style</span>
                    </label>
                    <textarea
                      rows={2}
                      value={stage.instruction}
                      onChange={(e) => handleUpdateStageField(stage.id, "instruction", e.target.value)}
                      placeholder="e.g. Ask caller if they are free to talk, acknowledging their greeting."
                      className="w-full p-2.5 text-xs bg-[var(--color-surface-muted)] border border-[var(--color-border)] rounded-[var(--radius-main,0.375rem)] text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)] font-mono resize-y"
                    />
                  </div>

                  {/* Branches & Transitions */}
                  <div className="space-y-2 p-3 bg-[var(--color-surface-muted)]/50 rounded-[var(--radius-main,0.375rem)] border border-[var(--color-border)]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-heading)] flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                        <span>Decision Branches &amp; Next Stage Routing</span>
                      </span>
                      <span className="text-[10px] text-[var(--color-muted)]">
                        {(stage.branches || []).length} Rule(s) Configured
                      </span>
                    </div>

                    {(stage.branches || []).length > 0 ? (
                      <div className="space-y-1.5">
                        {(stage.branches || []).map((branch, bIdx) => {
                          const targetStage = currentStages.find((s) => s.id === branch.target_stage_id);
                          return (
                            <div
                              key={bIdx}
                              className="p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-main,0.25rem)] flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-semibold text-[var(--color-heading)] truncate">
                                  If {branch.condition_label}
                                </span>
                                {(branch.keywords || []).length > 0 && (
                                  <span className="text-[10px] text-[var(--color-muted)] font-mono truncate">
                                    [Keywords: {(branch.keywords || []).join(", ")}]
                                  </span>
                                )}
                                <ArrowRight className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
                                <Badge variant="primary" size="sm" className="truncate">
                                  {targetStage?.title || branch.target_stage_id}
                                </Badge>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteBranch(stage.id, bIdx)}
                                className="p-1 text-[var(--color-danger)]/70 hover:text-[var(--color-danger)] cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--color-muted)] italic">
                        No branches defined. The agent will naturally proceed to the next linear step.
                      </p>
                    )}

                    {/* Add Branch Inline Form */}
                    <div className="pt-2 border-t border-[var(--color-border)] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          placeholder="Condition (e.g. Caller says Yes)"
                          value={newBranchCondition}
                          onChange={(e) => setNewBranchCondition(e.target.value)}
                          className="w-full h-7 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          placeholder="Trigger Keywords (comma separated)"
                          value={newBranchKeywords}
                          onChange={(e) => setNewBranchKeywords(e.target.value)}
                          className="w-full h-7 px-2 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <select
                          value={newBranchTarget}
                          onChange={(e) => setNewBranchTarget(e.target.value)}
                          className="w-full h-7 px-1.5 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-heading)] focus:outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value="">Route to Stage...</option>
                          {currentStages
                            .filter((s) => s.id !== stage.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          disabled={!newBranchCondition.trim() || !newBranchTarget}
                          onClick={() => handleAddBranch(stage.id)}
                          className="w-full h-7 px-2 bg-[var(--color-primary)] text-white text-[11px] font-semibold rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Route</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
