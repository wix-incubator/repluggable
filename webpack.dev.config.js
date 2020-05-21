const path = require('path');
const webpack = require('webpack');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

const join = (...dirs) => path.join(process.cwd(), ...dirs);

const terserOptions = {
  parallel: true,
  cache: true,
  sourceMap: true,
  terserOptions: {
    output: {
      ascii_only: true,
    },
    keep_fnames: false,
  },
};

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const STATICS_DIR = 'statics';

module.exports = {
  context: join(SRC_DIR),
  name: undefined,
  mode: 'production',
  output: {
    path: join(DIST_DIR, STATICS_DIR),
    publicPath: 'http://localhost:3201/',
    pathinfo: true,
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js',
    hotUpdateMainFilename: 'updates/[hash].hot-update.json',
    hotUpdateChunkFilename: 'updates/[id].[hash].hot-update.js',
    jsonpFunction: 'webpackJsonp__wix_repluggable',
    chunkCallbackName: 'webpackWorker__wix_repluggable',
    umdNamedDefine: true,
    library: 'repluggable',
    libraryTarget: 'umd',
    globalObject: "(typeof self !== 'undefined' ? self : this)",
  },
  resolve: {
    modules: ['node_modules', join(SRC_DIR)],
    extensions: ['.mjs', '.js', '.jsx', '.ts', '.tsx', '.svelte', '.json'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
    alias: {},
  },
  resolveLoader: {
    modules: [join('node_modules'), 'node_modules'],
  },
  optimization: {
    minimize: false,
    concatenateModules: true,
    minimizer: [new TerserPlugin(terserOptions)],
    splitChunks: false,
  },
  plugins: [
    new CaseSensitivePathsPlugin(),
    new webpack.LoaderOptionsPlugin({
      minimize: false,
    }),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
  ],
  devtool: false,
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
              compilerOptions: Object.assign({
                module: 'esnext',
                moduleResolution: 'node',
              }),
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
};
