const config = {
  testMatch: ['<rootDir>/**/*.spec.ts?(x)'],
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
