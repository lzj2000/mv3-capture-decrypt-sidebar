# 架构说明（MV3 抓包 + 解密侧边栏）

## 目标与范围
- 目标：基于 Chrome MV3 捕获当前标签页网络请求/响应，尽可能获取 headers/body，并实时推送到 DevTools 面板 展示；支持编解码/加解密与可组合“解密流水线”。
- 范围：调试与分析用途；不做持久抓包服务，不做远程上报。

## 关键能力
- 通过 `chrome.debugger` 监听 `Network.*` 事件，捕获请求/响应头与正文。
- 实时推送：后台将捕获数据流式发送到 DevTools 面板（React UI）。
- 解密流水线：按 URL 规则匹配后执行多步编解码/解密，并展示原文与明文。

## 模块划分
- `background`（Service Worker）
  - 负责 attach/detach、监听网络事件、取 body、限流与缓存、消息广播。
- `sidepanel`（React UI）
  - 列表/详情展示、规则配置、参数输入（key/iv）、流水线预览与执行。
- `shared`
  - 消息协议与类型、解密流水线定义、工具函数（无 chrome 依赖）。
- `content`
  - 预留，默认不参与抓包与解密主流程。

## 数据流与时序
1) 用户打开 DevTools 面板 并选中目标标签页。
2) DevTools 面板 请求后台 attach；后台对 tabId attach `chrome.debugger`。
3) 后台监听 `Network.requestWillBeSent`、`Network.responseReceived`、`Network.loadingFinished`。
4) 在合适时机拉取 request/response body（CDP API），组装为标准化记录。
5) 根据 URL 规则匹配流水线配置，后台执行解密并生成结果。
6) 后台将记录与解密结果推送到 DevTools 面板，UI 渲染列表与详情。

## 目录结构（建议）
- `src/background/`：调试监听、事件聚合、记录缓存、消息广播。
- `src/sidepanel/`：React 视图、状态管理、配置表单、详情面板。
- `src/shared/`：消息协议、类型、规则与流水线定义、解密工具。
- `assets/`：图标等静态资源。

## 消息协议（原则）
- UI ↔ BG 的消息类型集中定义于 `src/shared/messages.ts`。
- 消息必须显式区分请求/响应方向，带 `tabId` 与 `requestId`。
- 后台采用广播或订阅式推送，避免 UI 轮询。

## 抓包与解密策略
- 抓包：
  - 以 `requestId` 聚合请求与响应。
  - 通过 CDP `Network.getResponseBody` 等 API 拉取正文。
  - 对大体积正文应用阈值策略（不解析/不解密）。
- 解密流水线：
  - 由多步“算子”组成（如 base64 decode、AES decrypt、JSON parse）。
  - 支持参数化（key/iv/encoding），支持顺序执行与失败返回。
  - 与 URL 规则匹配绑定，命中即执行。

## 配置与存储
- 配置（规则、流水线、默认参数）存于 `chrome.storage`。
- UI 负责配置编辑与下发；后台负责读取与执行。

## 性能与安全
- 仅对当前 tab attach，避免全局监听。
- 限制缓存长度（环形缓存），避免 SW 内存膨胀。
- 不记录敏感内容到日志；不做明文持久化。
- 失败快速返回，确保 UI 流畅。
