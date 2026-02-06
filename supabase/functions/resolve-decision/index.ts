import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date().toISOString();

    // Find voting decisions past their lock time
    const { data: expiredDecisions, error: fetchError } = await supabase
      .from("decisions")
      .select("id, voting_mechanism")
      .eq("status", "voting")
      .lte("lock_time", now);

    if (fetchError) throw fetchError;
    if (!expiredDecisions || expiredDecisions.length === 0) {
      return new Response(JSON.stringify({ resolved: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let resolvedCount = 0;

    for (const decision of expiredDecisions) {
      const { data: options } = await supabase
        .from("options")
        .select("id")
        .eq("decision_id", decision.id)
        .eq("passes_constraints", true);

      const { data: votes } = await supabase
        .from("votes")
        .select("option_id, value")
        .eq("decision_id", decision.id);

      if (!options || options.length === 0) {
        // No options — just lock with no results
        await supabase
          .from("decisions")
          .update({ status: "locked" })
          .eq("id", decision.id);
        resolvedCount++;
        continue;
      }

      const results = calculateResults(
        decision.voting_mechanism,
        options,
        votes || [],
      );

      const resultRows = results.map((r: any) => ({
        decision_id: decision.id,
        ...r,
      }));

      if (resultRows.length > 0) {
        await supabase.from("results").insert(resultRows);
      }

      await supabase
        .from("decisions")
        .update({ status: "locked" })
        .eq("id", decision.id);

      resolvedCount++;
    }

    return new Response(JSON.stringify({ resolved: resolvedCount }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

function calculateResults(
  mechanism: string,
  options: Array<{ id: string }>,
  votes: Array<{ option_id: string; value: number }>,
) {
  if (mechanism === "forced_ranking") {
    return calculateRankingResults(options, votes);
  }
  return calculatePointResults(options, votes);
}

function calculatePointResults(
  options: Array<{ id: string }>,
  votes: Array<{ option_id: string; value: number }>,
) {
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
}

function calculateRankingResults(
  options: Array<{ id: string }>,
  votes: Array<{ option_id: string; value: number }>,
) {
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
}
