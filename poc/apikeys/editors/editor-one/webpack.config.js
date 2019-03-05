const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const externalsConfigObject = require('./webpack.config.externals');

module.exports = {
  entry: path.resolve(__dirname, 'src'),

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'editor-one.js',
    library: 'editor-one',
    libraryTarget: 'umd',
    umdNamedDefine: true
  },

  devtool: 'source-map',

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json']
  },

  module: {
    rules: [{ test: /\.(ts|js)x?$/, loader: 'babel-loader', exclude: /node_modules/ }],
  },

  plugins: [
    new ForkTsCheckerWebpackPlugin(),
  ],

  externals: externalsConfigObject,

  optimization: {
    minimize: false
  }
};
