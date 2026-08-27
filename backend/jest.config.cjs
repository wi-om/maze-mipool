/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@common$": "<rootDir>/src/common/index",
    "^@common/(.*)$": "<rootDir>/src/common/$1",
    "^@modules/(.*)$": "<rootDir>/src/modules/$1",
    "^@blockchainData$": "<rootDir>/src/blockchainData/index",
    "^@blockchainData/(.*)$": "<rootDir>/src/blockchainData/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

