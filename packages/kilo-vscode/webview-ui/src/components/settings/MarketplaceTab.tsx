import { Component } from "solid-js"
import { MarketplaceView } from "../marketplace/MarketplaceView"

const MarketplaceTab: Component = () => {
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <MarketplaceView />
    </div>
  )
}

export default MarketplaceTab
