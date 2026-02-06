import { Vote, DecisionOption } from "../types/decisions";

export interface CalculatedResult {
  option_id: string;
  total_points: number;
  average_rank: number | null;
  rank: number;
  is_winner: boolean;
}

export const calculatePointResults = (
  options: DecisionOption[],
  votes: Vote[]
): CalculatedResult[] => {
  const totals = new Map<string, number>();

  for (const option of options) {
    totals.set(option.id, 0);
  }

  for (const vote of votes) {
    const current = totals.get(vote.option_id) || 0;
    totals.set(vote.option_id, current + vote.value);
  }

  const sorted = Array.from(totals.entries()).sort(([, a], [, b]) => b - a);

  return sorted.map(([optionId, total], index) => ({
    option_id: optionId,
    total_points: total,
    average_rank: null,
    rank: index + 1,
    is_winner: index === 0,
  }));
};

export const calculateRankingResults = (
  options: DecisionOption[],
  votes: Vote[]
): CalculatedResult[] => {
  const rankSums = new Map<string, number>();
  const rankCounts = new Map<string, number>();

  for (const option of options) {
    rankSums.set(option.id, 0);
    rankCounts.set(option.id, 0);
  }

  for (const vote of votes) {
    const currentSum = rankSums.get(vote.option_id) || 0;
    rankSums.set(vote.option_id, currentSum + vote.value);
    const currentCount = rankCounts.get(vote.option_id) || 0;
    rankCounts.set(vote.option_id, currentCount + 1);
  }

  const sorted = Array.from(rankSums.entries())
    .map(([optionId, sum]) => {
      const count = rankCounts.get(optionId) || 1;
      return { optionId, avgRank: sum / count };
    })
    .sort((a, b) => a.avgRank - b.avgRank);

  const maxPoints = options.length;
  return sorted.map((item, index) => ({
    option_id: item.optionId,
    total_points: maxPoints - index,
    average_rank: item.avgRank,
    rank: index + 1,
    is_winner: index === 0,
  }));
};
