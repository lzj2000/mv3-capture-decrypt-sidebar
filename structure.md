# 文件结构最佳实践

```
.
├─ assets/
├─ src/
│  ├─ background/         # Service Worker 入口与抓包逻辑
│  ├─ sidepanel/          # React UI（列表、详情、配置）
│  ├─ devtools/           # DevTools 面板入口与引导
│  ├─ shared/             # 消息协议、类型、通用工具
│  └─ content/            # 可选：页面内脚本（默认空）
├─ devtools.html          # DevTools 引导页
├─ devtools-panel.html    # DevTools 面板页
├─ src/manifest.ts        # CRXJS 清单源文件
├─ architecture.md
├─ structure.md
├─ tailwind.config.cjs
├─ postcss.config.cjs
├─ tsconfig.json
├─ vite.config.ts
├─ eslint.config.js
└─ package.json
```

## 约定

- 入口清晰：background 与 devtools/panel 各自独立入口文件。
- 共享边界：shared 仅放无 chrome 依赖的逻辑与类型。
- 构建产物：Vite + CRXJS 输出 `dist/`，清单由 `src/manifest.ts` 生成。
