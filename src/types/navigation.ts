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
  // Guest entry
  GuestNameScreen: {
    /** "quickstart" navigates to QuickStartScreen after name entry.
     *  "join" navigates to JoinDecisionScreen after name entry. */
    mode: "quickstart" | "join";
  };
  // Quick Mode screens
  QuickStartScreen: undefined;
  LiveDecisionScreen: {
    decisionId: string;
  };
};
