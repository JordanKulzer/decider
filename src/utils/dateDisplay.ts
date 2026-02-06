import { format, formatDistanceToNowStrict, isPast, differenceInMinutes, differenceInHours } from "date-fns";

export const formatLockTime = (lockTime: string): string => {
  return format(new Date(lockTime), "MMM d, yyyy 'at' h:mm a");
};

export const formatCountdown = (lockTime: string): string => {
  const target = new Date(lockTime);
  if (isPast(target)) return "Locked";
  return formatDistanceToNowStrict(target, { addSuffix: true });
};

export const getCountdownUrgency = (
  lockTime: string
): "normal" | "warning" | "critical" => {
  const target = new Date(lockTime);
  if (isPast(target)) return "critical";
  const minutesLeft = differenceInMinutes(target, new Date());
  if (minutesLeft <= 5) return "critical";
  const hoursLeft = differenceInHours(target, new Date());
  if (hoursLeft < 1) return "warning";
  return "normal";
};

export const generateInviteCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};
