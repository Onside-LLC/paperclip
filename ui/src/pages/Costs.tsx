import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { costsApi } from "../api/costs";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { cn, formatCents, formatTokens } from "../lib/utils";
import { Identity } from "../components/Identity";
import { StatusBadge } from "../components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  DEFAULT_SUBSCRIPTION_PLAN,
  formatSubscriptionUsage,
  type SubscriptionPlan,
} from "../lib/subscription-plans";

type DatePreset = "mtd" | "7d" | "30d" | "ytd" | "all" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  mtd: "Month to Date",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  ytd: "Year to Date",
  all: "All Time",
  custom: "Custom",
};

function computeRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  switch (preset) {
    case "mtd": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: d.toISOString(), to };
    }
    case "7d": {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "30d": {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: d.toISOString(), to };
    }
    case "ytd": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: d.toISOString(), to };
    }
    case "all":
      return { from: "", to: "" };
    case "custom":
      return { from: "", to: "" };
  }
}

export function Costs() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [preset, setPreset] = useState<DatePreset>("mtd");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(DEFAULT_SUBSCRIPTION_PLAN);

  useEffect(() => {
    setBreadcrumbs([{ label: "Costs" }]);
  }, [setBreadcrumbs]);

  const { from, to } = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom ? new Date(customFrom).toISOString() : "",
        to: customTo ? new Date(customTo + "T23:59:59.999Z").toISOString() : "",
      };
    }
    return computeRange(preset);
  }, [preset, customFrom, customTo]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.costs(selectedCompanyId!, from || undefined, to || undefined),
    queryFn: async () => {
      const [summary, byAgent, byProject] = await Promise.all([
        costsApi.summary(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byAgent(selectedCompanyId!, from || undefined, to || undefined),
        costsApi.byProject(selectedCompanyId!, from || undefined, to || undefined),
      ]);
      return { summary, byAgent, byProject };
    },
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={DollarSign} message="Select a company to view costs." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="costs" />;
  }

  const presetKeys: DatePreset[] = ["mtd", "7d", "30d", "ytd", "all", "custom"];

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex flex-wrap items-center gap-2">
        {presetKeys.map((p) => (
          <Button
            key={p}
            variant={preset === p ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setPreset(p)}
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <CostsBody
          data={data}
          preset={preset}
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
        />
      )}
    </div>
  );
}

function CostsBody({
  data,
  preset,
  selectedPlan,
  onPlanChange,
}: {
  data: {
    summary: { spendCents: number; budgetCents: number; utilizationPercent: number };
    byAgent: Array<{
      agentId: string;
      agentName: string | null;
      agentStatus: string | null;
      costCents: number;
      inputTokens: number;
      outputTokens: number;
      apiRunCount: number;
      subscriptionRunCount: number;
      subscriptionInputTokens: number;
      subscriptionOutputTokens: number;
    }>;
    byProject: Array<{
      projectId: string | null;
      projectName: string | null;
      costCents: number;
      inputTokens: number;
      outputTokens: number;
    }>;
  };
  preset: DatePreset;
  selectedPlan: SubscriptionPlan;
  onPlanChange: (plan: SubscriptionPlan) => void;
}) {
  const totalSubRuns = data.byAgent.reduce((sum, r) => sum + r.subscriptionRunCount, 0);
  const totalApiRuns = data.byAgent.reduce((sum, r) => sum + r.apiRunCount, 0);
  const totalSubOutputTokens = data.byAgent.reduce((sum, r) => sum + r.subscriptionOutputTokens, 0);
  const totalSubInputTokens = data.byAgent.reduce((sum, r) => sum + r.subscriptionInputTokens, 0);
  const hasSubscriptionRuns = totalSubRuns > 0;
  const hasApiRuns = totalApiRuns > 0;
  const subscriptionUsage = formatSubscriptionUsage(totalSubOutputTokens, selectedPlan);

  return (
    <>
      {/* Summary card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{PRESET_LABELS[preset]}</p>
            {data.summary.budgetCents > 0 && (
              <p className="text-sm text-muted-foreground">
                {data.summary.utilizationPercent}% utilized
              </p>
            )}
          </div>

          {hasApiRuns && (
            <p className="text-2xl font-bold">
              {formatCents(data.summary.spendCents)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {hasSubscriptionRuns ? "(API runs only)" : data.summary.budgetCents > 0
                  ? `/ ${formatCents(data.summary.budgetCents)}`
                  : "Unlimited budget"}
              </span>
            </p>
          )}

          {!hasApiRuns && !hasSubscriptionRuns && (
            <p className="text-2xl font-bold">
              {formatCents(data.summary.spendCents)}{" "}
              <span className="text-base font-normal text-muted-foreground">
                {data.summary.budgetCents > 0
                  ? `/ ${formatCents(data.summary.budgetCents)}`
                  : "Unlimited budget"}
              </span>
            </p>
          )}

          {data.summary.budgetCents > 0 && hasApiRuns && (
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color] duration-150",
                  data.summary.utilizationPercent > 90 ? "bg-red-400"
                    : data.summary.utilizationPercent > 70 ? "bg-yellow-400"
                    : "bg-green-400",
                )}
                style={{ width: `${Math.min(100, data.summary.utilizationPercent)}%` }}
              />
            </div>
          )}

          {hasSubscriptionRuns && (
            <div className={cn(hasApiRuns && "border-t border-border pt-3", "space-y-2")}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Subscription usage</p>
                <select
                  className="h-6 text-xs rounded border border-input bg-background px-1 text-foreground"
                  value={selectedPlan.id}
                  onChange={(e) => {
                    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === e.target.value);
                    if (plan) onPlanChange(plan);
                  }}
                >
                  {SUBSCRIPTION_PLANS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-bold">{subscriptionUsage.percent}%</span>
                <span className="text-sm text-muted-foreground">
                  of {selectedPlan.label} weekly limit
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width,background-color] duration-150",
                    subscriptionUsage.percent > 90 ? "bg-red-400"
                      : subscriptionUsage.percent > 70 ? "bg-yellow-400"
                      : "bg-blue-400",
                  )}
                  style={{ width: `${Math.min(100, subscriptionUsage.percent)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatTokens(totalSubOutputTokens)} output / {formatTokens(totalSubInputTokens)} input tokens
                {" across "}{totalSubRuns} subscription run{totalSubRuns !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* By Agent / By Project */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">By Agent</h3>
            {data.byAgent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cost events yet.</p>
            ) : (
              <div className="space-y-3">
                {data.byAgent.map((row) => {
                  const isSubOnly = row.subscriptionRunCount > 0 && row.apiRunCount === 0;
                  return (
                    <div
                      key={row.agentId}
                      className="flex items-start justify-between text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Identity
                          name={row.agentName ?? row.agentId}
                          size="sm"
                        />
                        {row.agentStatus === "terminated" && (
                          <StatusBadge status="terminated" />
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {isSubOnly ? (
                          <>
                            <span className="font-medium block">
                              {formatTokens(row.subscriptionOutputTokens)} out tok
                            </span>
                            <span className="text-xs text-muted-foreground block">
                              {formatTokens(row.subscriptionInputTokens)} in tok
                              {" / "}{row.subscriptionRunCount} run{row.subscriptionRunCount !== 1 ? "s" : ""}
                            </span>
                            <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 mt-0.5">
                              subscription
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium block">{formatCents(row.costCents)}</span>
                            <span className="text-xs text-muted-foreground block">
                              in {formatTokens(row.inputTokens)} / out {formatTokens(row.outputTokens)} tok
                            </span>
                            {row.subscriptionRunCount > 0 && (
                              <span className="text-xs text-muted-foreground block">
                                + {row.subscriptionRunCount} subscription run{row.subscriptionRunCount !== 1 ? "s" : ""}
                                {" ("}{formatTokens(row.subscriptionOutputTokens)} out tok)
                              </span>
                            )}
                            {row.apiRunCount > 0 && (
                              <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 mt-0.5">
                                api
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">By Project</h3>
            {data.byProject.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project-attributed run costs yet.</p>
            ) : (
              <div className="space-y-2">
                {data.byProject.map((row) => (
                  <div
                    key={row.projectId ?? "na"}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">
                      {row.projectName ?? row.projectId ?? "Unattributed"}
                    </span>
                    <span className="font-medium">{formatCents(row.costCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
