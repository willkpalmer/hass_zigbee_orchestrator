// WP Zigbee Orchestrator - sidebar panel.
//
// Web components with no build step and no external libraries, in a few
// modules loaded by this one (each with this file's ?v= version, so a new
// release is never mixed with a cached old module):
//
//   zo-util.js   shared constants and helpers
//   zo-style.js  the page's styles and markup
//   zo-panel.js  <zigbee-orchestrator-panel>: the page buttons and pages
//
// The pages:
//
//   #devices  Devices - every Zigbee device of the ZHA integration, grouped
//             by its role on the network (Coordinator, Routers, End
//             devices), with the offline ones apart under Offline. Each
//             group can be collapsed (remembered in the browser) and is
//             sorted by name; the columns can be sorted too.
//
// The device list is subscribed to once over the WebSocket
// (zigbee_orchestrator/devices/subscribe) and comes back in full whenever
// it changes, so devices going offline or coming back appear live.
//
// The page itself doesn't scroll: the page buttons, toolbar and column
// headings stay put and only the list scrolls (unless the window is too
// short for that, e.g. a phone held sideways).

const V = new URL(import.meta.url).search;
const { ZigbeeOrchestratorPanel } = await import(`./zo-panel.js${V}`);

if (!customElements.get("zigbee-orchestrator-panel")) {
  customElements.define("zigbee-orchestrator-panel", ZigbeeOrchestratorPanel);
}
