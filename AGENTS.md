# Engineering Rules（工程规范）

## 1) 语言与基础约束

* **TypeScript only**（除 manifest.json / 静态资源外）
* `tsconfig.json` 必须开启：

  * `"strict": true`
  * `"noImplicitAny": true`
  * `"noUncheckedIndexedAccess": true`
* 禁止 `any`（允许 `unknown`，但必须在同文件完成类型收敛）
* 禁止 `// @ts-ignore`（如必须用，改成 `// @ts-expect-error` 并写原因）
* 注释规则：仅在逻辑不直观处添加简短注释，避免重复代码含义的注释

---

## 2) 目录与依赖规则

### 2.1 分层依赖（强制）

* `src/shared/**`：只允许依赖 TS 标准库，禁止依赖 chrome API、React
* `src/background/**`：允许依赖 `shared`，允许依赖 `chrome.*`
* `src/panel/**`：允许依赖 `shared`，允许依赖 React；禁止依赖 `chrome.debugger.*`（只能发消息）

依赖方向必须是：
`shared → (background, panel)`
禁止：`background → panel`、`panel → background`

### 2.2 模块入口清晰

* background 只暴露：

  * attach/detach 控制器
  * 事件聚合与广播
  * config 读写
* panel 只负责：

  * 展示
  * 配置编辑 + 下发

---

## 3) 命名规范

* 文件名：`kebab-case` 或 `snake_case` 二选一（建议 `snake_case`，和 MV3 产物路径更稳）
* TS 类型：

  * `type FooBar = ...`
  * `interface FooBar { ... }`（仅用于对象结构、且需要扩展时用）
* 常量：`UPPER_SNAKE_CASE`
* React 组件：`PascalCase`

---

## 3.1 注释规则最佳实践

* 目的导向：注释解释“为什么/约束/边界”，避免重复“做什么”
* 位置：优先用块注释描述复杂段落，避免在每行碎片化注释
* 可维护：当代码变动容易导致注释过期时，优先改代码结构而非追加注释
* 风格：用简短陈述句；避免情绪化或闲聊式注释
* 要求：每个函数和变量都需要注释
* 例外：对业务关键假设、协议格式、性能/安全权衡必须注释清楚
* 粒度：函数注释说明输入/输出与副作用，变量注释说明含义与单位
* 约束：禁止使用“TODO/临时/占位”等含糊注释代替设计
* 同步：修改逻辑时必须同步更新相关注释
* 语言：注释可以使用中文，优先清晰易懂

---

## 4) 消息协议与类型规范

* UI ↔ BG 消息 **必须**集中定义在 `src/shared/messages.ts`
* 不允许“临时字段”绕过类型系统
* 消息处理必须：

  * 显式 switch / if 分支覆盖所有 type
  * default 分支返回错误并记录（debug 模式）

---

## 5) 错误处理规范

* 所有可失败操作必须返回结构化错误：

  * `code: string`
  * `message: string`
  * 可选 `cause?: unknown`
* 禁止无意义 catch：

  * ❌ `catch {}`
  * ✅ `catch (e) { return { ok:false, error:{...} } }`
* 用户态错误信息必须可读；调试信息不能包含敏感内容（key/iv/body 明文）

---

## 6) 日志与调试规范

* 默认不输出 console 日志
* 必须提供统一日志开关（例如 `DEBUG = false`）
* 日志不得打印：

  * request/response body 全文
  * key/iv/token/cookie
* 建议日志分级：`debug/info/warn/error`

---

## 7) 格式化与静态检查（建议强制）

### 7.1 统一工具链

* ESLint（必须）
* EditorConfig（必须）
* 包管理器必须使用 `pnpm`

### 7.2 阻断规则（CI/本地都应阻断）

* lint error 阻断 build
* TypeScript build error 阻断提交
* 格式化不通过阻断提交（建议用 pre-commit）

---

## 8) Git / Commit 规范

* Commit message 采用：

  * `feat: ...`
  * `fix: ...`
  * `refactor: ...`
  * `chore: ...`
  * `docs: ...`
* 每个 PR 必须满足：

  * 不引入未使用依赖
  * 不新增权限（新增必须说明理由）
  * 不降低 TS 严格程度

---

## 9) React UI 工程规范

* React 组件必须是纯函数组件
* UI 状态管理：

  * 组件状态只存“展示态/编辑态”
  * 网络记录数据以“只增不改”为主（方便性能优化）
* 性能要求：

  * 长列表必须可虚拟滚动（记录多时）
  * 大文本使用 lazy render（只渲染选中项）

---

## 10) Background（Service Worker）工程规范

* 禁止在 SW 中保存无限增长状态

  * 必须使用环形缓存（max N 条）
* 事件处理必须避免阻塞：

  * 解密流水线要能失败快速返回
  * 对大 body 有阈值策略（不解析/不解密）
* attach/detach 必须是幂等操作：

  * 重复 attach 不应导致崩溃
  * detach 失败要容错

---

## 11) Crypto Pipeline 工程规范（纯逻辑）

* 每个算子必须有：

  * 参数校验（长度、编码、空值）
  * 输入输出类型声明（text/bytes）
  * 失败行为策略（返回 error，不抛出未处理异常）
* pipeline 执行必须：

  * 可序列化配置（用于 storage）
  * 可扩展（新增算子不破坏旧配置）

---

## 12) 最低测试规范（工程侧）

* pipeline 必须有单测（最少覆盖）：

  * base64 decode 错误输入
  * AES key/iv 长度不合法
  * AES 解密失败时错误输出结构正确
* URL 规则匹配必须有单测：

  * includes + regex + 优先级顺序
