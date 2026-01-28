import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AppError,
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
  RequestBody,
  ResponseBody,
  ResponseRecord,
} from '../shared/messages'

/** 面板标题 */
const PANEL_TITLE = 'Capture + Decrypt'

/** 连接端口名称 */
const PANEL_PORT_NAME = 'panel'

/** 左侧面板最小宽度百分比 */
const MIN_LEFT_PERCENT = 28

/** 左侧面板最大宽度百分比 */
const MAX_LEFT_PERCENT = 72

/** 默认左侧面板宽度百分比 */
const DEFAULT_LEFT_PERCENT = 56

/** 拖拽分隔条宽度 */
const SPLITTER_WIDTH = 6

/** 预览展示的最大行数 */
const PREVIEW_MAX_LINES = 60

/** 预览展示的最大字符数 */
const PREVIEW_MAX_CHARS = 4000

/** 高亮颜色 class */
const HIGHLIGHT_CLASS_NAME = 'bg-yellow-200 text-slate-900'

/** UTF-8 编码器 */
const TEXT_ENCODER = new TextEncoder()

/** 查询参数条目 */
interface KeyValueRow {
  /** 键 */
  key: string
  /** 值 */
  value: string
}

/** 内容类型 */
type ContentKind = 'empty' | 'json' | 'form' | 'text'

/** 格式化字节数 */
function formatBytes(value: number): string {
  // 处理非法输入
  if (!Number.isFinite(value))
    return '-'
  // 小于 1024 直接展示
  if (value < 1024)
    return `${Math.round(value)} B`
  // 计算 KB
  const kb = value / 1024
  if (kb < 1024)
    return `${kb.toFixed(1)} KB`
  // 计算 MB
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

/** 格式化时间戳 */
function formatTime(timeStamp: number): string {
  // 处理非法输入
  if (!Number.isFinite(timeStamp))
    return '-'
  // 转换时间
  const date = new Date(timeStamp)
  return `${date.toLocaleTimeString()} ${date.toLocaleDateString()}`
}

/** 提取请求路径 */
function formatRequestPath(url: string): string {
  // 解析 URL
  try {
    // 解析 URL 对象
    const parsed = new URL(url)
    // 拼接路径与查询参数
    const path = parsed.pathname || '/'
    return parsed.search ? `${path}${parsed.search}` : path
  }
  catch {
    // URL 解析失败时降级为原始字符串
    return url
  }
}

/** 提取请求域名 */
function formatRequestHost(url: string): string {
  // 解析 URL
  try {
    // 解析 URL 对象
    const parsed = new URL(url)
    return parsed.host
  }
  catch {
    return ''
  }
}

/** 将字符串安全解码为 URL 组件 */
function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

/** 解析 query 参数 */
function getQueryRows(url: string): KeyValueRow[] {
  try {
    // URL 对象
    const parsed = new URL(url)
    // 结果列表
    const rows: KeyValueRow[] = []
    parsed.searchParams.forEach((value, key) => {
      rows.push({
        key: decodeUrlComponent(key),
        value: decodeUrlComponent(value),
      })
    })
    return rows
  }
  catch {
    return []
  }
}

/** 推断内容类型 */
function detectContentKind(text: string, mimeType: string): ContentKind {
  // 去除空白后的文本
  const trimmed = text.trim()
  if (!trimmed)
    return 'empty'
  if (mimeType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('['))
    return 'json'
  if (mimeType.includes('x-www-form-urlencoded') || (trimmed.includes('=') && trimmed.includes('&')))
    return 'form'
  return 'text'
}

/** 尝试格式化 JSON */
function tryFormatJson(text: string): string | null {
  try {
    // 解析后的对象
    const parsed = JSON.parse(text) as unknown
    return JSON.stringify(parsed, null, 2)
  }
  catch {
    return null
  }
}

/** 解析表单文本为键值对 */
function parseFormRows(text: string): KeyValueRow[] {
  // 参数列表
  const params = new URLSearchParams(text)
  // 输出行
  const rows: KeyValueRow[] = []
  params.forEach((value, key) => {
    rows.push({
      key: decodeUrlComponent(key),
      value: decodeUrlComponent(value),
    })
  })
  return rows
}

/** 计算 UTF-8 字节长度 */
function getByteLength(text: string): number {
  return TEXT_ENCODER.encode(text).length
}

/** 将 Base64 解码为文本 */
function decodeBase64ToText(value: string): { ok: true, text: string } | { ok: false, message: string } {
  try {
    // 去除空白字符
    const normalized = value.replace(/\s+/g, '')
    // 二进制字符串
    const binary = atob(normalized)
    // 字节数组
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    // 解码后的文本
    const decoded = new TextDecoder().decode(bytes)
    return { ok: true, text: decoded }
  }
  catch {
    return { ok: false, message: 'Base64 解码失败' }
  }
}

/** 转义正则字符 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 高亮文本命中 */
function highlightText(text: string, keyword: string): ReactNode {
  if (!keyword)
    return text
  // 关键字正则
  const regex = new RegExp(escapeRegExp(keyword), 'gi')
  // 分段内容
  const parts = text.split(regex)
  if (parts.length === 1)
    return text
  // 匹配列表
  const matches = text.match(regex)
  if (!matches)
    return text
  // 片段节点
  const nodes: ReactNode[] = []
  for (let index = 0; index < parts.length; index += 1) {
    // 当前分段
    const part = parts[index]
    if (part)
      nodes.push(part)
    // 当前匹配
    const match = matches[index]
    if (match) {
      nodes.push(
        <mark key={`${match}-${index}`} className={HIGHLIGHT_CLASS_NAME}>
          {match}
        </mark>,
      )
    }
  }
  return nodes
}

/** 渲染 key/value 表格 */
function renderKeyValueTable(rows: KeyValueRow[]): ReactNode {
  if (rows.length === 0)
    return <div className="text-slate-400">无内容</div>
  return (
    <div className="grid gap-2">
      {rows.map(row => (
        <div key={`${row.key}-${row.value}`} className="grid grid-cols-[140px_1fr] gap-2">
          <div className="truncate text-slate-500">{row.key}</div>
          <div className="break-words text-slate-700">{row.value}</div>
        </div>
      ))}
    </div>
  )
}

/** 渲染文本区块（支持预览/搜索高亮） */
function renderTextBlock(text: string, keyword: string, expanded: boolean): { node: ReactNode, hasOverflow: boolean } {
  // 行列表
  const lines = text.split(/\r?\n/)
  // 是否超出行数
  const hasLineOverflow = lines.length > PREVIEW_MAX_LINES
  // 是否超出字符数
  const hasCharOverflow = text.length > PREVIEW_MAX_CHARS
  // 是否超出预览限制
  const hasOverflow = hasLineOverflow || hasCharOverflow
  // 预览文本
  let previewText = text
  if (!expanded && hasOverflow) {
    if (hasLineOverflow) {
      previewText = lines.slice(0, PREVIEW_MAX_LINES).join('\n')
    }
    else {
      previewText = text.slice(0, PREVIEW_MAX_CHARS)
    }
  }
  return {
    node: (
      <div className="grid gap-2">
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px]">
          {highlightText(previewText, keyword)}
        </pre>
      </div>
    ),
    hasOverflow,
  }
}

/** 分区容器 */
function Section(props: {
  /** 标题 */
  title: string
  /** 右侧说明 */
  meta?: string
  /** 展开状态 */
  isOpen: boolean
  /** 切换处理 */
  onToggle: () => void
  /** 子内容 */
  children: ReactNode
}) {
  const {
    title,
    meta,
    isOpen,
    onToggle,
    children,
  } = props
  return (
    <div className="rounded-xl border border-slate-100 bg-white/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="text-[12px] font-semibold text-slate-600">{title}</div>
        <div className="flex items-center gap-2">
          {meta ? <span className="text-[11px] text-slate-400">{meta}</span> : null}
          <span className="text-[11px] text-slate-400">{isOpen ? '收起' : '展开'}</span>
        </div>
      </button>
      {isOpen
        ? (
            <div className="border-t border-slate-100 px-3 py-3 text-[12px] text-slate-700">
              {children}
            </div>
          )
        : null}
    </div>
  )
}

/** 判断对象类型 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 解析字符串字段 */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** 解析数字字段 */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 解析布尔字段 */
function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** 解析错误对象 */
function parseAppError(value: unknown): AppError | null {
  if (!isRecord(value))
    return null
  // 错误码
  const code = asString(value.code)
  // 错误信息
  const message = asString(value.message)
  if (!code || !message)
    return null
  // 原因字段
  const cause = 'cause' in value ? value.cause : undefined
  return { code, message, cause }
}

/** 解析响应正文 */
function parseResponseBody(value: unknown): ResponseBody | null {
  if (!isRecord(value))
    return null
  // 文本字段
  const textValue = value.text
  // 解析文本
  const text = textValue === null ? null : asString(textValue)
  if (textValue !== null && text === null)
    return null
  // base64 标记
  const isBase64 = asBoolean(value.isBase64)
  // 截断标记
  const truncated = asBoolean(value.truncated)
  if (isBase64 === null || truncated === null)
    return null
  // 解析错误
  let error: AppError | undefined
  if (value.error !== undefined) {
    const parsed = parseAppError(value.error)
    if (!parsed)
      return null
    error = parsed
  }
  return {
    text,
    isBase64,
    truncated,
    error,
  }
}

/** 解析请求正文 */
function parseRequestBody(value: unknown): RequestBody | null {
  if (!isRecord(value))
    return null
  // 文本字段
  const textValue = value.text
  // 解析文本
  const text = textValue === null ? null : asString(textValue)
  if (textValue !== null && text === null)
    return null
  // 截断标记
  const truncated = asBoolean(value.truncated)
  if (truncated === null)
    return null
  // 解析错误
  let error: AppError | undefined
  if (value.error !== undefined) {
    const parsed = parseAppError(value.error)
    if (!parsed)
      return null
    error = parsed
  }
  return {
    text,
    truncated,
    error,
  }
}

/** 解析响应记录 */
function parseResponseRecord(value: unknown): ResponseRecord | null {
  if (!isRecord(value))
    return null
  // 基础字段
  const id = asString(value.id)
  const url = asString(value.url)
  const method = asString(value.method)
  const status = asNumber(value.status)
  const mimeType = asString(value.mimeType)
  const resourceType = asString(value.resourceType)
  const timeStamp = asNumber(value.timeStamp)
  const encodedDataLength = asNumber(value.encodedDataLength)
  if (!id || !url || !method || status === null || !mimeType || !resourceType || timeStamp === null || encodedDataLength === null)
    return null
  // 请求正文
  const requestBody = parseRequestBody(value.requestBody)
  // 响应正文
  const body = parseResponseBody(value.body)
  if (!requestBody || !body)
    return null
  return {
    id,
    url,
    method,
    status,
    mimeType,
    resourceType,
    timeStamp,
    encodedDataLength,
    requestBody,
    body,
  }
}

/** 解析后台消息 */
function parseBackgroundMessage(value: unknown): BackgroundToPanelMessage | null {
  if (!isRecord(value))
    return null

  // 读取消息类型
  const message资源类型 = asString(value.type)
  if (!message资源类型)
    return null

  if (message资源类型 === 'status.update') {
    // 解析 attachedTabId
    const attachedTabId = asNumber(value.attachedTabId)
    if (attachedTabId === null && value.attachedTabId !== null)
      return null
    return { type: 'status.update', attachedTabId }
  }

  if (message资源类型 === 'records.snapshot') {
    // 解析 records
    const records = Array.isArray(value.records) ? value.records : null
    if (!records)
      return null
    // 解析 attachedTabId
    const attachedTabId = asNumber(value.attachedTabId)
    if (attachedTabId === null && value.attachedTabId !== null)
      return null
    // 解析记录列表
    const parsedRecords: ResponseRecord[] = []
    for (const record of records) {
      const parsed = parseResponseRecord(record)
      if (!parsed)
        return null
      parsedRecords.push(parsed)
    }
    return {
      type: 'records.snapshot',
      records: parsedRecords,
      attachedTabId,
    }
  }

  if (message资源类型 === 'records.added') {
    // 解析 record
    const parsedRecord = parseResponseRecord(value.record)
    if (!parsedRecord)
      return null
    return { type: 'records.added', record: parsedRecord }
  }

  if (message资源类型 === 'error') {
    // 解析 error
    const parsedError = parseAppError(value.error)
    if (!parsedError)
      return null
    return { type: 'error', error: parsedError }
  }

  return null
}

/** 发送面板消息 */
function sendPanelMessage(port: chrome.runtime.Port | null, message: PanelToBackgroundMessage): void {
  if (!port)
    return
  port.postMessage(message)
}

/** 侧栏主视图 */
export function App() {
  /** 当前 tabId */
  const tabId = chrome.devtools.inspectedWindow.tabId
  /** 端口引用 */
  const portRef = useRef<chrome.runtime.Port | null>(null)
  /** 分割区域容器引用 */
  const splitRef = useRef<HTMLDivElement | null>(null)
  /** 拖拽状态引用 */
  const draggingRef = useRef(false)
  /** 用户选择样式缓存 */
  const userSelectRef = useRef('')
  /** 捕获记录 */
  const [records, setRecords] = useState<ResponseRecord[]>([])
  /** 当前选中记录 ID */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 已附加的 tabId */
  const [attachedTabId, setAttachedTabId] = useState<number | null>(null)
  /** 错误信息 */
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** 左侧面板宽度百分比 */
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT)
  /** 请求正文搜索关键词 */
  const [requestSearch, setRequestSearch] = useState('')
  /** 响应正文搜索关键词 */
  const [responseSearch, setResponseSearch] = useState('')
  /** 请求正文是否展开 */
  const [requestExpanded, setRequestExpanded] = useState(false)
  /** 响应正文是否展开 */
  const [responseExpanded, setResponseExpanded] = useState(false)
  /** 查询参数 区块是否展开 */
  const [queryOpen, setQueryOpen] = useState(true)
  /** 请求正文区块是否展开 */
  const [requestOpen, setRequestOpen] = useState(true)
  /** 响应正文区块是否展开 */
  const [responseOpen, setResponseOpen] = useState(true)
  /** 响应正文 Base64 解码开关 */
  const [decodeResponseBase64, setDecodeResponseBase64] = useState(false)
  /** 顶部信息是否折叠 */
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false)

  /** 拖拽移动事件 */
  const handleResizeMove = useCallback((event: MouseEvent): void => {
    // 忽略非拖拽状态
    if (!draggingRef.current)
      return
    // 获取容器范围
    const container = splitRef.current
    if (!container)
      return
    // 容器尺寸
    const rect = container.getBoundingClientRect()
    // 计算偏移
    const offsetX = event.clientX - rect.left
    // 避免除零
    if (rect.width <= 0)
      return
    // 计算百分比
    const rawPercent = (offsetX / rect.width) * 100
    // 限制范围
    const clamped = Math.min(MAX_LEFT_PERCENT, Math.max(MIN_LEFT_PERCENT, rawPercent))
    // 更新宽度
    setLeftPercent(Math.round(clamped * 10) / 10)
  }, [])

  /** 拖拽结束事件 */
  const handleResizeEnd = useCallback((): void => {
    // 恢复状态
    draggingRef.current = false
    document.body.style.userSelect = userSelectRef.current
    // 解绑全局事件
    window.removeEventListener('mousemove', handleResizeMove)
    window.removeEventListener('mouseup', handleResizeEnd)
  }, [handleResizeMove])

  /** 拖拽开始事件 */
  const handleResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    // 阻止选择文本
    event.preventDefault()
    // 标记拖拽状态
    draggingRef.current = true
    // 记录原始 userSelect
    userSelectRef.current = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    // 绑定全局事件
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
  }, [handleResizeEnd, handleResizeMove])

  // 连接后台并接收消息
  useEffect(() => {
    // 创建连接
    const port = chrome.runtime.connect({ name: PANEL_PORT_NAME })
    portRef.current = port

    port.onMessage.addListener((rawMessage) => {
      // 解析消息
      const message = parseBackgroundMessage(rawMessage)
      if (!message)
        return

      if (message.type === 'status.update') {
        setAttachedTabId(message.attachedTabId)
        return
      }

      if (message.type === 'records.snapshot') {
        setRecords(message.records)
        setAttachedTabId(message.attachedTabId)
        return
      }

      if (message.type === 'records.added') {
        setRecords(prev => [...prev, message.record])
        return
      }

      if (message.type === 'error') {
        setErrorMessage(message.error.message)
      }
    })

    // 默认尝试附加
    sendPanelMessage(port, { type: 'debugger.attach', tabId })

    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [tabId])

  // 当记录变化时尝试选中最新一条
  useEffect(() => {
    // 已有选中则不变
    if (selectedId)
      return
    // 选择最新记录
    const latestRecord = records.at(-1)
    if (latestRecord)
      setSelectedId(latestRecord.id)
  }, [records, selectedId])

  // 选中记录变化时重置局部状态
  useEffect(() => {
    setRequestSearch('')
    setResponseSearch('')
    setRequestExpanded(false)
    setResponseExpanded(false)
    setDecodeResponseBase64(false)

    const current = records.find(record => record.id === selectedId) ?? null
    const hasQuery = current ? getQueryRows(current.url).length > 0 : false
    const hasRequest = current ? (current.requestBody.text !== null || !!current.requestBody.error) : false
    const hasResponse = current ? (current.body.text !== null || !!current.body.error) : false
    setQueryOpen(hasQuery)
    setRequestOpen(hasRequest)
    setResponseOpen(hasResponse)
  }, [records, selectedId])

  // 卸载时清理拖拽监听
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [handleResizeEnd, handleResizeMove])

  /** 排序后的记录 */
  const orderedRecords = useMemo(() => [...records].reverse(), [records])
  /** 当前选中的记录 */
  const selectedRecord = useMemo(
    () => records.find(record => record.id === selectedId) ?? null,
    [records, selectedId],
  )
  /** 是否已附加到当前 tab */
  const isAttached = attachedTabId === tabId
  /** 右侧宽度百分比 */
  const rightPercent = 100 - leftPercent

  /** 点击附加按钮 */
  function handleAttachClick(): void {
    sendPanelMessage(portRef.current, { type: 'debugger.attach', tabId })
  }

  /** 点击解除按钮 */
  function handleDetachClick(): void {
    sendPanelMessage(portRef.current, { type: 'debugger.detach', tabId })
  }

  /** 点击清空按钮 */
  function handleClearClick(): void {
    sendPanelMessage(portRef.current, { type: 'records.clear' })
    setSelectedId(null)
  }

  /** 点击记录行 */
  function handleSelectRecord(recordId: string): void {
    setSelectedId(recordId)
  }

  /** 请求正文展示内容 */

  const requestDisplay = useMemo(() => {
    if (!selectedRecord)
      return null
    if (selectedRecord.requestBody.text === null)
      return null
    // 原始文本
    const rawText = selectedRecord.requestBody.text
    // 内容类型
    const kind = detectContentKind(rawText, selectedRecord.mimeType)
    if (kind === 'json') {
      // 格式化 JSON
      const formatted = tryFormatJson(rawText)
      return {
        kind,
        text: formatted ?? rawText,
      }
    }
    if (kind === 'form') {
      return {
        kind,
        rows: parseFormRows(rawText),
      }
    }
    return {
      kind: 'text' as const,
      text: decodeUrlComponent(rawText),
    }
  }, [selectedRecord])

  /** 响应正文展示内容 */
  const responseDisplay = useMemo(() => {
    if (!selectedRecord)
      return null
    if (selectedRecord.body.text === null)
      return null
    // 原始文本
    let rawText = selectedRecord.body.text
    if (selectedRecord.body.isBase64 && decodeResponseBase64) {
      // Base64 解码结果
      const decoded = decodeBase64ToText(rawText)
      if (!decoded.ok) {
        return {
          kind: 'text' as const,
          text: rawText,
          decodeError: decoded.message,
        }
      }
      rawText = decoded.text
    }
    // 内容类型
    const kind = detectContentKind(rawText, selectedRecord.mimeType)
    if (kind === 'json') {
      // 格式化 JSON
      const formatted = tryFormatJson(rawText)
      return {
        kind,
        text: formatted ?? rawText,
      }
    }
    if (kind === 'form') {
      return {
        kind,
        rows: parseFormRows(rawText),
      }
    }
    return {
      kind: 'text' as const,
      text: decodeUrlComponent(rawText),
    }
  }, [selectedRecord, decodeResponseBase64])

  /** 请求正文文本区块 */
  const requestTextBlock: { node: ReactNode, hasOverflow: boolean } | null = useMemo(() => {
    if (!requestDisplay || requestDisplay.kind === 'form')
      return null
    return renderTextBlock(requestDisplay.text, requestSearch, requestExpanded)
  }, [requestDisplay, requestSearch, requestExpanded])

  /** 响应正文文本区块 */
  const responseTextBlock: { node: ReactNode, hasOverflow: boolean } | null = useMemo(() => {
    if (!responseDisplay || responseDisplay.kind === 'form')
      return null
    return renderTextBlock(responseDisplay.text, responseSearch, responseExpanded)
  }, [responseDisplay, responseSearch, responseExpanded])
  /** 查询参数 行数据 */
  const queryRows = useMemo(() => {
    if (!selectedRecord)
      return []
    return getQueryRows(selectedRecord.url)
  }, [selectedRecord])

  /** 查询参数 meta 信息 */
  const queryMeta = queryRows.length > 0 ? `${queryRows.length} 项` : '空'

  /** 请求正文 meta 信息 */
  const requestMeta = selectedRecord?.requestBody.text
    ? `${formatBytes(getByteLength(selectedRecord.requestBody.text))}${selectedRecord.requestBody.truncated ? ' · 已截断' : ''}`
    : '空'

  /** 响应正文 meta 信息 */
  const responseMeta = selectedRecord?.body.text
    ? `${formatBytes(getByteLength(selectedRecord.body.text))}${selectedRecord.body.truncated ? ' · 已截断' : ''}`
    : '空'

  /** 响应正文解码错误信息 */
  const responseDecodeError = responseDisplay && 'decodeError' in responseDisplay
    ? responseDisplay.decodeError
    : null

  return (
    <div className="flex h-screen flex-col gap-3 p-4 text-ink">
      <header className="rounded-2xl bg-white px-4 py-3 shadow-lg shadow-slate-200/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-wide">{PANEL_TITLE}</div>
            {!isHeaderCollapsed
              ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {isAttached ? '已附加到当前标签页' : '未附加'}
                    {' '}
                    路 仅显示 Fetch / XHR
                  </div>
                )
              : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsHeaderCollapsed(prev => !prev)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
            >
              {isHeaderCollapsed ? '展开' : '收起'}
            </button>
            <button
              type="button"
              onClick={isAttached ? handleDetachClick : handleAttachClick}
              className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
            >
              {isAttached ? 'Detach' : 'Attach'}
            </button>
            <button
              type="button"
              onClick={handleClearClick}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
            >
              清空
            </button>
          </div>
        </div>
        {!isHeaderCollapsed
          ? (
              <div className="mt-3 text-[11px] text-slate-400">
                当前 tabId:
                {' '}
                {tabId}
                {' '}
                | 记录数
                {' '}
                {records.length}
              </div>
            )
          : null}
      </header>

      {errorMessage
        ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {errorMessage}
            </div>
          )
        : null}

      <div ref={splitRef} className="flex min-h-0 flex-1 gap-0">
        <section
          style={{ width: `${leftPercent}%` }}
          className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-200/60"
        >
          <div className="grid grid-cols-[2.2fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-2 border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase text-slate-400">
            <div className="min-w-0 truncate" title="Name">Name</div>
            <div className="min-w-0 truncate" title="Status">Status</div>
            <div className="min-w-0 truncate" title="资源类型">资源类型</div>
            <div className="min-w-0 truncate" title="响应大小">响应大小</div>
            <div className="min-w-0 truncate" title="时间戳">时间戳</div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {orderedRecords.length === 0
              ? (
                  <div className="px-4 py-6 text-center text-xs text-slate-500">
                    暂无 Fetch / XHR 记录
                  </div>
                )
              : (
                  orderedRecords.map(record => (
                    <button
                      key={record.id}
                      type="button"
                      onClick={() => handleSelectRecord(record.id)}
                      className={`grid w-full grid-cols-[2.2fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-2 border-b border-slate-100 px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-slate-50 ${record.id === selectedId ? 'bg-slate-100' : ''}`}
                    >
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-ink/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                            {record.method}
                          </span>
                          <span className="truncate" title={formatRequestPath(record.url)}>{formatRequestPath(record.url)}</span>
                        </div>
                        {formatRequestHost(record.url)
                          ? <div className="truncate text-[10px] text-slate-400" title={formatRequestHost(record.url)}>{formatRequestHost(record.url)}</div>
                          : null}
                      </div>
                      <div className="min-w-0 truncate text-slate-600" title={String(record.status || '-')}>{record.status || '-'}</div>
                      <div className="min-w-0 truncate text-slate-600" title={record.resourceType}>{record.resourceType}</div>
                      <div className="min-w-0 truncate text-slate-600" title={formatBytes(record.encodedDataLength)}>{formatBytes(record.encodedDataLength)}</div>
                      <div className="min-w-0 truncate text-slate-600" title={formatTime(record.timeStamp)}>{formatTime(record.timeStamp)}</div>
                    </button>
                  ))
                )}
          </div>
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
          style={{ width: `${SPLITTER_WIDTH}px` }}
          className="cursor-col-resize bg-slate-200/70 transition hover:bg-slate-300"
        />

        <section
          style={{ width: `${rightPercent}%` }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-200/60"
        >
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            请求/响应详情
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
            {selectedRecord
              ? (
                  <div className="grid gap-3 text-xs text-slate-600">
                    <div>
                      <div className="text-[11px] uppercase text-slate-400">URL</div>
                      <div className="break-all text-[13px] text-slate-700">{selectedRecord.url}</div>
                    </div>

                    <Section
                      title="查询参数"
                      meta={queryMeta}
                      isOpen={queryOpen}
                      onToggle={() => setQueryOpen(prev => !prev)}
                    >
                      {renderKeyValueTable(queryRows)}
                    </Section>
                    <Section
                      title="请求正文"
                      meta={requestMeta}
                      isOpen={requestOpen}
                      onToggle={() => setRequestOpen(prev => !prev)}
                    >
                      <div className="flex items-center justify-end pb-2">
                        <input
                          value={requestSearch}
                          onChange={event => setRequestSearch(event.target.value)}
                          placeholder="搜索请求正文"
                          className="w-40 rounded-md border border-slate-200 px-2 py-1 text-[11px]"
                        />
                      </div>
                      {selectedRecord.requestBody.error
                        ? <div className="text-rose-600">{selectedRecord.requestBody.error.message}</div>
                        : selectedRecord.requestBody.text === null
                          ? <div className="text-slate-400">无请求正文</div>
                          : requestDisplay?.kind === 'form'
                            ? renderKeyValueTable(requestDisplay.rows)
                            : requestDisplay?.kind === 'json'
                              ? requestTextBlock?.node
                              : requestDisplay?.kind === 'text'
                                ? requestTextBlock?.node
                                : null}
                      {requestTextBlock?.hasOverflow
                        ? (
                            <button
                              type="button"
                              onClick={() => setRequestExpanded(prev => !prev)}
                              className="mt-2 text-[11px] text-slate-500"
                            >
                              {requestExpanded ? '收起全文' : '展开全文'}
                            </button>
                          )
                        : null}
                      {selectedRecord.requestBody.truncated
                        ? <div className="mt-2 text-[11px] text-slate-400">请求正文已因大小限制截断</div>
                        : null}
                    </Section>

                    <Section
                      title="响应正文"
                      meta={responseMeta}
                      isOpen={responseOpen}
                      onToggle={() => setResponseOpen(prev => !prev)}
                    >
                      <div className="flex items-center justify-end pb-2">
                        <input
                          value={responseSearch}
                          onChange={event => setResponseSearch(event.target.value)}
                          placeholder="搜索响应正文"
                          className="w-40 rounded-md border border-slate-200 px-2 py-1 text-[11px]"
                        />
                      </div>
                      {selectedRecord.body.isBase64
                        ? (
                            <label className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                              <input
                                type="checkbox"
                                checked={decodeResponseBase64}
                                onChange={event => setDecodeResponseBase64(event.target.checked)}
                              />
                              Base64 解码
                            </label>
                          )
                        : null}
                      {selectedRecord.body.error
                        ? <div className="text-rose-600">{selectedRecord.body.error.message}</div>
                        : selectedRecord.body.text === null
                          ? <div className="text-slate-400">无响应正文</div>
                          : responseDisplay?.kind === 'form'
                            ? renderKeyValueTable(responseDisplay.rows)
                            : responseDisplay?.kind === 'json'
                              ? responseTextBlock?.node
                              : responseDisplay?.kind === 'text'
                                ? responseTextBlock?.node
                                : null}
                      {responseDecodeError
                        ? <div className="mt-2 text-[11px] text-rose-500">{responseDecodeError}</div>
                        : null}
                      {responseTextBlock?.hasOverflow
                        ? (
                            <button
                              type="button"
                              onClick={() => setResponseExpanded(prev => !prev)}
                              className="mt-2 text-[11px] text-slate-500"
                            >
                              {responseExpanded ? '收起全文' : '展开全文'}
                            </button>
                          )
                        : null}
                      {selectedRecord.body.isBase64
                        ? <div className="mt-2 text-[11px] text-slate-400">响应正文为 Base64 编码</div>
                        : null}
                      {selectedRecord.body.truncated
                        ? <div className="mt-2 text-[11px] text-slate-400">响应正文超过大小限制已截断</div>
                        : null}
                    </Section>
                  </div>
                )
              : (
                  <div className="text-xs text-slate-400">请选择一条记录查看详情</div>
                )}
          </div>
        </section>
      </div>
    </div>
  )
}
