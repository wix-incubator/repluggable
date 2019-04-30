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

  optimization: {
    minimize: false
  },

  externals: {
    'react': {
      'root': 'React',
      'commonjs': 'react',
      'commonjs2': 'react',
      'amd': 'react'
    },
    'react-dom': {
      'root': 'ReactDOM',
      'commonjs': 'react-dom',
      'commonjs2': 'react-dom',
      'amd': 'react-dom'
    },
    'lodash': {
      'root': '_',
      'commonjs': 'lodash',
      'commonjs2': 'lodash',
      'amd': 'lodash'
    },
    'react-redux': {
      'root': 'ReactRedux',
      'commonjs': 'react-redux',
      'commonjs2': 'react-redux',
      'amd': 'react-redux'
    },
    'redux': {
      'root': 'Redux',
      'commonjs': 'redux',
      'commonjs2': 'redux',
      'amd': 'redux'
    }
  }
};
