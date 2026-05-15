// server/lib/planLimits.js
// Central configuration for all plan-based feature limits.
// Update these values here to adjust limits across the entire application.

export const PLAN_LIMITS = {
  free: {
    emailLookupsPerMonth: 3,
    draftEmail: false,
    aiFeedback: false,
  },
  pro: {
    emailLookupsPerMonth: 30,
    draftEmail: true,
    aiFeedback: true,
  },
};
