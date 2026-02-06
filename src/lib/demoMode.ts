let _isDemoMode = false;

export const DEMO_USER_ID = "demo-user-00000000-0000-0000-0000-000000000001";
export const DEMO_USER = {
  id: DEMO_USER_ID,
  email: "demo@decider.app",
  user_metadata: { username: "demo_user" },
};

export const isDemoMode = () => _isDemoMode;

export const enableDemoMode = () => {
  _isDemoMode = true;
};

export const disableDemoMode = () => {
  _isDemoMode = false;
};
