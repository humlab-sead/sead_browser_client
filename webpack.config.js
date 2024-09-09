const seadConfig = require('./src/config/config.json');
const webpack = require('webpack');
const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
require("ejs-compiled-loader");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;


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
      new webpack.DefinePlugin({
        'process.env': {
          DEBUG: false,
        },
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, './src/index.ejs'), // template file
        filename: 'index.html', // output file
        templateParameters: {
          //'baseUrl': 'https://example.com',
          'baseUrl': seadConfig.serverRoot,
        }
      }),
      new CleanWebpackPlugin(),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
      }),
      /*
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
      }),
      */
    ],
    module: {
      rules: [
        {
          test: /\.worker\.js$/,
          use: { loader: 'worker-loader' }
        },
        {
          test: /\.ejs$/, 
          use: [{
            loader: 'ejs-compiled-loader',
            options: {
              htmlmin: true,
              htmlminOptions: {
                removeComments: true
              }
            }
          }
        ]
        },
        {
          test: /\.(?:html)$/i,
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
          use: ['source-map-loader'],
        },
        // Generic resources
        {
          test: /\.(?:ico|gif|png|jpg|jpeg|svg|webp|xml)$/i,
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
    }
  }
}