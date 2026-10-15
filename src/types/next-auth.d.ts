import "next-auth";
import "next-auth/jwt";
import type { AppKey, AppUserRole } from "@/lib/peopleTypes";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
      image?: string | null;
      role: AppUserRole;
      appUserId: string;
      appKeys: AppKey[];
      mustChangePassword: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appUserId?: string;
    role?: AppUserRole;
    appKeys?: AppKey[];
    appUserSyncedAt?: number;
    mustChangePassword?: boolean;
  }
}
