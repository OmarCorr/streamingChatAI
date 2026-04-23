import { EnvSchema, validateEnv } from './env';

describe('EnvSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
    GEMINI_API_KEY: 'some-key',
    LANGFUSE_SECRET_KEY: 'sk-lf-secret',
    LANGFUSE_PUBLIC_KEY: 'pk-lf-public',
    LANGFUSE_HOST: 'http://localhost:3100',
    COOKIE_SECRET: 'a'.repeat(32),
    PORT: '3001',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  };

  it('parses all vars when valid', () => {
    const result = EnvSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
      expect(result.data.NODE_ENV).toBe('test');
    }
  });

  it('applies default PORT=3001 when not provided', () => {
    const env = { ...validEnv };
    delete (env as Partial<typeof validEnv>).PORT;
    const result = EnvSchema.safeParse(env);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
    }
  });

  it('applies default FRONTEND_URL when not provided', () => {
    const env = { ...validEnv };
    delete (env as Partial<typeof validEnv>).FRONTEND_URL;
    const result = EnvSchema.safeParse(env);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.FRONTEND_URL).toBe('http://localhost:3000');
    }
  });

  it('fails when GEMINI_API_KEY is absent', () => {
    const env = { ...validEnv };
    delete (env as Partial<typeof validEnv>).GEMINI_API_KEY;
    const result = EnvSchema.safeParse(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('GEMINI_API_KEY');
    }
  });

  it('fails when LANGFUSE_HOST is not a URL', () => {
    const env = { ...validEnv, LANGFUSE_HOST: 'not-a-url' };
    const result = EnvSchema.safeParse(env);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('LANGFUSE_HOST');
    }
  });

  it('fails when COOKIE_SECRET is shorter than 32 chars', () => {
    const env = { ...validEnv, COOKIE_SECRET: 'short' };
    const result = EnvSchema.safeParse(env);
    expect(result.success).toBe(false);
  });
});

describe('HOST_HAS_TLS', () => {
  it("accepts 'true' and parses to the string 'true'", () => {
    const result = EnvSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
      GEMINI_API_KEY: 'some-key',
      LANGFUSE_SECRET_KEY: 'sk-lf-secret',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-public',
      LANGFUSE_HOST: 'http://localhost:3100',
      COOKIE_SECRET: 'a'.repeat(32),
      NODE_ENV: 'test',
      HOST_HAS_TLS: 'true',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.HOST_HAS_TLS).toBe('true');
    }
  });

  it("accepts 'false' and parses to the string 'false'", () => {
    const result = EnvSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
      GEMINI_API_KEY: 'some-key',
      LANGFUSE_SECRET_KEY: 'sk-lf-secret',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-public',
      LANGFUSE_HOST: 'http://localhost:3100',
      COOKIE_SECRET: 'a'.repeat(32),
      NODE_ENV: 'test',
      HOST_HAS_TLS: 'false',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.HOST_HAS_TLS).toBe('false');
    }
  });

  it("defaults to 'false' when HOST_HAS_TLS is absent", () => {
    const result = EnvSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
      GEMINI_API_KEY: 'some-key',
      LANGFUSE_SECRET_KEY: 'sk-lf-secret',
      LANGFUSE_PUBLIC_KEY: 'pk-lf-public',
      LANGFUSE_HOST: 'http://localhost:3100',
      COOKIE_SECRET: 'a'.repeat(32),
      NODE_ENV: 'test',
      // HOST_HAS_TLS intentionally absent
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.HOST_HAS_TLS).toBe('false');
    }
  });

  it.each(['yes', '1', 'TRUE', 'True', '0'])(
    "rejects invalid value '%s' with a Zod error",
    (invalidValue) => {
      const result = EnvSchema.safeParse({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
        GEMINI_API_KEY: 'some-key',
        LANGFUSE_SECRET_KEY: 'sk-lf-secret',
        LANGFUSE_PUBLIC_KEY: 'pk-lf-public',
        LANGFUSE_HOST: 'http://localhost:3100',
        COOKIE_SECRET: 'a'.repeat(32),
        NODE_ENV: 'test',
        HOST_HAS_TLS: invalidValue,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('HOST_HAS_TLS');
      }
    },
  );
});

describe('validateEnv()', () => {
  const originalEnv = process.env;
  let exitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleTableSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleTableSpy = jest.spyOn(console, 'table').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleTableSpy.mockRestore();
  });

  it('calls process.exit(1) when GEMINI_API_KEY is missing', () => {
    process.env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_HOST: 'http://localhost:3100',
      COOKIE_SECRET: 'a'.repeat(32),
      // GEMINI_API_KEY intentionally omitted
    } as NodeJS.ProcessEnv;
    validateEnv();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not call process.exit when all vars are valid', () => {
    process.env = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/chatdb',
      GEMINI_API_KEY: 'key',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_HOST: 'http://localhost:3100',
      COOKIE_SECRET: 'a'.repeat(32),
      PORT: '3001',
      FRONTEND_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    };
    validateEnv();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
