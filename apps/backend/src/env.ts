import { z } from 'zod';

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  LANGFUSE_SECRET_KEY: z.string().min(1, 'LANGFUSE_SECRET_KEY is required'),
  LANGFUSE_PUBLIC_KEY: z.string().min(1, 'LANGFUSE_PUBLIC_KEY is required'),
  LANGFUSE_HOST: z.string().url(),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

// Exported typed singleton; populated by validateEnv()
export let env: Env = undefined as unknown as Env;

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('\n[env] Invalid or missing environment variables:\n');
    const rows = result.error.issues.map((issue) => ({
      variable: issue.path.join('.'),
      problem: issue.message,
    }));
    console.table(rows);
    console.error('\nFix the above variables in your .env file and retry.\n');
    process.exit(1);
  }
  env = result.data;
  return env;
}
