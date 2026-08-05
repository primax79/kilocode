export interface McpParameter {
  name: string
  key: string
  placeholder?: string
  optional?: boolean
}

export interface McpInstallationMethod {
  name: string
  content: string
  parameters?: McpParameter[]
  prerequisites?: string[]
}

export interface MarketplaceSuggestFor {
  filename?: string[]
  vscode_extension?: string[]
}

export interface MarketplaceItemBase {
  id: string
  name: string
  description: string
  category: string
  author?: string
  authorUrl?: string
  // Set for skills fetched from a configured self-hosted marketplace feed
  // (see actions.ts's fetchCustomMarketplaceSkills) - undefined for the
  // official api.kilo.ai catalog. Mirrors webview-ui's identically-named
  // field (types/marketplace.ts); these two MarketplaceItemBase
  // definitions are kept in sync by hand, not shared, same as every other
  // webview<->host message type in this codebase.
  marketplace?: string
  prerequisites?: string[]
  suggest_for?: MarketplaceSuggestFor
}

export interface McpMarketplaceItem extends MarketplaceItemBase {
  type: "mcp"
  url: string
  content: string | McpInstallationMethod[]
  parameters?: McpParameter[]
}

export interface AgentContent {
  mode: "primary" | "subagent" | "all"
  description: string
  prompt: string
  options?: Record<string, unknown>
  permission?: Record<string, unknown>
  requirements?: {
    skills?: string[]
    mcps?: string[]
    vscode_extensions?: Array<{ name: string; id: string }>
  }
}

export interface AgentMarketplaceItem extends MarketplaceItemBase {
  type: "agent"
  content: AgentContent
}

export interface RawSkill {
  id: string
  description: string
  category: string
  githubUrl: string
  content: string
  suggest_for?: MarketplaceSuggestFor
}

export interface SkillMarketplaceItem extends MarketplaceItemBase {
  type: "skill"
  githubUrl: string
  // Exactly one of the two is present. `content` (a tarball URL, the
  // official api.kilo.ai shape) is fetched and extracted as-is. `files`
  // (a self-hosted, packaging-free alternative - no `gh release` step) is
  // a flat list of paths relative to `githubUrl`'s tree, each fetched
  // individually from the equivalent raw.githubusercontent.com URL - see
  // installer.ts's installSkillFromFiles(). Neither reuses skills.urls'
  // discovery.ts download path (permanent cache, no removal) - both go
  // through this installer's own explicit-refuse-on-reinstall / real-rm-on-
  // remove semantics.
  content?: string
  files?: string[]
  displayName: string
  displayCategory: string
}

export type MarketplaceItem = McpMarketplaceItem | AgentMarketplaceItem | SkillMarketplaceItem
export type MarketplaceItemRef = Pick<MarketplaceItem, "id" | "type">

export interface InstallMarketplaceItemOptions {
  target?: "global" | "project"
  parameters?: Record<string, unknown>
}

export interface MarketplaceInstalledMetadata {
  project: Record<string, { type: string }>
  global: Record<string, { type: string }>
}

export interface MarketplaceRelevance {
  filename?: string[]
  vscodeExtension?: string[]
}

export type MarketplaceRelevanceMetadata = Record<string, MarketplaceRelevance>

export interface MarketplaceRepo {
  name: string
  url: string
  enabled?: boolean
}

export interface MarketplaceDataResponse {
  marketplaceItems: MarketplaceItem[]
  marketplaceInstalledMetadata: MarketplaceInstalledMetadata
  marketplaceRelevance: MarketplaceRelevanceMetadata
  marketplaces?: MarketplaceRepo[]
  errors?: string[]
}

export interface InstallResult {
  success: boolean
  slug: string
  error?: string
  filePath?: string
  line?: number
}

export interface RemoveResult {
  success: boolean
  slug: string
  error?: string
}
