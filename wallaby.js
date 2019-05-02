module.exports = (wallaby) => {
  const config = require('yoshi/config/wallaby-jest')(wallaby);
  config.tests.forEach(x => {
    x.pattern = x.pattern.replace('src', 'test');
  });
  return config;
};
