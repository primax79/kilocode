import { Component, createSignal, For, Show, createMemo } from "solid-js"
import { Tabs } from "@kilocode/kilo-ui/tabs"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Card } from "@kilocode/kilo-ui/card"
import { Switch } from "@kilocode/kilo-ui/switch"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { Select } from "@kilocode/kilo-ui/select"
import { useLanguage } from "../../context/language"
import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useVSCode } from "../../context/vscode"
import { parseImport, MAX_IMPORT_SIZE, type ImportError } from "./mode-io"
import SettingsRow from "./SettingsRow"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"

export interface AgentBehaviourTabProps {
  initialSubtab?: string
}

export const AgentBehaviourTab: Component<AgentBehaviourTabProps> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()
  const vscode = useVSCode()
  const dialog = useDialog()

  const [subtab, setSubtab] = createSignal(props.initialSubtab ?? "agents")
  const [editingAgent, setEditingAgent] = createSignal<string>("")
  const [agentView, setAgentView] = createSignal<"list" | "edit" | "create">("list")

  const browse = () => vscode.postMessage({ type: "openMarketplacePanel" })

  // Agent form fields
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [prompt, setPrompt] = createSignal("")
  const [model, setModel] = createSignal("")
  const [smallModel, setSmallModel] = createSignal("")
  const [variant, setVariant] = createSignal("")

  const [newSkillPath, setNewSkillPath] = createSignal("")
  const [newSkillUrl, setNewSkillUrl] = createSignal("")
  const [newRulePath, setNewRulePath] = createSignal("")

  const builtin = (skill: { location?: string }) => !skill.location || skill.location === "builtin"

  const confirmRemoveSkill = (skill: { name: string; location?: string }) => {
    dialog.show(() => (
      <Dialog title={language.t("settings.agentBehaviour.deleteSkillTitle")}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "16px", padding: "8px 0" }}>
          <div style={{ "font-size": "var(--kilo-font-size-13)" }}>
            {language.t("settings.agentBehaviour.deleteSkillPrompt", { name: skill.name })}
          </div>
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px" }}>
            <Button variant="ghost" onClick={() => dialog.close()}>
              {language.t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                vscode.postMessage({ type: "removeSkill", location: skill.location ?? "" })
                dialog.close()
              }}
            >
              {language.t("common.delete")}
            </Button>
          </div>
        </div>
      </Dialog>
    ))
  }

  const startEdit = (name: string) => {
    setEditingAgent(name)
    setAgentView("edit")
  }

  const back = () => {
    setAgentView("list")
    setEditingAgent("")
  }

  const [importError, setImportError] = createSignal("")
  const errorKey = (tag: ImportError) => `settings.agentBehaviour.importMode.${tag}` as const

  const importMode = (file: File) => {
    setImportError("")
    if (file.size > MAX_IMPORT_SIZE) {
      setImportError(language.t(errorKey("tooLarge")))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = parseImport(reader.result as string, agentNames())
      if (!result.ok) {
        setImportError(language.t(errorKey(result.error)))
        return
      }
      const existing = config().agent ?? {}
      updateConfig({ agent: { ...existing, [result.name]: result.config } })
      setImportError("")
    }
    reader.readAsText(file)
  }

  const triggerImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) importMode(file)
    }
    input.click()
  }

  const agentNames = createMemo(() => {
    const all = session.allAgents()
    const names = new Set<string>()
    for (const a of all) names.add(a.name)
    return Array.from(names).sort()
  })

  const skillPaths = () => config().skills?.paths ?? []
  const skillUrls = () => config().skills?.urls ?? []
  const rules = () => config().instructions ?? []

  const addSkillPath = () => {
    const path = newSkillPath().trim()
    if (!path) return
    const current = skillPaths()
    if (!current.includes(path)) {
      updateConfig({ skills: { ...config().skills, paths: [...current, path] } })
    }
    setNewSkillPath("")
  }

  const removeSkillPath = (index: number) => {
    const current = [...skillPaths()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, paths: current } })
  }

  const addSkillUrl = () => {
    const url = newSkillUrl().trim()
    if (!url) return
    const current = skillUrls()
    if (!current.includes(url)) {
      updateConfig({ skills: { ...config().skills, urls: [...current, url] } })
    }
    setNewSkillUrl("")
  }

  const removeSkillUrl = (index: number) => {
    const current = [...skillUrls()]
    current.splice(index, 1)
    updateConfig({ skills: { ...config().skills, urls: current } })
  }

  const addRule = () => {
    const path = newRulePath().trim()
    if (!path) return
    const current = rules()
    if (!current.includes(path)) {
      updateConfig({ instructions: [...current, path] })
    }
    setNewRulePath("")
  }

  const removeRule = (index: number) => {
    const current = [...rules()]
    current.splice(index, 1)
    updateConfig({ instructions: current })
  }

  const renderAgentsSubtab = () => (
    <div>
      <Show when={agentView() === "list"}>
        <Card style={{ "margin-bottom": "16px" }}>
          <SettingsRow
            title={language.t("settings.agentBehaviour.defaultAgent.title")}
            description={language.t("settings.agentBehaviour.defaultAgent.description")}
          >
            <Select
              options={agentNames().map((a) => ({ value: a, label: a }))}
              current={{ value: config().default_agent ?? "code", label: config().default_agent ?? "code" }}
              value={(o: { value: string; label: string }) => o.value}
              label={(o: { value: string; label: string }) => o.label}
              onSelect={(val: { value: string; label: string } | undefined) => val && updateConfig({ default_agent: val.value })}
            />
          </SettingsRow>
        </Card>

        <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "8px", "margin-top": "16px" }}>
          <div data-slot="settings-row-label-title">{language.t("settings.agentBehaviour.availableAgents")}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="ghost" size="small" onClick={triggerImport}>
              {language.t("settings.agentBehaviour.importMode")}
            </Button>
            <Button variant="secondary" size="small" onClick={() => setAgentView("create")}>
              {language.t("settings.agentBehaviour.createMode")}
            </Button>
          </div>
        </div>

        <Show when={agentNames().length > 0}>
          <Card style={{ "margin-bottom": "12px" }}>
            <For each={agentNames()}>
              {(name, index) => {
                const agent = () => session.allAgents().find((a) => a.name === name)
                const isCustom = () => !agent()?.native
                return (
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      padding: "8px 4px",
                      "border-bottom": index() < agentNames().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                      cursor: "pointer",
                    }}
                    onClick={() => startEdit(name)}
                  >
                    <div>
                      <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                        <span style={{ "font-weight": "600" }}>{name}</span>
                        <Show when={isCustom()}>
                          <span style={{ "font-size": "var(--kilo-font-size-10)", opacity: 0.7, padding: "2px 6px", background: "var(--bg-hover-base)", "border-radius": "4px" }}>
                            custom
                          </span>
                        </Show>
                      </div>
                      <div style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-descriptionForeground)" }}>
                        {agent()?.description}
                      </div>
                    </div>
                    <IconButton size="small" variant="ghost" icon="chevron-right" />
                  </div>
                )
              }}
            </For>
          </Card>
        </Show>
      </Show>
    </div>
  )

  const renderSkillsSubtab = () => (
    <div>
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>
        {language.t("settings.agentBehaviour.discoveredSkills")} ({session.skills().length})
      </h4>
      <Show
        when={session.skills().length > 0}
        fallback={
          <Card style={{ "margin-bottom": "16px" }}>
            <div data-slot="settings-row-label-subtitle">{language.t("settings.agentBehaviour.noSkillsFound")}</div>
          </Card>
        }
      >
        <Card style={{ "margin-bottom": "16px" }}>
          <For each={session.skills()}>
            {(skill, index) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  padding: "8px 0",
                  "border-bottom": index() < session.skills().length - 1 ? "1px solid var(--border-weak-base)" : "none",
                }}
              >
                <div style={{ flex: 1, "min-width": 0 }}>
                  <div data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
                    {skill.name}
                  </div>
                  <div data-slot="settings-row-label-subtitle" style={{ "margin-top": "4px", "font-family": "var(--vscode-editor-font-family, monospace)" }}>
                    <div>{skill.description}</div>
                    {!builtin(skill) && <div>{skill.location}</div>}
                  </div>
                </div>
                {!builtin(skill) && (
                  <IconButton size="small" variant="ghost" icon="close" onClick={() => confirmRemoveSkill(skill)} />
                )}
              </div>
            )}
          </For>
        </Card>
      </Show>

      {/* Skill paths */}
      <h4 style={{ "margin-top": "0", "margin-bottom": "8px" }}>{language.t("settings.agentBehaviour.skillPaths")}</h4>
      <Card style={{ "margin-bottom": "16px" }}>
        <div style={{ display: "flex", gap: "8px", "align-items": "center", padding: "8px 0" }}>
          <div style={{ flex: 1, "min-width": 0 }}>
            <TextField placeholder="e.g. ./skills" value={newSkillPath()} onChange={(val) => setNewSkillPath(val)} />
          </div>
          <Button variant="secondary" onClick={addSkillPath}>
            {language.t("common.add")}
          </Button>
        </div>
        <For each={skillPaths()}>
          {(path, index) => (
            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", padding: "6px 0" }}>
              <span style={{ "font-family": "monospace", "font-size": "var(--kilo-font-size-12)" }}>{path}</span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeSkillPath(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )

  const renderMcpsSubtab = () => (
    <div>
      <div style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-descriptionForeground)", "margin-bottom": "12px" }}>
        Model Context Protocol (MCP) servers connected to Kilo.
      </div>
      <Card>
        <div style={{ padding: "12px" }}>
          <div style={{ "font-weight": "600" }}>Installed MCP Servers</div>
          <div style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-descriptionForeground)", "margin-top": "4px" }}>
            Configure and toggle MCP servers in kilo.json
          </div>
        </div>
      </Card>
    </div>
  )

  const renderRulesSubtab = () => (
    <div>
      <div style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-descriptionForeground)", "margin-bottom": "12px" }}>
        {language.t("settings.agentBehaviour.rules.description")}
      </div>
      <Card>
        <div style={{ display: "flex", gap: "8px", padding: "8px 0" }}>
          <div style={{ flex: 1 }}>
            <TextField placeholder="e.g. ./INSTRUCTIONS.md" value={newRulePath()} onChange={(val) => setNewRulePath(val)} />
          </div>
          <Button variant="secondary" onClick={addRule}>{language.t("common.add")}</Button>
        </div>
        <For each={rules()}>
          {(rule, index) => (
            <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", padding: "6px 0" }}>
              <span style={{ "font-family": "monospace" }}>{rule}</span>
              <IconButton size="small" variant="ghost" icon="close" onClick={() => removeRule(index())} />
            </div>
          )}
        </For>
      </Card>
    </div>
  )

  const renderWorkflowsSubtab = () => (
    <div>
      <div style={{ "font-size": "var(--kilo-font-size-12)", color: "var(--vscode-descriptionForeground)", "margin-bottom": "12px" }}>
        Workflows are custom slash commands defined in your config.
      </div>
    </div>
  )

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      {/* Permanent Header Shortcut Bar */}
      <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between" }}>
        <Tabs value={subtab()} onChange={(val) => setSubtab(val)}>
          <Tabs.List>
            <Tabs.Trigger value="agents">Agents</Tabs.Trigger>
            <Tabs.Trigger value="skills">Skills</Tabs.Trigger>
            <Tabs.Trigger value="mcp">MCP Servers</Tabs.Trigger>
            <Tabs.Trigger value="workflows">Workflows</Tabs.Trigger>
            <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
          </Tabs.List>
        </Tabs>
        <Button variant="ghost" size="small" onClick={browse}>
          Browse Marketplace ↗
        </Button>
      </div>

      {/* Subtab Content */}
      <Show when={subtab() === "agents"}>{renderAgentsSubtab()}</Show>
      <Show when={subtab() === "skills"}>{renderSkillsSubtab()}</Show>
      <Show when={subtab() === "mcp"}>{renderMcpsSubtab()}</Show>
      <Show when={subtab() === "workflows"}>{renderWorkflowsSubtab()}</Show>
      <Show when={subtab() === "rules"}>{renderRulesSubtab()}</Show>
    </div>
  )
}
