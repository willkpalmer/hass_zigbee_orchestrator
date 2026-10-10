// WP Zigbee Orchestrator panel - shared constants and helpers (see
// zigbee-orchestrator-panel.js for how the modules fit together).

export const WS = {
  DEVICES_SUBSCRIBE: "zigbee_orchestrator/devices/subscribe",
  GROUPS_SUBSCRIBE: "zigbee_orchestrator/groups/subscribe",
  GROUPS_CREATE: "zigbee_orchestrator/groups/create",
  GROUPS_RENAME: "zigbee_orchestrator/groups/rename",
  GROUPS_DELETE: "zigbee_orchestrator/groups/delete",
  GROUPS_SET_DEVICES: "zigbee_orchestrator/groups/set_devices",
  GROUPS_ADD_DEVICES: "zigbee_orchestrator/groups/add_devices",
  GROUPS_REMOVE_DEVICES: "zigbee_orchestrator/groups/remove_devices",
};

// The device groups, in this order (each device's "category", see
// devices.py): offline devices are kept apart whatever their role.
export const CATEGORIES = [
  ["coordinator", "Coordinator"],
  ["router", "Routers"],
  ["end_device", "End devices"],
  ["unknown", "Unknown type"],
  ["offline", "Offline"],
];

// Where readings turn from red (low) to amber (medium) to green (high):
// [the lowest medium reading, the lowest high one].
export const LEVELS = {
  battery: [21, 51],   // %: red up to 20%, amber up to 50%
  lqi: [80, 150],      // link quality, 0-255
  rssi: [-80, -65],    // dBm: red below -80, green from -65
};

// "low", "medium" or "high" for a reading, or "" for none.
export function level(kind, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  const [medium, high] = LEVELS[kind];
  return value >= high ? "high" : value >= medium ? "medium" : "low";
}

// Where the collapsed groups are remembered, per browser.
export const COLLAPSED_KEY = "zigbee_orchestrator.collapsed_groups";
// Where each page's search and sort are remembered.
export const VIEW_STATE_KEY = "zigbee_orchestrator.view_state";

// localStorage, which can be unavailable (private windows, blocked
// storage): reads fall back, writes are skipped.
export function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch (_err) {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_err) {
    // Not remembered; it still works for this visit.
  }
}

// "1,234" with the browser's grouping.
export function num(n) {
  return Number(n || 0).toLocaleString();
}

// Home Assistant can create a panel's element, and set its hass, narrow and
// panel, before the element's code has finished loading (the modules load
// one after another). Those values then sit on the element itself and hide
// the class's setters, so it would never hear about them: move them over.
export function upgradeProperties(element, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(element, name)) {
      const value = element[name];
      delete element[name];
      element[name] = value;
    }
  }
}
