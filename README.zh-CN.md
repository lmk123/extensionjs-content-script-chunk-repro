# Extension.js：内容脚本会请求一个根本不存在的同名 `.css`

我的项目里一个样式文件都没有，构建产物里也没有任何 `.css`，但只要扩展在页面上跑起来，
控制台就会报一条对 `content_scripts/content-0.css` 的加载失败。

## 环境

- Extension.js 4.1.9
- macOS 26.5.2
- Chrome 152.0.7977.65

## 复现步骤

1. `pnpm install && pnpm build`
2. 打开 `chrome://extensions`，开启开发者模式，加载 `dist/chrome`。
3. 打开任意页面，看控制台：

   ```
   [repro] content script ready — this project has no CSS at all
   Denying load of chrome-extension://<id>/content_scripts/content-0.css
   ```

   第一行是本仓库内容脚本自己打的，第二行不是我写的代码发出的。

另外，我试着加一个 `.css` 文件并在内容脚本里 import 它，报错依旧。
