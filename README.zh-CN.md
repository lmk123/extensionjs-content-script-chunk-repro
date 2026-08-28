# Extension.js：content script 里的动态 `import()` 在生产构建中失败

> **Extension.js 4.1.9 已修复。** 升级后复现步骤全部通过，见[修复状态](#修复状态)。
> 下文描述的是 4.1.5 上的行为。

在 content script 中用 `import()` 加载模块，在 `extension dev` 下正常工作，但在
`extension build` 下失败了。

已提交到上游：[extension-js/extension.js#507](https://github.com/extension-js/extension.js/issues/507)。

## 修复状态

| Extension.js | `pnpm dev` | `pnpm build` |
| ------------ | ---------- | ------------ |
| 4.1.5        | ✓          | ✗ `ChunkLoadError` |
| 4.1.9        | ✓          | ✓            |

4.1.9 的产物里有两处改动，在 `dist/chrome` 中可以直接看到：

1. `content-0.js` 把 `__webpack_require__.l` 覆盖成原生 `import()`，只在失败时才回退到
   旧的 `<script>` 注入——和下面那个变通方案是同一个策略，现在内置了。
2. `manifest.json` 自动补上了 `web_accessible_resources: ["*.js", "content_scripts/*.js"]`，
   isolated world 才能真正 fetch 到 chunk；`publicPath` 也改为运行时用
   `chrome.runtime.getURL('/')` 解析。

Firefox 的生产构建带有完全相同的两处改动。

生产构建下还剩一条无关的控制台报错：content script 的 runtime 会无条件去 fetch 同名的 `.css`
文件，而本项目没有这个文件、也没把 `*.css` 列进 `web_accessible_resources`，于是 Chrome 打印
`Denying load of chrome-extension://<id>/content_scripts/content-0.css`。不影响功能。

## 复现环境

- Extension.js 4.1.5（有 bug）、4.1.9（已修复）
- macOS 26.5.2
- Chrome 152.0.7977.65
- Firefox Nightly 156.0a1

## 复现步骤（4.1.5 上）

1. `pnpm install && pnpm build`（产出 `dist/chrome`）。
2. 打开 `chrome://extensions`，开启开发者模式，把 `dist/chrome` 作为已解压的扩展加载。
3. 打开任意页面，看控制台与页面：

   |      | 预期                                | 实际（生产构建）                           |
   | ---- | ----------------------------------- | ------------------------------------------ |
   | 控制台 | `[repro] chunk loaded and executed` | `ChunkLoadError: Loading chunk 11 failed.` |
   | 页面   | 绿色的 `chunk loaded ✓` 横幅          | 什么都没有                                 |

4. 对照 dev 模式：`pnpm dev` 后打开任意页面——**同样的动态 import 完全正常**，控制台打印
   `[repro] chunk loaded and executed`，绿色横幅也在。
5. Firefox 同理：`pnpm build:firefox` 后在 Firefox Nightly 里加载 `dist/firefox`，报错与
   Chrome 一模一样；`pnpm dev:firefox` 则同样正常。

注意 Chrome 137+ 已经忽略命令行的 `--load-extension`。要把构建产物加载进一个可脚本控制的
Chrome，需要加上 `--enable-unsafe-extension-debugging`，再调用 CDP 的
`Extensions.loadUnpacked` 命令。

## 变通方案（4.1.9 上已不再需要）

见 [PR #1](https://github.com/lmk123/extensionjs-content-script-chunk-repro/pull/1)。它把
`__webpack_require__.l` 换成原生动态 import，让 chunk 作为 ES module 在 isolated world 内被
求值——和 `extension dev` 已经在用的策略相同。

bug 和修复都在两个引擎的生产构建上验证过：

| 构建                                  | Chrome             | Firefox Nightly    |
| ------------------------------------ | ------------------ | ------------------ |
| `main`（4.1.5）                       | ✗ `ChunkLoadError` | ✗ `ChunkLoadError` |
| `workaround/native-esm-chunk-loader` | ✓                  | ✓                  |
| `main`（4.1.9）                       | ✓                  | ✓                  |

## 为什么不用文档里的懒加载方案

文档里的懒加载方案——
[Lazy import in content scripts](https://extension.js.org/docs/implementation-guide/lazy-loading#pattern-3-lazy-import-in-content-scripts)
——有两个问题：

1. **代码执行环境不一致。** 这样加载进来的脚本是以 `<script>` 注入宿主页面的，运行在
   **main world**，而 content script 在 **isolated world**，两边互相拿不到对方的东西。
2. **chunk 不共享。** 每个 `scripts/` 入口都是独立打包的，共享依赖会被各打一份，例如运行时出现
   两个 React 实例。
