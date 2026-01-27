import type {
  AppError,
  BackgroundToPanelMessage,
  PanelToBackgroundMessage,
  RequestBody,
  ResponseBody,
  ResponseRecord,
} from '../shared/messages'

/** 调试日志开关。 */
const DEBUG = false

/** 最大缓存记录数。 */
const MAX_RECORDS = 200

/** 最大响应体字节阈值。 */
const MAX_BODY_BYTES = 200 * 1024

/** 最大请求体字节阈值。 */
const MAX_REQUEST_BODY_BYTES = 200 * 1024

/** UTF-8 编码器。 */
const TEXT_ENCODER = new TextEncoder()

/** 允许的资源类型集合。 */
const ALLOWED_RESOURCE_TYPES = new Set(['Fetch', 'XHR'])

/** 当前附加的标签页 ID。 */
let attachedTabId: number | null = null

/** 已连接的面板端口集合。 */
const panelPorts = new Set<chrome.runtime.Port>()

/** 请求中的临时信息结构。 */
interface PendingRequest {
  /** 请求唯一标识。 */
  requestId: string
  /** 请求 URL。 */
  url: string
  /** 请求方法。 */
  method: string
  /** 是否有请求体。 */
  hasPostData: boolean
  /** 请求体文本。 */
  requestPostData: string | null
  /** 响应状态码。 */
  status: number
  /** 响应 MIME 类型。 */
  mimeType: string
  /** 资源类型。 */
  resourceType: string
  /** 捕获时间戳（毫秒）。 */
  timeStamp: number
}

/** 挂起请求映射表。 */
const pendingRequests = new Map<string, PendingRequest>()

/** 响应记录缓存。 */
const recordBuffer: ResponseRecord[] = []

/** DevTools 事件：requestWillBeSent。 */
const EVENT_REQUEST_WILL_BE_SENT = 'Network.requestWillBeSent'

/** DevTools 事件：responseReceived。 */
const EVENT_RESPONSE_RECEIVED = 'Network.responseReceived'

/** DevTools 事件：loadingFinished。 */
const EVENT_LOADING_FINISHED = 'Network.loadingFinished'

/** DevTools 事件：loadingFailed。 */
const EVENT_LOADING_FAILED = 'Network.loadingFailed'

/** 输出调试日志。 */
function debugLog(message: string): void {
  if (!DEBUG)
    return
  console.debug(message)
}

/** 创建结构化错误。 */
function createError(code: string, message: string, cause?: unknown): AppError {
  return { code, message, cause }
}

/** 判断资源类型是否允许。 */
function isAllowedResourceType(value: string): boolean {
  return ALLOWED_RESOURCE_TYPES.has(value)
}

/** 向面板广播消息。 */
function broadcast(message: BackgroundToPanelMessage): void {
  for (const port of panelPorts)
    port.postMessage(message)
}

/** 发送当前状态与记录快照。 */
function sendSnapshot(port: chrome.runtime.Port): void {
  port.postMessage({
    type: 'records.snapshot',
    records: [...recordBuffer],
    attachedTabId,
  })
}

/** 发送状态更新。 */
function sendStatusUpdate(): void {
  broadcast({ type: 'status.update', attachedTabId })
}

/** 发送错误给面板。 */
function sendError(error: AppError): void {
  broadcast({ type: 'error', error })
}

/** 追加响应记录并广播。 */
function pushRecord(record: ResponseRecord): void {
  if (recordBuffer.length >= MAX_RECORDS)
    recordBuffer.shift()
  recordBuffer.push(record)
  broadcast({ type: 'records.added', record })
}

/** 计算 UTF-8 字符串长度。 */
function getTextByteLength(text: string): number {
  return TEXT_ENCODER.encode(text).length
}

/** 生成响应体结构。 */
async function buildResponseBody(tabId: number, requestId: string, encodedDataLength: number): Promise<ResponseBody> {
  if (encodedDataLength > MAX_BODY_BYTES) {
    return {
      text: null,
      isBase64: false,
      truncated: true,
      error: createError('BODY_TOO_LARGE', '响应体超过阈值，已跳过'),
    }
  }

  // 使用 debugger API 读取响应体。
  try {
    // 读取响应体返回结构。
    interface ResponseBodyResult {
      body?: string
      base64Encoded?: boolean
    }
    // 发送调试命令。
    const result = await sendDebuggerCommand<ResponseBodyResult>(tabId, 'Network.getResponseBody', { requestId })
    // 解析响应体文本。
    const bodyText = typeof result.body === 'string' ? result.body : null
    // 解析 base64 标记。
    const isBase64 = typeof result.base64Encoded === 'boolean' ? result.base64Encoded : false
    return {
      text: bodyText,
      isBase64,
      truncated: false,
    }
  }
  catch (error) {
    return {
      text: null,
      isBase64: false,
      truncated: false,
      error: createError('BODY_READ_FAILED', '读取响应体失败', error),
    }
  }
}

/** 生成请求体结构。 */
async function buildRequestBody(
  tabId: number | null,
  requestId: string,
  hasPostData: boolean,
  requestPostData: string | null,
): Promise<RequestBody> {
  // 无请求体直接返回。
  if (!hasPostData && requestPostData === null) {
    return {
      text: null,
      truncated: false,
    }
  }

  // 采用已有的请求体文本。
  let resolvedPostData = requestPostData
  // 先对已有文本做阈值判断。
  if (resolvedPostData !== null && getTextByteLength(resolvedPostData) > MAX_REQUEST_BODY_BYTES) {
    return {
      text: null,
      truncated: true,
      error: createError('REQUEST_BODY_TOO_LARGE', '请求体超过阈值，已跳过。'),
    }
  }

  // 读取请求体。
  if (resolvedPostData === null && tabId !== null) {
    try {
      interface RequestPostDataResult {
        postData?: string
      }
      // 调试命令获取请求体文本。
      const result = await sendDebuggerCommand<RequestPostDataResult>(tabId, 'Network.getRequestPostData', { requestId })
      resolvedPostData = typeof result.postData === 'string' ? result.postData : null
    }
    catch (error) {
      return {
        text: null,
        truncated: false,
        error: createError('REQUEST_BODY_READ_FAILED', '读取请求体失败', error),
      }
    }
  }

  // 没有可用文本。
  if (resolvedPostData === null) {
    return {
      text: null,
      truncated: false,
    }
  }

  // 最终阈值判断。
  if (getTextByteLength(resolvedPostData) > MAX_REQUEST_BODY_BYTES) {
    return {
      text: null,
      truncated: true,
      error: createError('REQUEST_BODY_TOO_LARGE', '请求体超过阈值，已跳过。'),
    }
  }

  // 返回请求体文本。
  return {
    text: resolvedPostData,
    truncated: false,
  }
}

/** 发送 debugger 命令并包装为 Promise。 */
function sendDebuggerCommand<T>(tabId: number, method: string, params?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      // 读取 Chrome 运行时错误。
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(lastError)
        return
      }
      resolve(result as T)
    })
  })
}

/** 将输入解析为对象记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 将输入解析为字符串。 */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** 将输入解析为数字。 */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 灏嗚緭鍏ヨВ鏋愪负甯冨皵鍊间互。 */
function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** 解析面板发送的消息。 */
function parsePanelMessage(value: unknown): PanelToBackgroundMessage | null {
  if (!isRecord(value))
    return null

  // 读取消息类型。
  const messageType = asString(value.type)
  if (!messageType)
    return null

  if (messageType === 'debugger.attach') {
    // 解析 tabId。
    const tabId = asNumber(value.tabId)
    if (tabId === null)
      return null
    return { type: 'debugger.attach', tabId }
  }

  if (messageType === 'debugger.detach') {
    // 解析 tabId。
    const tabId = asNumber(value.tabId)
    if (tabId === null)
      return null
    return { type: 'debugger.detach', tabId }
  }

  if (messageType === 'debugger.status')
    return { type: 'debugger.status' }

  if (messageType === 'records.get')
    return { type: 'records.get' }

  if (messageType === 'records.clear')
    return { type: 'records.clear' }

  return null
}

/** 解析 requestWillBeSent 参数。 */
function parseRequestWillBeSent(value: unknown): PendingRequest | null {
  if (!isRecord(value))
    return null

  // 读取 requestId。
  const requestId = asString(value.requestId)
  if (!requestId)
    return null

  // 读取 request 对象。
  const requestValue = isRecord(value.request) ? value.request : null
  if (!requestValue)
    return null

  // 读取 URL 与方法。
  const url = asString(requestValue.url)
  const method = asString(requestValue.method)
  if (!url || !method)
    return null

  // 读取请求体信息。
  const requestPostData = asString(requestValue.postData)
  const hasPostData = asBoolean(requestValue.hasPostData)
  const resolvedHasPostData = hasPostData ?? requestPostData !== null

  // 读取资源类型。
  const resourceType = asString(value.type)
  if (!resourceType || !isAllowedResourceType(resourceType))
    return null

  return {
    requestId,
    url,
    method,
    hasPostData: resolvedHasPostData,
    requestPostData,
    status: 0,
    mimeType: '',
    resourceType,
    timeStamp: Date.now(),
  }
}

/** 解析 responseReceived 参数并更新已有请求。 */
function applyResponseReceived(pending: PendingRequest, value: unknown): PendingRequest | null {
  if (!isRecord(value))
    return null

  // 读取 response 对象。
  const responseValue = isRecord(value.response) ? value.response : null
  if (!responseValue)
    return null

  // 读取状态与 MIME。
  const status = asNumber(responseValue.status)
  const mimeType = asString(responseValue.mimeType)
  if (status === null || !mimeType)
    return null

  // 读取资源类型。
  const resourceType = asString(value.type)
  if (resourceType && !isAllowedResourceType(resourceType))
    return null

  return {
    ...pending,
    status,
    mimeType,
    resourceType: resourceType ?? pending.resourceType,
  }
}

/** 解析 loadingFinished 参数。 */
function parseLoadingFinished(value: unknown): { requestId: string, encodedDataLength: number } | null {
  if (!isRecord(value))
    return null

  // 读取 requestId。
  const requestId = asString(value.requestId)
  if (!requestId)
    return null

  // 读取响应体大小。
  const encodedDataLength = asNumber(value.encodedDataLength)
  if (encodedDataLength === null)
    return null

  return { requestId, encodedDataLength }
}

/** 解析 loadingFailed 参数。 */
function parseLoadingFailed(value: unknown): { requestId: string } | null {
  if (!isRecord(value))
    return null

  // 读取 requestId。
  const requestId = asString(value.requestId)
  if (!requestId)
    return null

  return { requestId }
}

/** 处理 DevTools 事件。 */
function handleDebuggerEvent(source: chrome.debugger.Debuggee, method: string, params?: object): void {
  if (source.tabId !== attachedTabId)
    return

  if (method === EVENT_REQUEST_WILL_BE_SENT) {
    // 解析请求事件。
    const pending = parseRequestWillBeSent(params)
    if (!pending)
      return
    pendingRequests.set(pending.requestId, pending)
    return
  }

  if (method === EVENT_RESPONSE_RECEIVED) {
    // 读取 requestId。
    if (!isRecord(params))
      return
    const requestId = asString(params.requestId)
    if (!requestId)
      return
    // 读取已有请求。
    const existing = pendingRequests.get(requestId)
    if (!existing)
      return
    // 应用响应信息。
    const updated = applyResponseReceived(existing, params)
    if (!updated)
      return
    pendingRequests.set(requestId, updated)
    return
  }

  if (method === EVENT_LOADING_FINISHED) {
    // 解析结束事件。
    const info = parseLoadingFinished(params)
    if (!info)
      return
    void handleLoadingFinished(info.requestId, info.encodedDataLength)
    return
  }

  if (method === EVENT_LOADING_FAILED) {
    // 解析失败事件。
    const info = parseLoadingFailed(params)
    if (!info)
      return
    void handleLoadingFailed(info.requestId)
  }
}

/** 处理响应完成事件。 */
async function handleLoadingFinished(requestId: string, encodedDataLength: number): Promise<void> {
  if (attachedTabId === null)
    return

  // 读取挂起请求。
  const pending = pendingRequests.get(requestId)
  if (!pending)
    return

  // 构建请求体。
  const requestBody = await buildRequestBody(attachedTabId, requestId, pending.hasPostData, pending.requestPostData)
  // 构建响应体。
  const body = await buildResponseBody(attachedTabId, requestId, encodedDataLength)
  // 生成记录。
  const record: ResponseRecord = {
    id: requestId,
    url: pending.url,
    method: pending.method,
    status: pending.status,
    mimeType: pending.mimeType,
    resourceType: pending.resourceType,
    timeStamp: pending.timeStamp,
    encodedDataLength,
    requestBody,
    body,
  }
  pendingRequests.delete(requestId)
  pushRecord(record)
}

/** 处理响应失败事件。 */
async function handleLoadingFailed(requestId: string): Promise<void> {
  if (attachedTabId === null)
    return

  // 读取挂起请求。
  const pending = pendingRequests.get(requestId)
  if (!pending)
    return

  // 构建请求体。
  const requestBody = await buildRequestBody(attachedTabId, requestId, pending.hasPostData, pending.requestPostData)
  // 构建错误响应体。
  const body: ResponseBody = {
    text: null,
    isBase64: false,
    truncated: false,
    error: createError('REQUEST_FAILED', '请求失败，未获取响应体'),
  }
  // 生成记录。
  const record: ResponseRecord = {
    id: requestId,
    url: pending.url,
    method: pending.method,
    status: pending.status,
    mimeType: pending.mimeType,
    resourceType: pending.resourceType,
    timeStamp: pending.timeStamp,
    encodedDataLength: 0,
    requestBody,
    body,
  }
  pendingRequests.delete(requestId)
  pushRecord(record)
}

/** 附加到指定标签页。 */
async function attachToTab(tabId: number): Promise<void> {
  if (attachedTabId === tabId)
    return

  // 如已附加到其他标签页，先解除。
  if (attachedTabId !== null)
    await detachFromTab(attachedTabId)

  // 清空临时数据。
  pendingRequests.clear()
  recordBuffer.length = 0

  // 执行附加。
  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      // 读取错误信息。
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(lastError)
        return
      }
      resolve()
    })
  })

  // 启用网络事件。
  await sendDebuggerCommand(tabId, 'Network.enable')
  attachedTabId = tabId
  sendStatusUpdate()
  broadcast({ type: 'records.snapshot', records: [...recordBuffer], attachedTabId })
  debugLog(`attached to tab ${tabId}`)
}

/** 解除指定标签页的附加。 */
async function detachFromTab(tabId: number): Promise<void> {
  if (attachedTabId !== tabId)
    return

  await new Promise<void>((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      resolve()
    })
  })

  attachedTabId = null
  pendingRequests.clear()
  sendStatusUpdate()
  debugLog(`detached from tab ${tabId}`)
}

/** 清空记录缓存。 */
function clearRecords(): void {
  recordBuffer.length = 0
  pendingRequests.clear()
  sendSnapshotToAll()
}

/** 向全部端口发送快照。 */
function sendSnapshotToAll(): void {
  for (const port of panelPorts)
    sendSnapshot(port)
}

/** 处理面板消息。 */
function handlePanelMessage(message: PanelToBackgroundMessage): void {
  if (message.type === 'debugger.attach') {
    void attachToTab(message.tabId).catch((error) => {
      sendError(createError('ATTACH_FAILED', '附加调试器失败', error))
    })
    return
  }

  if (message.type === 'debugger.detach') {
    void detachFromTab(message.tabId).catch((error) => {
      sendError(createError('DETACH_FAILED', '解除调试器失败', error))
    })
    return
  }

  if (message.type === 'debugger.status') {
    sendStatusUpdate()
    return
  }

  if (message.type === 'records.get') {
    sendSnapshotToAll()
    return
  }

  if (message.type === 'records.clear') {
    clearRecords()
  }
}

/** 处理端口连接。 */
function handlePortConnection(port: chrome.runtime.Port): void {
  if (port.name !== 'panel')
    return

  panelPorts.add(port)
  sendSnapshot(port)

  port.onMessage.addListener((rawMessage) => {
    // 解析面板消息。
    const message = parsePanelMessage(rawMessage)
    if (!message)
      return
    handlePanelMessage(message)
  })

  port.onDisconnect.addListener(() => {
    panelPorts.delete(port)
  })
}

// 注册端口连接监听。
chrome.runtime.onConnect.addListener(handlePortConnection)

// 注册 debugger 事件监听。
chrome.debugger.onEvent.addListener(handleDebuggerEvent)

// 注册 debugger 断开监听。
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== attachedTabId)
    return
  attachedTabId = null
  pendingRequests.clear()
  sendStatusUpdate()
})
