# Extension.js：content script 里的动态 `import()` 在生产构建中失败

[English](README.md) | 简体中文

**Extension.js 4.1.5** 的最小复现。

用动态 `import()` 懒加载模块的 content script，在 `extension dev` 下正常工作，在
`extension build` 下**必定失败**——而且构建期没有任何报错或警告。

三个源文件：`src/manifest.json`、`src/content/scripts.ts`（入口，注入时立即动态 import）
和 `src/content/heavy.ts`（被懒加载的模块）。

## 复现步骤

```bash
pnpm install && pnpm build
```

把 `dist/chrome` 作为已解压的扩展加载，打开任意页面即可。

|      | 预期                                | 实际（生产构建）                           |
| ---- | ----------------------------------- | ------------------------------------------ |
| 控制台 | `[repro] chunk loaded and executed` | `ChunkLoadError: Loading chunk 11 failed.` |
| 页面   | 绿色的 `chunk loaded ✓` 横幅          | 什么都没有                                 |

`pnpm dev` 产出的构建里，同样的动态 import 是能正常工作的——这正是这个问题容易被忽略的原因。

`pnpm` 脚本固定用了 Chrome，但这里没有任何 Chrome 特有的东西：
`extension build --browser firefox` 产出的是同一个默认加载器，同样的动态 import 在
`dist/firefox` 里以同样的方式失败。

## 原因

`extension build` 让 content script 保留了 rspack 的默认 chunk 加载器，它会往宿主页面
追加 `<script src="chrome-extension://…">`。这个 script 运行在 **main world**，所以
chunk 里的 `self.rspackChunk_<name>.push(...)` 永远到不了 content script 所在的
**isolated world**。`script.onload` 触发了，webpack 却发现 chunk 从未被安装，于是 reject。

`extension dev` 安装的那个 webextension 感知的加载器来自 `WebExtensionPlugin`（内置的
`webpack-target-webextension` fork）。它唯一的调用点是 `SetupReloadStrategy`，后者唯一的
调用点是 `ReloadPlugin.apply()`——而它在 `mode === 'production'` 时会提前 return。没有别的
地方安装它，所以生产构建永远拿不到它。

这个插件并不是 HMR 专属的：`__webpack_require__.l`、publicPath 以及 service worker 的
`importScripts` 都归它管——而且它本来就是以 `hmrConfig: false` 构造的。

chunk 已经列在 `web_accessible_resources` 里了；那不是问题所在。

## 为什么文档里的懒加载方案不适用

[Lazy loading](https://extension.js.org/docs/implementation-guide/lazy-loading) 文档的
Pattern 3（"lazy import in content scripts"）给的是这个写法：

```ts
async function loadAnalyzer() {
  const src = chrome.runtime.getURL('content_scripts/analyzer.js')
  return import(src)
}
```

它有两点覆盖不到上面这种情况。

**它描述的失败模式是另一回事。** 文档把 `runtime.getURL` 这一步解释为可达性问题——没有
`web_accessible_resources` 的话 "the import fails with a network error because the host
page cannot fetch extension files that are not explicitly exposed"。而这里 chunk *在*
`web_accessible_resources` 里，也*确实*被成功拉取了；它只是在 main world 而不是 isolated
world 里被求值。换成绝对 URL 也改变不了这一点：追加 `<script>` 的加载器两种情况下是同一个。

**它预设了存在一个由某个环节产出的 `content_scripts/analyzer.js`。** 文档没有说这个文件从
哪来，而普通的 webpack 异步 chunk 并不是它——异步 chunk 的名字是生成的，而且它恰恰就是那个
加载失败的产物。文档中在已知路径产出独立脚本的方式是
[`scripts/` 特殊目录](https://extension.js.org/docs/features/special-folders)，所以我们就是
按这个方向评估的。在 4.1.5 上，生产构建的表现是：

- **`scripts/` 入口产出的是 IIFE，没有 ESM 导出。** 一个三行、导出 `probe()` 的
  `scripts/probe.ts`，构建出来的 bundle 以 `(()=>{…})();` 结尾——没有 `export`，函数体还被
  完全 tree-shaking 掉了。于是 `import(runtime.getURL('scripts/probe.js'))` 得到的是一个空的
  module namespace；你能拿到的只有"它跑过一遍"这个副作用。这和该目录的文档定位是一致的——
  "executable scripts that you load dynamically"，遵循 content script 的 `export default`
  初始化模式——但它无法表达"导入一个模块并调用它的导出"，比如
  `mountUI(shadowRoot) → handle`。最后只能退化成靠全局变量在两边传值。
- **每个 `scripts/` 入口都带着 mount runtime。** 文档明确说 Extension.js "wraps every file
  inside `scripts/` with a browser content-script mount runtime"；实际效果是那个三行文件重
  6.95KB，而且这层 wrapper 会调用 `cleanupKnownRoots()` / `cleanupOrphanRoots()`，把页面里的
  `[data-extension-root]` 节点删掉。
- **不同的 `scripts/` 入口之间不共享 chunk。** 把第二层懒加载放进独立入口，意味着每个入口都
  各自打包一份共享依赖——运行时出现两个 React 实例，`React.lazy`、hooks 和 context 全都会坏掉。
- **它只是把问题往里推了一层。** `scripts/` 入口*内部*的异步 chunk 仍然是普通的 webpack
  chunk，仍然会撞上同一个加载器。

所以文档里的这个方案并不是本仓库代码的另一种写法。它解决的是"注入并运行一个独立脚本"，这和
"懒加载我自己模块图的一部分"是两回事——而坏掉的是后者。

## 变通方案

见本仓库中打开的 PR。它把 `__webpack_require__.l` 换成原生动态 import，让 chunk 作为 ES
module 在 isolated world 内被求值——和 `extension dev` 已经在用的策略相同。

bug 和修复都在两个引擎的生产构建上验证过：

| 构建                                  | Chrome             | Firefox Nightly 156.0a1 |
| ------------------------------------ | ------------------ | ----------------------- |
| `main`                               | ✗ `ChunkLoadError` | ✗ `ChunkLoadError`      |
| `workaround/native-esm-chunk-loader` | ✓                  | ✓                       |

Firefox 的报错是同一个，连措辞都一样：

```
ChunkLoadError: Loading chunk 11 failed.
(missing: moz-extension://<uuid>/11.js)
```

原生动态 `import()` 在这里是可以放心依赖的。Firefox 从
[Firefox 89](https://bugzilla.mozilla.org/show_bug.cgi?id=1536094) 起就在 content script 中
支持它，而且它正是 Extension.js 所内置的那个插件 `webpack-target-webextension` 文档中标注的
*默认* content script chunk 加载器。在 MV3 下 Firefox 额外要求 chunk 列在
`web_accessible_resources` 里（[bug 1803950](https://bugzilla.mozilla.org/show_bug.cgi?id=1803950)），
本项目的 manifest 已经列了，而且默认加载器同样需要它。宿主页面的 CSP 与此无关——变通方案在
以 `default-src 'none'; script-src 'self'` 提供的页面上同样成功。
