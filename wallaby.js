module.exports = (wallaby) => {
  const config = require('yoshi/config/wallaby-jest')(wallaby);
  config.files.push('__tests__/**/*.js');
  config.files.push('testKit/**/*.[j|t]s');
  config.files.push('testKit/**/*.[j|t]sx');
  config.tests.forEach(x => {
    x.pattern = x.pattern.replace('src', 'test');
  });
  return config;
};
