const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  entry: path.resolve(__dirname, 'src'),

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'react-app-lego.js',
    library: 'react-app-lego',
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
    "lodash": { 
      root: ['editorLego', 'libs', 'lodash'],
      commonjs: 'lodash',
      commonjs2: 'lodash'
    },
    "react": { 
      root: ['editorLego', 'libs', 'react'],
      commonjs: 'react',
      commonjs2: 'react'
    },
    "react-dom": { 
      root: ['editorLego', 'libs', 'react-dom'],
      commonjs: 'react-dom',
      commonjs2: 'react-dom'
    },
    "react-redux": { 
      root: ['editorLego', 'libs', 'react-redux'],
      commonjs: 'react-redux',
      commonjs2: 'react-redux'
    },
    "redux": { 
      root: ['editorLego', 'libs', 'lodash'],
      commonjs: 'redux',
      commonjs2: 'redux'
    }
  }
};
