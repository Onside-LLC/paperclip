/**
 * Hardcoded subscription plan limits for prototype.
 * These represent approximate weekly token limits for Claude subscription tiers.
 * In the future this could be configurable per-company or per-agent.
 */

export interface SubscriptionPlan {
  id: string;
  label: string;
  weeklyOutputTokens: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: "pro", label: "Claude Pro", weeklyOutputTokens: 45_000_000 },
  { id: "max_5x", label: "Claude Max 5x", weeklyOutputTokens: 225_000_000 },
  { id: "max_20x", label: "Claude Max 20x", weeklyOutputTokens: 900_000_000 },
];

export const DEFAULT_SUBSCRIPTION_PLAN = SUBSCRIPTION_PLANS[0];

export function getSubscriptionPlan(id: string): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id) ?? DEFAULT_SUBSCRIPTION_PLAN;
}

export function formatSubscriptionUsage(
  outputTokens: number,
  plan: SubscriptionPlan,
): { percent: number; label: string } {
  const percent = plan.weeklyOutputTokens > 0
    ? Number(((outputTokens / plan.weeklyOutputTokens) * 100).toFixed(1))
    : 0;
  return {
    percent,
    label: `${percent}% of ${plan.label} weekly limit`,
  };
}
