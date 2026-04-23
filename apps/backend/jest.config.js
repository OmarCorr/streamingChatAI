/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // Explicit skips per tasks.md: DTOs (class-validator trusted), controllers (thin wrappers), modules (pure wiring)
    '!**/*.module.ts',
    '!**/*.dto.ts',
    '!**/*.controller.ts',
    '!**/main.ts',
    '!**/__mocks__/**',
  ],
  coverageThreshold: {
    './src/modules/chat/': { statements: 70 },
    './src/modules/llm/': { statements: 70 },
    './src/modules/session/': { statements: 70 },
    './src/modules/conversation/': { statements: 70 },
    './src/modules/observability/': { statements: 70 },
  },
  coverageDirectory: '../coverage',
  moduleFileExtensions: ['js', 'json', 'ts'],
  passWithNoTests: true,
  // langfuse uses dynamic import in media module which breaks Jest CJS mode
  // Mock the package at the Jest module resolver level for all tests
  moduleNameMapper: {
    '^langfuse$': '<rootDir>/../__mocks__/langfuse.ts',
  },
};
