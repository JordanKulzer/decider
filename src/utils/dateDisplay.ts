import { format, isPast, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";

export const formatLockTime = (closesAt: string): string => {
  return format(new Date(closesAt), "MMM d, yyyy 'at' h:mm a");
};

export const formatCountdown = (closesAt: string): string => {
  const target = new Date(closesAt);
  if (isPast(target)) return "Closed";
  const minutesLeft = differenceInMinutes(target, new Date());
  if (minutesLeft < 60) return `in ${minutesLeft}m`;
  const hoursLeft = differenceInHours(target, new Date());
  if (hoursLeft < 24) return `in ${hoursLeft}h`;
  const daysLeft = differenceInDays(target, new Date());
  if (daysLeft < 7) return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  return format(target, "MMM d");
};

export const getCountdownUrgency = (
  closesAt: string
): "normal" | "warning" | "critical" => {
  const target = new Date(closesAt);
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
