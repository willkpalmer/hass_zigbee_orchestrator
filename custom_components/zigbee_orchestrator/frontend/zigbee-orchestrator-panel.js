// WP Zigbee Orchestrator - sidebar panel.
//
// Web components with no build step and no external libraries, in a few
// modules loaded by this one (each with this file's ?v= version, so a new
// release is never mixed with a cached old module):
//
//   zo-util.js   shared constants and helpers
//   zo-style.js  the page's styles and markup
//   zo-panel.js  <zigbee-orchestrator-panel>: the page buttons, the pages
//                and the device picker
//
// The pages:
//
//   #devices  Devices - every Zigbee device of the ZHA integration, grouped
//             by its role on the network (Coordinator, Routers, End
//             devices), with the offline ones apart under Offline. Each
//             group can be collapsed (remembered in the browser) and is
//             sorted by name; the columns can be sorted too.
//   #groups   Groups - groups of devices made here, only for finding and
//             viewing devices easily: not ZHA's Zigbee groups, and nothing
//             is changed in ZHA or on the devices. Each group can be
//             renamed, deleted and collapsed, and its devices chosen from
//             a list of every device (Choose devices) or taken out one by
//             one. The devices in no group are listed last, under
//             Ungrouped.
//
// The device list and the groups are each subscribed to once over the
// WebSocket (zigbee_orchestrator/devices/subscribe, .../groups/subscribe)
// and come back in full whenever they change, so devices going offline or
// coming back, and changes made in another browser tab, appear live.
//
// The page itself doesn't scroll: the page buttons, toolbar and column
// headings stay put and only the list scrolls (unless the window is too
// short for that, e.g. a phone held sideways).

const V = new URL(import.meta.url).search;
const { ZigbeeOrchestratorPanel } = await import(`./zo-panel.js${V}`);

if (!customElements.get("zigbee-orchestrator-panel")) {
  customElements.define("zigbee-orchestrator-panel", ZigbeeOrchestratorPanel);
}
