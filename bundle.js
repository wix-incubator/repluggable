process.env.NODE_ENV = 'production';
const webpack = require('webpack');
const {
  createBaseWebpackConfig,
} = require('yoshi-common/build/webpack.config');

function createClientWebpackConfig({
  isDebug = true,
} = {}) {
  const webpackConfig = createBaseWebpackConfig({
    target: 'web',
    isDev: isDebug,
    isHot: false,
    isAnalyze: false,
    includeStyleLoaders: false,
    forceEmitSourceMaps: undefined,
    useYoshiServer: false,
    useProgressBar: false,
    name: '@wix/repluggable',
    useTypeScript: true,
    useAngular: false,
    devServerUrl: 'http://localhost:3201/',
    separateCss: true,
    keepFunctionNames: false,
    separateStylableCss: false,
    experimentalRtlCss: false,
    cssModules: true,
    externalizeRelativeLodash: false,
    performanceBudget: false,
    enhancedTpaStyle: false,
    tpaStyle: false,
  });

  webpackConfig.entry = { repluggable: 'index' };
  webpackConfig.resolve.alias = {};
  webpackConfig.externals = {
    react: 'React',
    'react-dom': 'ReactDOM',
    lodash: '_',
    'react-redux': 'ReactRedux',
    redux: 'Redux'
  };

  webpackConfig.output = {
    ...webpackConfig.output,
    umdNamedDefine: true,
    library: 'repluggable',
    libraryTarget: 'umd',
    globalObject: "(typeof self !== 'undefined' ? self : this)",
  };

  return webpackConfig;
}

const configDev = createClientWebpackConfig({ isDebug: true });
const configProd = createClientWebpackConfig({ isDebug: false });
webpack(configDev).run();
webpack(configProd).run();
