import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageProvider: 'v8',
  testMatch: ['**/*.test.ts', 'tests/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/helpers/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/helpers/globalTeardown.ts',
  setupFiles: ['<rootDir>/tests/helpers/setupEnv.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/jest.setup.ts'],
  moduleNameMapper: {
  '^jose$': 'jose-node-cjs-runtime',
  '^file-type$': '<rootDir>/tests/__mocks__/file-type.ts',
},
  maxWorkers: 4,
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        diagnostics: false,
      },
    ],
  },
};
export default config;