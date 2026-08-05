import { Component, createSignal, For, Show } from "solid-js"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { Tabs } from "@kilocode/kilo-ui/tabs"
import { Button } from "@kilocode/kilo-ui/button"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Switch } from "@kilocode/kilo-ui/switch"
import { Card } from "@kilocode/kilo-ui/card"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { useConfig } from "../../context/config"

export interface MarketplaceManageModalProps {
  onClose: () => void
}

export const MarketplaceManageModal: Component<MarketplaceManageModalProps> = (props) => {
  const { config, updateGlobalConfig, updateProjectConfig } = useConfig()
  const [scope, setScope] = createSignal<"global" | "project">("project")

  const [newName, setNewName] = createSignal("")
  const [newUrl, setNewUrl] = createSignal("")
  const [error, setError] = createSignal("")

  const marketplaces = () => {
    return config().marketplaces ?? []
  }

  const handleAdd = () => {
    setError("")
    const name = newName().trim()
    const url = newUrl().trim()

    if (!name || !url) {
      setError("Please provide both a marketplace name and a repository URL/path.")
      return
    }

    const current = [...marketplaces()]
    if (current.some((m) => m.name === name)) {
      setError(`A marketplace named '${name}' already exists.`)
      return
    }

    const next = [...current, { name, url, enabled: true }]
    if (scope() === "global") {
      updateGlobalConfig({ marketplaces: next })
    } else {
      updateProjectConfig({ marketplaces: next })
    }

    setNewName("")
    setNewUrl("")
  }

  const handleToggle = (index: number, enabled: boolean) => {
    const current = [...marketplaces()]
    current[index] = { ...current[index], enabled }
    if (scope() === "global") {
      updateGlobalConfig({ marketplaces: current })
    } else {
      updateProjectConfig({ marketplaces: current })
    }
  }

  const handleRemove = (index: number) => {
    const current = [...marketplaces()]
    current.splice(index, 1)
    if (scope() === "global") {
      updateGlobalConfig({ marketplaces: current })
    } else {
      updateProjectConfig({ marketplaces: current })
    }
  }

  return (
    <Dialog title="Manage Marketplace Sources">
      <div style={{ display: "flex", "flex-direction": "column", gap: "16px", padding: "12px 0 0", width: "100%", "box-sizing": "border-box" }}>
        {/* Scope Selector: Workspace vs User */}
        <Tabs value={scope()} onChange={(val) => setScope(val as "global" | "project")}>
          <Tabs.List>
            <Tabs.Trigger value="project">Workspace (Project)</Tabs.Trigger>
            <Tabs.Trigger value="global">User (Global)</Tabs.Trigger>
          </Tabs.List>
        </Tabs>

        {/* Add New Source Section */}
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <div style={{ "font-weight": "600", "font-size": "var(--kilo-font-size-12)", color: "var(--text-weak-base)" }}>
            ADD NEW REPOSITORY
          </div>
          <div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
            <div style={{ flex: 1 }}>
              <TextField
                placeholder="Marketplace Name"
                value={newName()}
                onChange={(v) => setNewName(v)}
              />
            </div>
            <div style={{ flex: 2 }}>
              <TextField
                placeholder="Git URL or Local Path"
                value={newUrl()}
                onChange={(v) => setNewUrl(v)}
              />
            </div>
            <Button variant="secondary" size="small" onClick={handleAdd}>
              Add
            </Button>
          </div>
          <Show when={error()}>
            <div style={{ color: "var(--vscode-errorForeground)", "font-size": "var(--kilo-font-size-12)" }}>
              {error()}
            </div>
          </Show>
        </div>

        {/* Configured Sources List */}
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <div style={{ "font-weight": "600", "font-size": "var(--kilo-font-size-12)", color: "var(--text-weak-base)" }}>
            CONFIGURED SOURCES ({marketplaces().length})
          </div>
          <Show
            when={marketplaces().length > 0}
            fallback={
              <Card style={{ padding: "12px", color: "var(--vscode-descriptionForeground)", "font-size": "var(--kilo-font-size-12)" }}>
                No custom marketplace repositories configured for this scope.
              </Card>
            }
          >
            <div style={{ display: "flex", "flex-direction": "column", gap: "8px", "max-height": "200px", overflow: "auto" }}>
              <For each={marketplaces()}>
                {(mp, index) => (
                  <Card style={{ padding: "10px 12px", display: "flex", "align-items": "center", "justify-content": "space-between" }}>
                    <div style={{ display: "flex", "flex-direction": "column", gap: "2px", flex: 1, "min-width": 0, "margin-right": "12px" }}>
                      <div style={{ "font-weight": "600", "font-size": "var(--kilo-font-size-13)", color: "var(--text-base)" }}>
                        {mp.name}
                      </div>
                      <div style={{ "font-size": "var(--kilo-font-size-11)", color: "var(--vscode-descriptionForeground)", "font-family": "monospace", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
                        {mp.url}
                      </div>
                    </div>
                    <div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
                      <Switch
                        checked={mp.enabled ?? true}
                        onChange={(val) => handleToggle(index(), val)}
                      />
                      <IconButton
                        icon="close"
                        variant="ghost"
                        size="small"
                        onClick={() => handleRemove(index())}
                      />
                    </div>
                  </Card>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Footer Actions */}
        <div style={{ display: "flex", "justify-content": "flex-end", "padding-top": "4px" }}>
          <Button variant="secondary" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
