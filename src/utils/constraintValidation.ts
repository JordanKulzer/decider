import { Constraint, DecisionOption } from "../types/decisions";

interface ValidationResult {
  passes: boolean;
  violations: Array<{ constraint_id: string; reason: string }>;
}

export const validateOptionAgainstConstraints = (
  option: Pick<DecisionOption, "title" | "description" | "metadata">,
  constraints: Constraint[]
): ValidationResult => {
  const violations: Array<{ constraint_id: string; reason: string }> = [];

  for (const constraint of constraints) {
    switch (constraint.type) {
      case "budget_max": {
        const price = option.metadata?.price;
        const max = constraint.value?.max;
        if (price != null && max != null && price > max) {
          violations.push({
            constraint_id: constraint.id,
            reason: `Price $${price} exceeds budget of $${max}`,
          });
        }
        break;
      }
      case "date_range": {
        const optionDate = option.metadata?.date;
        const start = constraint.value?.start;
        const end = constraint.value?.end;
        if (optionDate && start && end) {
          const d = new Date(optionDate);
          if (d < new Date(start) || d > new Date(end)) {
            violations.push({
              constraint_id: constraint.id,
              reason: "Date falls outside allowed range",
            });
          }
        }
        break;
      }
      case "distance": {
        const dist = option.metadata?.distance;
        const maxDist = constraint.value?.max;
        if (dist != null && maxDist != null && dist > maxDist) {
          violations.push({
            constraint_id: constraint.id,
            reason: `Distance ${dist}mi exceeds limit of ${maxDist}mi`,
          });
        }
        break;
      }
      case "duration": {
        const dur = option.metadata?.duration;
        const maxDur = constraint.value?.max;
        if (dur != null && maxDur != null && dur > maxDur) {
          violations.push({
            constraint_id: constraint.id,
            reason: `Duration ${dur}h exceeds limit of ${maxDur}h`,
          });
        }
        break;
      }
      case "exclusion": {
        const exclusionText = constraint.value?.text?.toLowerCase();
        const optionTitle = option.title.toLowerCase();
        const optionDesc = (option.description || "").toLowerCase();
        if (
          exclusionText &&
          (optionTitle.includes(exclusionText) ||
            optionDesc.includes(exclusionText))
        ) {
          violations.push({
            constraint_id: constraint.id,
            reason: `Contains excluded term: "${constraint.value?.text}"`,
          });
        }
        break;
      }
    }
  }

  return {
    passes: violations.length === 0,
    violations,
  };
};
