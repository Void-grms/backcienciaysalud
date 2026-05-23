import type { UserRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  role: UserRole;
  email: string | null;
  mustChangePassword: boolean;
}
