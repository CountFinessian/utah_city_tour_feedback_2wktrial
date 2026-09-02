export type UserRole = "host" | "leader";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  title: string;
};

type StoredUser = AuthUser & {
  passwordHash: string;
};

// In-memory predefined pilot accounts. Passwords can also be matched plain for pilot accounts.
export const PILOT_USERS: StoredUser[] = [
  {
    id: "usr_host_aiden",
    email: "aiden@utahcity.com",
    name: "Aiden",
    role: "host",
    title: "Tour Host",
    passwordHash: "host2026!",
  },
  {
    id: "usr_leader_nate",
    email: "nate@utahcity.com",
    name: "Nate",
    role: "leader",
    title: "Utah City Leadership",
    passwordHash: "leader2026!",
  },
];

export function findUserByEmail(email: string): AuthUser | null {
  const normalized = email.trim().toLowerCase();
  const user = PILOT_USERS.find((u) => u.email.toLowerCase() === normalized);
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

export function verifyUserCredentials(email: string, password: string): AuthUser | null {
  const normalized = email.trim().toLowerCase();
  const user = PILOT_USERS.find((u) => u.email.toLowerCase() === normalized);
  if (!user) return null;
  if (user.passwordHash !== password) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}
