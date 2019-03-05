const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const externalsConfigObject = require('./webpack.config.externals');

module.exports = {
  entry: {
    public: path.resolve(__dirname, 'src', 'public.ts'),
    private: path.resolve(__dirname, 'src', 'private.ts')
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    library: 'feature-two',
    libraryTarget: 'umd',
    umdNamedDefine: true,
    filename: 'feature-two-[name].js'
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
