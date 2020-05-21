const task = require('haste-task-webpack');

const developmentTask = task({
  configPath: require.resolve('yoshi-flow-legacy/config/webpack.config.client.js'),
  configParams: { isDebug: true }
});

const productionTask = task({
  configPath: require.resolve('yoshi-flow-legacy/config/webpack.config.client.js'),
  configParams: { isDebug: false }
});

Promise.all([developmentTask, productionTask]);
