const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'src', 'index.ts'),

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'repluggable.js',
    library: 'repluggable',
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

  externals: {
    // 'react': 'React',
    // 'react-dom': 'ReactDOM',
    // 'lodash': '_',
    // 'react-redux': 'ReactRedux',
    // 'redux': 'Redux'
  },

  optimization: {
     minimize: false
  }
};
