import React from "react";
import { View } from "react-native";
import PointAllocation from "./PointAllocation";
import ForcedRanking from "./ForcedRanking";
import type { Decision, DecisionOption } from "../types/decisions";

interface VotingInterfaceProps {
  decision: Decision;
  options: DecisionOption[];
  onVoteSubmitted: () => void;
}

const VotingInterface: React.FC<VotingInterfaceProps> = ({
  decision,
  options,
  onVoteSubmitted,
}) => {
  if (decision.voting_mechanism === "forced_ranking") {
    return (
      <ForcedRanking
        decisionId={decision.id}
        options={options}
        onVoteSubmitted={onVoteSubmitted}
      />
    );
  }

  return (
    <PointAllocation
      decisionId={decision.id}
      options={options}
      onVoteSubmitted={onVoteSubmitted}
    />
  );
};

export default VotingInterface;
