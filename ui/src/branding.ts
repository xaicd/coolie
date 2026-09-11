/**
 * 单一品牌常量源 (single brand source of truth).
 *
 * 只用于**用户可见的产品品牌展示**(文档标题、欢迎语、空状态等)。
 *
 * ⚠️ 不要用它替换内部技术标识：
 *  - `@paperclipai/*` 包名、`PAPERCLIP_*` 环境变量、API 字段
 *  - "Paperclip Runner"(ACP runtime 专有组件名)
 *  - "Paperclip Cloud"(官方云服务名,非本实例品牌)
 * 这些保持不变。
 */
export const BRANDING = {
  /** 产品名(展示用)。 */
  productName: "Coolie",
} as const;

export type Branding = typeof BRANDING;
