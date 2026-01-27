/** 结构化错误定义。 */
export interface AppError {
  /** 错误码。 */
  code: string
  /** 可读错误信息。 */
  message: string
  /** 可选的底层错误。 */
  cause?: unknown
}

/** 响应体内容信息。 */
export interface ResponseBody {
  /** 响应体文本。 */
  text: string | null
  /** 是否 base64 编码。 */
  isBase64: boolean
  /** 是否因阈值截断。 */
  truncated: boolean
  /** 解析错误信息。 */
  error?: AppError
}

/** 请求体内容信息。 */
export interface RequestBody {
  /** 请求体文本。 */
  text: string | null
  /** 是否因阈值截断。 */
  truncated: boolean
  /** 解析错误信息。 */
  error?: AppError
}

/** 单条响应记录。 */
export interface ResponseRecord {
  /** 请求唯一标识。 */
  id: string
  /** 请求 URL。 */
  url: string
  /** 请求方法。 */
  method: string
  /** 响应状态码。 */
  status: number
  /** 响应 MIME 类型。 */
  mimeType: string
  /** 资源类型。 */
  resourceType: string
  /** 时间戳（毫秒）。 */
  timeStamp: number
  /** 响应体大小（字节）。 */
  encodedDataLength: number
  /** 请求体内容。 */
  requestBody: RequestBody
  /** 响应体内容。 */
  body: ResponseBody
}

/** 面板 -> 后台消息：附加调试器。 */
export interface DebuggerAttachMessage {
  /** 消息类型。 */
  type: 'debugger.attach'
  /** 目标标签页 ID。 */
  tabId: number
}

/** 面板 -> 后台消息：解除调试器。 */
export interface DebuggerDetachMessage {
  /** 消息类型。 */
  type: 'debugger.detach'
  /** 目标标签页 ID。 */
  tabId: number
}

/** 面板 -> 后台消息：获取状态。 */
export interface DebuggerStatusMessage {
  /** 消息类型。 */
  type: 'debugger.status'
}

/** 面板 -> 后台消息：获取记录快照。 */
export interface RecordsGetMessage {
  /** 消息类型。 */
  type: 'records.get'
}

/** 面板 -> 后台消息：清空记录。 */
export interface RecordsClearMessage {
  /** 消息类型。 */
  type: 'records.clear'
}

/** 面板 -> 后台消息联合类型。 */
export type PanelToBackgroundMessage =
  | DebuggerAttachMessage
  | DebuggerDetachMessage
  | DebuggerStatusMessage
  | RecordsGetMessage
  | RecordsClearMessage

/** 后台 -> 面板消息：状态。 */
export interface DebuggerStatusUpdateMessage {
  /** 消息类型。 */
  type: 'status.update'
  /** 当前附加的标签页 ID。 */
  attachedTabId: number | null
}

/** 后台 -> 面板消息：记录快照。 */
export interface RecordsSnapshotMessage {
  /** 消息类型。 */
  type: 'records.snapshot'
  /** 记录列表。 */
  records: ResponseRecord[]
  /** 当前附加的标签页 ID。 */
  attachedTabId: number | null
}

/** 后台 -> 面板消息：新增记录。 */
export interface RecordsAddedMessage {
  /** 消息类型。 */
  type: 'records.added'
  /** 新增记录。 */
  record: ResponseRecord
}

/** 后台 -> 面板消息：错误。 */
export interface ErrorMessage {
  /** 消息类型。 */
  type: 'error'
  /** 错误信息。 */
  error: AppError
}

/** 后台 -> 面板消息联合类型。 */
export type BackgroundToPanelMessage =
  | DebuggerStatusUpdateMessage
  | RecordsSnapshotMessage
  | RecordsAddedMessage
  | ErrorMessage
