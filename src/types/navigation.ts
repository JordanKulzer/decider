export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPasswordScreen: undefined;
  HomeScreen: undefined;
  CreateDecisionScreen: undefined;
  DecisionDetailScreen: {
    decisionId: string;
  };
  JoinDecisionScreen: {
    decisionId?: string;
    inviteCode?: string;
  };
  ProfileScreen: undefined;
};
