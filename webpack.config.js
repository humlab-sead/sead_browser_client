const seadConfig = require('./src/config/config.json');
const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
require("ejs-compiled-loader");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CopyWebpackPlugin = require('copy-webpack-plugin');

const cesiumSource = path.resolve(__dirname, 'node_modules/cesium/Source');
const cesiumWorkers = path.join(cesiumSource, '../Build/Cesium/Workers');

const isProduction = process.env.NODE_ENV === 'production';
const shouldAnalyze = process.env.ANALYZE === 'true'; // Custom flag for analysis

module.exports = (env, config) => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    entry: {
      main: path.resolve(__dirname, './src/js/main.js'),
    },
    output: {
      path: path.resolve(__dirname, './dist'),
      filename: '[name].sead.bundle.js',
      publicPath: '/',
      sourcePrefix: '', // Required for Cesium
      assetModuleFilename: '[name][ext][query]'
    },
    amd: {
      // Enable Cesium to work with Webpack's AMD
      toUrlUndefined: true
    },
    resolve: {
      fallback: {
        "vm": require.resolve("vm-browserify"),
        "crypto": require.resolve("crypto-browserify"),
        "path": require.resolve("path-browserify"),
        "stream": require.resolve("stream-browserify"),
        "buffer": require.resolve("buffer/")
      }
    },
    plugins: [
      new CleanWebpackPlugin(), // Ensures old files are deleted before build
      new webpack.DefinePlugin({
        'process.env.DEBUG': JSON.stringify(false),
        CESIUM_BASE_URL: JSON.stringify('/'),
      }),
      new HtmlWebpackPlugin({
        template: path.resolve(__dirname, './src/index.ejs'),
        filename: 'index.html',
        templateParameters: {
          baseUrl: JSON.stringify(seadConfig.serverRoot),
        }
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: cesiumWorkers, to: 'Workers', globOptions: { nodir: true } },
          { from: path.join(cesiumSource, 'Assets'), to: 'Assets', globOptions: { nodir: true } },
          { from: path.join(cesiumSource, 'Widgets'), to: 'Widgets', globOptions: { nodir: true } },
          { from: path.join(cesiumSource, 'ThirdParty'), to: 'ThirdParty', globOptions: { nodir: true } },
        ],
      }),
      new webpack.ProvidePlugin({
        $: 'jquery',
        jQuery: 'jquery',
        Buffer: ['buffer', 'Buffer'], // Ensure Buffer is available
        process: 'process/browser', // Ensure process is available
      }),
      shouldAnalyze && new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: false,
        generateStatsFile: true,
        statsFilename: 'stats.json',
      }),
    ].filter(Boolean), // Removes `false` values to avoid issues
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
          }]
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
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "babel-loader",
              options: {
                presets: ["@babel/preset-env"]
              }
            },
            "source-map-loader"
          ]
        },
        {
          test: /\.(?:ico|gif|png|jpg|jpeg|svg|webp|xml)$/i,
          type: 'asset/resource',
        },
        {
          test: /\.(woff(2)?|eot|ttf|otf)$/,
          type: 'asset/inline',
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.scss$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                importLoaders: 1,
                modules: { mode: "icss" },
              },
            },
            "sass-loader"
          ],
        },
      ],
    },
    devServer: {
      host: '0.0.0.0',
      port: 8080,
      hot: true,
      liveReload: true,
      historyApiFallback: {
        index: '/index.html'
      },
      client: {
        overlay: false
      }
    }
  };
};
