import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_NAME: z.string().default('Lab Clinico API'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  FRONT_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_VERIFY_URL: z.string().url().default('http://localhost:5173/verificar'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerido'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  PASSWORD_BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_PATH: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  MAIL_DRIVER: z.enum(['resend', 'smtp']).default('resend'),
  MAIL_FROM: z.string().default('Laboratorio <no-reply@laboratorio.com>'),
  RESEND_API_KEY: z.string().optional(),

  THROTTLE_TTL: z.coerce.number().int().positive().default(60),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  CHROMIUM_PATH: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variables de entorno invalidas:\n${issues}`);
  }
  return parsed.data;
}
