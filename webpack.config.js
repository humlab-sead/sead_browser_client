const webpack = require('webpack');
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')


module.exports = (env, config) => {

  return {
    entry: {
      main: path.resolve(__dirname, './src/js/main.js'),
    },
    output: {
      path: path.resolve(__dirname, './dist'),
      filename: '[name].sead.bundle.js',
      publicPath: '/',
      assetModuleFilename: '[name][ext][query]'
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, './src/index.html'), // template file
        filename: 'index.html', // output file
      }),
      new CleanWebpackPlugin(),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
      }),
    ],
    module: {
      rules: [
        {
          test: /\.html$/,
          use: ['html-loader']
        },
        {
          test: /\.webmanifest$/,
          use: [{
            loader: 'file-loader',
            options: {
              name: 'site.webmanifest',
              outputPath: '/'
            }
          }],
        },
        // JavaScript
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: ['babel-loader', 'source-map-loader'],
        },
        // Images
        {
          test: /\.(?:ico|gif|png|jpg|jpeg|svg)$/i,
          type: 'asset/resource',
        },
        // Fonts and SVGs
        {
          test: /\.(woff(2)?|eot|ttf|otf|)$/,
          type: 'asset/inline',
        },
        // CSS, PostCSS, and Sass
        {
          test: /\.(css)$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(scss)$/,
          use: [{
            loader: "style-loader",
          },
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
              modules: {
                mode: "icss",
              },
            },
          },
          {
            loader: "sass-loader",
          }],
        },
      ],
    },
    devServer: {
      historyApiFallback:{
          index:'/index.html'
      },
    },
  }
  
}