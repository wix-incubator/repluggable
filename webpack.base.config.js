const path = require('path');

const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');

const SRC_DIR = 'src';
const BUILD_DIR = 'dist';
const STATICS_DIR = path.join(BUILD_DIR, 'statics');

module.exports = (debug, local) => ({
  context: path.join(process.cwd(), SRC_DIR),
  name: 'client',
  mode: local ? 'development' : 'production',
  output: {
    path: path.join(process.cwd(), STATICS_DIR),
    publicPath: 'http://localhost:3201/',
    pathinfo: debug,
    filename: `[name].bundle${debug ? '' : '.min'}.js`,
    hotUpdateMainFilename: 'updates/[hash].hot-update.json',
    umdNamedDefine: true,
    library: 'repluggable',
    libraryTarget: 'umd',
    globalObject: "(typeof self !== 'undefined' ? self : this)",
  },
  resolve: {
    modules: ['node_modules', path.join(process.cwd(), SRC_DIR)],
    extensions: ['.js', '.ts', '.tsx', '.json'],
    mainFields: ['browser', 'module', 'main'],
    alias: {},
  },
  resolveLoader: {
    modules: ['node_modules'],
  },
  optimization: {
    minimize: !debug,
    concatenateModules: !local,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        cache: true,
        sourceMap: true,
        terserOptions: {
          output: {
            ascii_only: true,
          },
          keep_fnames: false,
        },
      }),
    ],
  },
  plugins: [
    new CaseSensitivePathsPlugin(),
    new webpack.LoaderOptionsPlugin({
      minimize: !debug,
    }),
    ...(local ? [new webpack.HotModuleReplacementPlugin()] : []),
  ],
  devtool: local ? 'cheap-module-eval-source-map' : false,
  module: {
    strictExportPresence: true,
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              happyPackMode: true,
              compilerOptions: { module: 'esnext', moduleResolution: 'node' },
            },
          },
        ],
      },
    ],
  },
  stats: 'none',
  node: { fs: 'empty', net: 'empty', tls: 'empty', __dirname: true },
  performance: { hints: false },
  target: 'web',
  entry: { repluggable: 'index' },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    lodash: '_',
    'react-redux': 'ReactRedux',
    redux: 'Redux',
  },
  devServer: {
    contentBase: path.join(process.cwd(), STATICS_DIR),
    compress: true,
    port: 3201,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers':
        'X-Requested-With, content-type, Authorization',
    },
  },
});
