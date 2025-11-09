/**
 * Rollup 建置配置
 * 
 * 產生三種格式：
 * 1. UMD (Universal Module Definition) - 可在瀏覽器、Node.js、AMD 環境使用
 * 2. ESM (ES Module) - 供現代打包工具使用
 * 3. UMD Minified - 壓縮版，適合生產環境
 */

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import babel from '@rollup/plugin-babel';
import { readFileSync } from 'fs';
import copy from 'rollup-plugin-copy';

// 讀取 package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Banner 註解
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * 
 * Includes RecordRTC v5.6.2 (https://github.com/muaz-khan/RecordRTC)
 * RecordRTC License: MIT
 * 
 * @license ${pkg.license}
 * @author ${pkg.author}
 * @repository ${pkg.repository.url}
 */
`;

// 共用的插件配置
const plugins = [
  // 解析 node_modules 模組
  resolve({
    browser: true,
    preferBuiltins: false
  }),
  
  // 轉換 CommonJS 模組為 ES6
  commonjs(),
  
  // Babel 轉譯（支援舊版瀏覽器）
  babel({
    babelHelpers: 'bundled',
    exclude: 'node_modules/**',
    presets: [
      ['@babel/preset-env', {
        targets: {
          browsers: [
            'last 2 versions',
            'not dead',
            'not ie <= 11'
          ]
        },
        modules: false
      }]
    ]
  }),
  
  // 複製 RecordRTC 到 dist/vendor
  copy({
    targets: [
      { src: 'public/assets/js/RecordRTC.js', dest: 'dist/vendor' }
    ],
    hook: 'writeBundle'
  })
];

// 外部依賴（不打包進去）
const external = [];

export default [
  // 1. UMD 建置（未壓縮）
  {
    input: 'src/index.js',
    output: {
      file: pkg.main,
      format: 'umd',
      name: 'VoiceBankRecorder',
      banner,
      sourcemap: true,
      globals: {}
    },
    external,
    plugins
  },
  
  // 2. ESM 建置
  {
    input: 'src/index.js',
    output: {
      file: pkg.module,
      format: 'es',
      banner,
      sourcemap: true
    },
    external,
    plugins
  },
  
  // 3. UMD 建置（壓縮版）
  {
    input: 'src/index.js',
    output: {
      file: 'dist/voicebank-recorder.min.js',
      format: 'umd',
      name: 'VoiceBankRecorder',
      banner,
      sourcemap: true,
      globals: {}
    },
    external,
    plugins: [
      ...plugins.filter(p => p.name !== 'copy'), // 移除 copy plugin 避免重複
      terser({
        format: {
          comments: /^!/
        }
      })
    ]
  }
];
