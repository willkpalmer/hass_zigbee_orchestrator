// WP Zigbee Orchestrator panel - the main element,
// <zigbee-orchestrator-panel>: the page buttons and the Devices page (see
// zigbee-orchestrator-panel.js for how the modules fit together).

const V = new URL(import.meta.url).search;
// The version loaded, from the ?v= every module is loaded with (panel.py).
const VERSION = new URLSearchParams(V).get("v") || "";
const {
  CATEGORIES, COLLAPSED_KEY, LOW_BATTERY, VIEW_STATE_KEY, WS,
  loadJSON, num, saveJSON, upgradeProperties,
} = await import(`./zo-util.js${V}`);
const { STYLE, TEMPLATE } = await import(`./zo-style.js${V}`);

const VIEWS = ["devices"];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const CATEGORY_ORDER = Object.fromEntries(CATEGORIES.map(([key], i) => [key, i]));

const text = (v) => String(v ?? "").toLocaleLowerCase();
const byText = (key) => (a, b) => text(a[key]).localeCompare(text(b[key]), undefined, { numeric: true });
// Devices with no battery reading sort after every reading, either way.
const byBattery = (a, b) => (a.battery ?? -1) - (b.battery ?? -1);
const byStatus = (a, b) => Number(b.available) - Number(a.available);

// The Devices page's columns: key, heading, how it sorts, cell class.
const COLUMNS = [
  { key: "name", label: "Device name", compare: byText("name"), cls: "name" },
  { key: "area", label: "Area", compare: byText("area") },
  { key: "manufacturer", label: "Manufacturer", compare: byText("manufacturer") },
  { key: "model", label: "Model", compare: byText("model") },
  { key: "battery", label: "Battery", compare: byBattery, cls: "num" },
  { key: "available", label: "Status", compare: byStatus },
];
const DEFAULT_SORT = { key: "name", dir: 1 };

export class ZigbeeOrchestratorPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._panel = null;
    this._view = "devices";
    this._devices = [];
    this._loaded = false;
    this._zhaRunning = true;
    this._updated = null;
    this._unsub = null;
    this._subscribing = false;
    const saved = loadJSON(VIEW_STATE_KEY, {}).devices || {};
    this._filter = typeof saved.filter === "string" ? saved.filter : "";
    this._sort = COLUMNS.some((c) => c.key === saved.sort?.key)
      ? { key: saved.sort.key, dir: saved.sort.dir === -1 ? -1 : 1 }
      : { ...DEFAULT_SORT };
    const collapsed = loadJSON(COLLAPSED_KEY, {}).devices;
    this._collapsed = new Set(Array.isArray(collapsed) ? collapsed : []);

    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this._el("version").textContent = VERSION ? `v${VERSION}` : "";
    this._el("filter").value = this._filter;
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKeyDown(ev));
    this._el("filter").addEventListener("input", (ev) => {
      this._filter = ev.target.value;
      this._saveViewState();
      this._render();
    });
    this._onHash = () => this._applyHash();
    // "/" jumps to the filter from anywhere on the page (not while typing).
    this._onWindowKey = (ev) => {
      if (!this.isConnected || this.hidden || ev.defaultPrevented) return;
      const typing = ev.composedPath().some((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "/") {
        ev.preventDefault();
        this._el("filter").focus();
      }
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected) this._subscribe();
  }

  get hass() { return this._hass; }

  set narrow(value) {
    this._narrow = value;
    this.toggleAttribute("narrow", !!value);
  }

  get narrow() { return this._narrow; }

  set panel(value) {
    this._panel = value;
    this._applyHash();
  }

  get panel() { return this._panel; }

  connectedCallback() {
    upgradeProperties(this, ["hass", "narrow", "panel", "route"]);
    window.addEventListener("hashchange", this._onHash);
    window.addEventListener("keydown", this._onWindowKey);
    this._applyHash();
    if (this._hass) this._subscribe();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    window.removeEventListener("keydown", this._onWindowKey);
    this._unsubscribe();
  }

  _applyHash() {
    const hash = window.location.hash.replace("#", "");
    const view = VIEWS.includes(hash) ? hash : this._view;
    if (view !== this._view || !this._rendered) {
      this._view = view;
      this._render();
    }
  }

  // -- data -----------------------------------------------------------

  async _subscribe() {
    if (this._unsub || this._subscribing || !this._hass?.connection) return;
    this._subscribing = true;
    try {
      const unsub = await this._hass.connection.subscribeMessage(
        (msg) => this._onDevices(msg), { type: WS.DEVICES_SUBSCRIBE },
      );
      if (this.isConnected) this._unsub = unsub;
      else unsub();
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    } finally {
      this._subscribing = false;
    }
  }

  _unsubscribe() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  }

  _onDevices(msg) {
    this._devices = Array.isArray(msg.devices) ? msg.devices : [];
    this._zhaRunning = msg.zha_running !== false;
    this._loaded = true;
    this._error = null;
    this._updated = new Date();
    this._render();
  }

  _saveViewState() {
    saveJSON(VIEW_STATE_KEY, { devices: { filter: this._filter, sort: this._sort } });
  }

  _saveCollapsed() {
    saveJSON(COLLAPSED_KEY, { devices: [...this._collapsed] });
  }

  // -- rendering ------------------------------------------------------

  // The devices matching the filter, by group and then the chosen sort
  // (by name, then by IEEE address, among equals).
  _rows() {
    const words = text(this._filter).split(/\s+/).filter(Boolean);
    const rows = this._devices.filter((d) => {
      if (!words.length) return true;
      const hay = text([d.name, d.area, d.manufacturer, d.model, d.ieee].join(" "));
      return words.every((w) => hay.includes(w));
    });
    const col = COLUMNS.find((c) => c.key === this._sort.key) || COLUMNS[0];
    const byName = byText("name");
    rows.sort((a, b) =>
      (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
      || this._sort.dir * col.compare(a, b)
      || byName(a, b)
      || String(a.ieee).localeCompare(String(b.ieee)));
    return rows;
  }

  _render() {
    this._rendered = true;
    for (const btn of this.shadowRoot.querySelectorAll(".view")) {
      btn.classList.toggle("active", btn.dataset.view === this._view);
    }
    const offline = this._devices.filter((d) => !d.available).length;
    const count = this.shadowRoot.querySelector('[data-count="devices"]');
    count.textContent = this._loaded && offline ? num(offline) : "";
    count.classList.toggle("alert", offline > 0);
    count.title = `${offline} offline`;
    this._renderSummary(offline);
    this._el("notice").hidden = !this._loaded || this._zhaRunning;

    this._renderHead();
    const rows = this._rows();
    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const sizes = new Map();
    for (const r of rows) sizes.set(r.category, (sizes.get(r.category) || 0) + 1);
    let lastGroup = null;
    for (const r of rows) {
      const collapsed = this._collapsed.has(r.category);
      if (r.category !== lastGroup) {
        lastGroup = r.category;
        frag.appendChild(this._groupRow(r.category, sizes.get(r.category), collapsed));
      }
      if (!collapsed) frag.appendChild(this._deviceRow(r));
    }
    body.appendChild(frag);

    const status = this._el("status");
    status.hidden = false;
    if (this._error) status.textContent = `Couldn't load the devices: ${this._error}`;
    else if (!this._loaded) status.textContent = "Loading…";
    else if (!this._devices.length) status.textContent = "No Zigbee devices found. Is the ZHA integration set up?";
    else if (!rows.length) status.textContent = "No devices match the filter.";
    else status.hidden = true;

    const groups = [...sizes.keys()];
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-groups"]');
    const allCollapsed = groups.length > 0 && groups.every((g) => this._collapsed.has(g));
    toggle.textContent = allCollapsed ? "Expand all" : "Collapse all";
    toggle.disabled = !groups.length;

    const footer = this._el("footer");
    if (!this._loaded) footer.textContent = "";
    else {
      const shown = rows.length === this._devices.length
        ? `${num(rows.length)} devices`
        : `${num(rows.length)} of ${num(this._devices.length)} devices`;
      footer.textContent = `${shown} · updated ${this._updated.toLocaleTimeString()}`;
    }
  }

  _renderSummary(offline) {
    const summary = this._el("summary");
    summary.textContent = "";
    if (!this._loaded) return;
    summary.append(`${num(this._devices.length)} devices`);
    if (offline) {
      const warn = document.createElement("span");
      warn.className = "warn";
      warn.textContent = ` · ${num(offline)} offline`;
      summary.appendChild(warn);
    }
  }

  _renderHead() {
    const head = this._el("head");
    head.textContent = "";
    for (const col of COLUMNS) {
      const th = document.createElement("th");
      th.className = `sortable ${col.cls === "num" ? "num" : ""}`;
      th.dataset.sort = col.key;
      th.tabIndex = 0;
      th.title = `Sort by ${col.label.toLowerCase()}`;
      const sorted = this._sort.key === col.key;
      th.setAttribute("aria-sort", sorted ? (this._sort.dir > 0 ? "ascending" : "descending") : "none");
      th.append(col.label);
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = sorted ? (this._sort.dir > 0 ? "▲" : "▼") : "";
      th.appendChild(arrow);
      head.appendChild(th);
    }
  }

  _groupRow(category, size, collapsed) {
    const tr = document.createElement("tr");
    tr.className = `group ${category}`;
    tr.dataset.groupToggle = category;
    tr.tabIndex = 0;
    tr.setAttribute("aria-expanded", String(!collapsed));
    tr.title = collapsed ? "Show these devices (Enter)" : "Hide these devices (Enter)";
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length;
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = collapsed ? "▸" : "▾";
    const count = document.createElement("span");
    count.className = "group-count";
    count.textContent = ` (${num(size)})`;
    td.append(caret, CATEGORY_LABELS[category] || category, count);
    tr.appendChild(td);
    return tr;
  }

  _deviceRow(d) {
    const tr = document.createElement("tr");
    tr.className = "row";
    tr.classList.toggle("disabled", !!d.disabled);
    tr.dataset.id = d.id;

    const name = document.createElement("td");
    name.className = "name";
    const link = document.createElement("a");
    link.href = `/config/devices/device/${encodeURIComponent(d.id)}`;
    link.dataset.nav = "";
    link.textContent = d.name;
    link.title = `Open the device's page (IEEE ${d.ieee})`;
    name.appendChild(link);
    if (d.disabled) {
      const chip = document.createElement("span");
      chip.className = "chip disabled";
      chip.style.marginLeft = "6px";
      chip.textContent = "Disabled";
      name.appendChild(chip);
    }

    const cell = (label, value) => {
      const td = document.createElement("td");
      if (value) {
        const l = document.createElement("span");
        l.className = "label sub";
        l.textContent = `${label}: `;
        td.append(l, value);
      }
      return td;
    };

    tr.append(
      name,
      cell("Area", d.area),
      cell("Manufacturer", d.manufacturer),
      cell("Model", d.model),
      this._batteryCell(d),
      this._statusCell(d),
    );
    return tr;
  }

  _batteryCell(d) {
    const td = document.createElement("td");
    td.className = "num";
    const label = document.createElement("span");
    label.className = "label sub";
    label.textContent = "Battery: ";
    td.appendChild(label);
    const span = document.createElement("span");
    span.className = "battery";
    if (d.battery !== null && d.battery !== undefined) {
      span.textContent = `${d.battery}%`;
      span.classList.toggle("low", d.battery <= LOW_BATTERY || d.battery_low === true);
    } else if (d.battery_low !== null && d.battery_low !== undefined) {
      span.textContent = d.battery_low ? "Low" : "OK";
      span.classList.toggle("low", d.battery_low);
    } else {
      span.textContent = "—";
      span.classList.add("muted");
      span.title = d.mains_powered ? "Mains powered" : "No battery reading";
    }
    if (d.battery_entity) {
      // The battery's own history, in Home Assistant's entity dialog.
      const a = document.createElement("a");
      a.href = "#";
      a.dataset.moreInfo = d.battery_entity;
      a.title = "Battery details";
      a.appendChild(span);
      td.appendChild(a);
    } else {
      td.appendChild(span);
    }
    return td;
  }

  _statusCell(d) {
    const td = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = `chip ${d.available ? "online" : "offline"}`;
    chip.textContent = d.available ? "Online" : "Offline";
    if (d.last_seen) chip.title = `Last seen ${new Date(d.last_seen).toLocaleString()}`;
    td.appendChild(chip);
    return td;
  }

  // -- events ---------------------------------------------------------

  _onClick(ev) {
    const path = ev.composedPath();
    const find = (key) => path.find((el) => el.dataset && el.dataset[key] !== undefined);

    const moreInfo = find("moreInfo");
    if (moreInfo) {
      ev.preventDefault();
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: moreInfo.dataset.moreInfo }, bubbles: true, composed: true,
      }));
      return;
    }
    const link = find("nav");
    if (link) {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return;
      ev.preventDefault();
      history.pushState(null, "", link.getAttribute("href"));
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    const action = find("action");
    if (action?.dataset.action === "menu") {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
      return;
    }
    if (action?.dataset.action === "toggle-groups") {
      this._toggleAll();
      return;
    }
    const view = find("view");
    if (view) {
      this._view = view.dataset.view;
      history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}#${this._view}`);
      this._render();
      return;
    }
    const sort = find("sort");
    if (sort) {
      this._setSort(sort.dataset.sort);
      return;
    }
    const group = find("groupToggle");
    if (group) this._toggleGroup(group.dataset.groupToggle);
  }

  _onKeyDown(ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const target = ev.composedPath()[0];
    if (target.matches?.("tr.group")) {
      ev.preventDefault();
      const group = target.dataset.groupToggle;
      this._toggleGroup(group);
      this.shadowRoot.querySelector(`tr.group[data-group-toggle="${CSS.escape(group)}"]`)?.focus();
    } else if (target.matches?.("th[data-sort]")) {
      ev.preventDefault();
      const key = target.dataset.sort;
      this._setSort(key);
      this.shadowRoot.querySelector(`th[data-sort="${CSS.escape(key)}"]`)?.focus();
    }
  }

  // The same column again reverses the order; a new one starts ascending.
  _setSort(key) {
    this._sort = this._sort.key === key ? { key, dir: -this._sort.dir } : { key, dir: 1 };
    this._saveViewState();
    this._render();
  }

  _toggleGroup(group) {
    if (this._collapsed.has(group)) this._collapsed.delete(group);
    else this._collapsed.add(group);
    this._saveCollapsed();
    this._render();
  }

  // Collapses every group shown, or expands them all when they all are.
  _toggleAll() {
    const groups = [...new Set(this._rows().map((r) => r.category))];
    const allCollapsed = groups.every((g) => this._collapsed.has(g));
    for (const g of groups) {
      if (allCollapsed) this._collapsed.delete(g);
      else this._collapsed.add(g);
    }
    this._saveCollapsed();
    this._render();
  }
}
