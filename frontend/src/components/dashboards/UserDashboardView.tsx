import React, { useState, useEffect } from "react";
import {
  PhoneOutgoing,
  Play,
  Volume2,
  CheckCircle,
  UserCheck,
  Send,
  Sparkles,
  RefreshCw,
  PhoneCall
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { fetchApi, LIVE } from "../../api-client";
import { CallRecord } from "../../types";

export const UserDashboardView: React.FC<{
  onStartDialer?: (phoneNumber: string) => void;
}> = ({ onStartDialer }) => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [doneActions, setDoneActions] = useState<string[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchApi<any>("/calls", LIVE);
      const fetchedCalls = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setCalls(fetchedCalls);
      if (fetchedCalls.length > 0 && !selectedCall) {
        setSelectedCall(fetchedCalls[0]);
      }
    } catch (err) {
      console.error("Failed to load user call work queue from DB:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const toggleAction = (key: string) => {
    setDoneActions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const formatDuration = (secs: number) => {
    if (!secs || secs <= 0) return "0s";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  };

  const getPriorityBadge = (c: CallRecord) => {
    if (c.intent?.toLowerCase().includes("schedule") || c.intent?.toLowerCase().includes("appointment")) {
      return <Badge variant="primary" size="sm">SCHEDULED</Badge>;
    }
    if (c.status === "completed" && (c.duration || 0) > 20) {
      return <Badge variant="success" size="sm">ENGAGED</Badge>;
    }
    if (c.status === "busy" || c.status === "no-answer") {
      return <Badge variant="neutral" size="sm">UNANSWERED</Badge>;
    }
    return <Badge variant="outline" size="sm">LOGGED</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex justify-between items-center">
        <div className="text-xs font-semibold text-muted-foreground uppercase">
          Live Call Work Queue ({calls.length} Total in DB)
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs h-8 gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh Calls
        </Button>
      </div>

      {calls.length === 0 && !loading ? (
        <Card className="border-border">
          <CardContent className="p-8 text-center space-y-2">
            <PhoneCall className="w-8 h-8 text-muted-foreground mx-auto" />
            <div className="text-sm font-semibold text-foreground">No call interactions found in database</div>
            <p className="text-xs text-muted-foreground">
              New inbound and outbound calls will automatically populate your live work queue.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* 2-Column Split: Real Calls on Left, Active Call Detail on Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Queue List from DB (5 cols) */}
          <div className="lg:col-span-5 space-y-2 max-h-[680px] overflow-y-auto pr-1">
            {calls.map((call) => {
              const isSelected = selectedCall?.id === call.id;
              const displayContact = call.to_number || call.from_number || "Caller";
              return (
                <div
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      {displayContact}
                      {getPriorityBadge(call)}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatDuration(call.duration || 0)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ID: {call.id} &bull; Status: {call.status}
                  </div>
                  {call.intent && (
                    <div className="text-xs font-medium text-foreground mt-1.5 line-clamp-1">
                      Intent: {call.intent}
                    </div>
                  )}
                  {call.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {call.summary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right: Active Call Execution Card from DB (7 cols) */}
          <div className="lg:col-span-7">
            {selectedCall ? (
              <Card className="border-border">
                <CardHeader className="py-3 px-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold">
                          {selectedCall.to_number || selectedCall.from_number || "Voice Session"}
                        </CardTitle>
                        {getPriorityBadge(selectedCall)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                        Call ID: {selectedCall.id} &bull; Duration: {formatDuration(selectedCall.duration || 0)}
                      </p>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => onStartDialer && onStartDialer(selectedCall.to_number || selectedCall.from_number || "")}
                    >
                      <PhoneOutgoing className="w-3.5 h-3.5" />
                      Dial Contact
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3.5">
                  {/* Spoken AI Call Summary from DB */}
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Sparkles className="w-3.5 h-3.5" />
                      Conversational Intelligence
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      {selectedCall.summary || (selectedCall.prompt ? `Configured initial prompt: "${selectedCall.prompt.slice(0, 140)}..."` : "No conversational summary recorded for this session.")}
                    </p>
                    {selectedCall.intent && (
                      <div className="text-[11px] text-muted-foreground pt-1">
                        Intent Detected: <strong className="text-foreground">{selectedCall.intent}</strong>
                      </div>
                    )}
                  </div>

                  {/* Telephony Metadata Bar from DB */}
                  <div className="p-2.5 rounded-lg border border-border bg-card flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-primary" />
                      <div>
                        <div className="font-medium text-foreground">From: {selectedCall.from_number || "Unknown"}</div>
                        <div className="text-[11px] text-muted-foreground">To: {selectedCall.to_number || "Direct Inbound"}</div>
                      </div>
                    </div>
                    <Badge variant={selectedCall.status === "completed" ? "success" : "neutral"} size="sm">
                      {selectedCall.status}
                    </Badge>
                  </div>

                  {/* Quick Operator Actions */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-xs font-semibold text-foreground">Next Action</span>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant={doneActions.includes("demo") ? "secondary" : "outline"}
                        size="sm"
                        className="text-xs justify-start gap-1 h-8"
                        onClick={() => toggleAction("demo")}
                      >
                        <CheckCircle className={`w-3.5 h-3.5 ${doneActions.includes("demo") ? "text-emerald-500" : ""}`} />
                        Demo Booked
                      </Button>
                      <Button
                        variant={doneActions.includes("proposal") ? "secondary" : "outline"}
                        size="sm"
                        className="text-xs justify-start gap-1 h-8"
                        onClick={() => toggleAction("proposal")}
                      >
                        <Send className={`w-3.5 h-3.5 ${doneActions.includes("proposal") ? "text-primary" : ""}`} />
                        Proposal SMS
                      </Button>
                      <Button
                        variant={doneActions.includes("closer") ? "secondary" : "outline"}
                        size="sm"
                        className="text-xs justify-start gap-1 h-8"
                        onClick={() => toggleAction("closer")}
                      >
                        <UserCheck className={`w-3.5 h-3.5 ${doneActions.includes("closer") ? "text-blue-500" : ""}`} />
                        Escalate
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-8 border border-border rounded-lg text-center text-xs text-muted-foreground">
                Select a call from the queue to view full details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
