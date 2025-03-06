const config = {
  testMatch: ['<rootDir>/**/*.spec.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/spec-setup.js'],
  transform: {
    '\\.tsx?$': 'ts-jest',
  },
};

const inTeamCity = () =>
  !!(process.env.BUILD_NUMBER || process.env.TEAMCITY_VERSION);

if (inTeamCity()) {
  config.testResultsProcessor = require.resolve('jest-teamcity-reporter');
}

module.exports = config;
