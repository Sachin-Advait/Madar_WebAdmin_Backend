import type { ProfileType } from "./types";

/** Every TV profile type, in the order the admin lists them. Keep in step
 * with profileTypes in services/api/src/domain.mjs. */
export const PROFILE_TYPES: [ProfileType, string][] = [
  ["public", "Public / Visitor"],
  ["employee", "Employee"],
  ["management", "Management"],
  ["vip", "VIP Lounge"],
  ["signage", "Dedicated Signage"],
  ["queue", "Queue Management"],
  ["meeting", "Meeting Management"],
];
export const PROFILE_TYPE_IDS = PROFILE_TYPES.map(([id]) => id);
export const profileTypeName = (id: string) =>
  PROFILE_TYPES.find(([t]) => t === id)?.[1] ?? id;
