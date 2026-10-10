// WP Zigbee Orchestrator panel - the main element,
// <zigbee-orchestrator-panel>: the page buttons, the Devices and Groups
// pages, and the device picker for groups (see
// zigbee-orchestrator-panel.js for how the modules fit together).

const V = new URL(import.meta.url).search;
// The version loaded, from the ?v= every module is loaded with (panel.py).
const VERSION = new URLSearchParams(V).get("v") || "";
const {
  CATEGORIES, COLLAPSED_KEY, LOW_BATTERY, VIEW_STATE_KEY, WS,
  loadJSON, num, saveJSON, upgradeProperties,
} = await import(`./zo-util.js${V}`);
const { STYLE, TEMPLATE } = await import(`./zo-style.js${V}`);

const VIEWS = ["devices", "groups"];
// The Groups page's last heading: the devices in no group.
const UNGROUPED = "__ungrouped__";
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);

const text = (v) => String(v ?? "").toLocaleLowerCase();
const byText = (key) => (a, b) => text(a[key]).localeCompare(text(b[key]), undefined, { numeric: true });
// Devices with no battery reading sort after every reading, either way.
const byBattery = (a, b) => (a.battery ?? -1) - (b.battery ?? -1);
const byStatus = (a, b) => Number(b.available) - Number(a.available);
const byName = byText("name");

// Both pages' columns: key, heading, how it sorts, cell class.
const COLUMNS = [
  { key: "name", label: "Device name", compare: byName, cls: "name" },
  { key: "area", label: "Area", compare: byText("area") },
  { key: "manufacturer", label: "Manufacturer", compare: byText("manufacturer") },
  { key: "model", label: "Model", compare: byText("model") },
  { key: "battery", label: "Battery", compare: byBattery, cls: "num" },
  { key: "available", label: "Status", compare: byStatus },
];
const DEFAULT_SORT = { key: "name", dir: 1 };

// What each page's filter goes by.
function matches(d, words) {
  if (!words.length) return true;
  const hay = text([d.name, d.area, d.manufacturer, d.model, d.ieee].join(" "));
  return words.every((w) => hay.includes(w));
}
const wordsOf = (filter) => text(filter).split(/\s+/).filter(Boolean);

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
    this._groups = [];
    this._groupsLoaded = false;
    this._subs = {};
    // The open name/delete bar on the Groups page:
    // { mode: "create" | "rename" | "delete", group }.
    this._edit = null;
    // The group whose devices are being chosen, and the ticked devices.
    this._picking = null;
    // Each page's search, sort and collapsed groups, as left last time.
    const saved = loadJSON(VIEW_STATE_KEY, {});
    const collapsed = loadJSON(COLLAPSED_KEY, {});
    this._state = {};
    for (const view of VIEWS) {
      const was = saved[view] || {};
      this._state[view] = {
        filter: typeof was.filter === "string" ? was.filter : "",
        sort: COLUMNS.some((c) => c.key === was.sort?.key)
          ? { key: was.sort.key, dir: was.sort.dir === -1 ? -1 : 1 }
          : { ...DEFAULT_SORT },
        collapsed: new Set(Array.isArray(collapsed[view]) ? collapsed[view] : []),
      };
    }

    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this._el("version").textContent = VERSION ? `v${VERSION}` : "";
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKeyDown(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this._el("filter").addEventListener("input", (ev) => {
      this._st().filter = ev.target.value;
      this._saveViewState();
      this._render();
    });
    this._el("pick-filter").addEventListener("input", () => this._renderPicker());
    this._el("edit-name").addEventListener("input", () => { this._el("edit-error").textContent = ""; });
    this._el("picker").addEventListener("close", () => { this._picking = null; });
    this._onHash = () => this._applyHash();
    // "/" jumps to the filter from anywhere on the page (not while typing).
    this._onWindowKey = (ev) => {
      if (!this.isConnected || this.hidden || ev.defaultPrevented) return;
      const typing = ev.composedPath().some((el) => el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "/" && !this._picking) {
        ev.preventDefault();
        this._el("filter").focus();
      }
    };
  }

  set hass(hass) {
    this._hass = hass;
    if (this.isConnected) this._subscribeAll();
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
    if (this._hass) this._subscribeAll();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    window.removeEventListener("keydown", this._onWindowKey);
    for (const [key, sub] of Object.entries(this._subs)) {
      if (sub.unsub) sub.unsub();
      delete this._subs[key];
    }
  }

  _st(view = this._view) { return this._state[view]; }

  _applyHash() {
    const hash = window.location.hash.replace("#", "");
    const view = VIEWS.includes(hash) ? hash : this._view;
    if (view !== this._view || !this._rendered) this._setView(view, false);
  }

  _setView(view, updateHash = true) {
    if (!VIEWS.includes(view)) return;
    this._view = view;
    this._edit = null;
    if (updateHash) {
      history.replaceState(history.state, "", `${window.location.pathname}${window.location.search}#${view}`);
    }
    this._el("filter").value = this._st().filter;
    this._el("scroll").scrollTop = 0;
    this._render();
  }

  // -- data -----------------------------------------------------------

  _subscribeAll() {
    this._subscribe("devices", WS.DEVICES_SUBSCRIBE, (msg) => this._onDevices(msg));
    this._subscribe("groups", WS.GROUPS_SUBSCRIBE, (msg) => this._onGroups(msg));
  }

  async _subscribe(key, type, handler) {
    const sub = this._subs[key] || (this._subs[key] = {});
    if (sub.unsub || sub.subscribing || !this._hass?.connection) return;
    sub.subscribing = true;
    try {
      const unsub = await this._hass.connection.subscribeMessage(handler, { type });
      if (this.isConnected && this._subs[key] === sub) sub.unsub = unsub;
      else unsub();
    } catch (err) {
      this._error = err?.message || String(err);
      this._render();
    } finally {
      sub.subscribing = false;
    }
  }

  _onDevices(msg) {
    this._devices = Array.isArray(msg.devices) ? msg.devices : [];
    this._zhaRunning = msg.zha_running !== false;
    this._loaded = true;
    this._error = null;
    this._updated = new Date();
    this._render();
    if (this._picking) this._renderPicker();
  }

  _onGroups(msg) {
    this._groups = Array.isArray(msg.groups) ? msg.groups : [];
    this._groupsLoaded = true;
    // A group deleted elsewhere (another browser tab) closes what's open for it.
    const ids = new Set(this._groups.map((g) => g.id));
    if (this._edit?.group && !ids.has(this._edit.group.id)) this._edit = null;
    if (this._picking && !ids.has(this._picking.group.id)) this._el("picker").close();
    this._render();
    // Devices put in another group meanwhile (another browser tab) go.
    if (this._picking) this._renderPicker();
  }

  _saveViewState() {
    const saved = {};
    for (const view of VIEWS) saved[view] = { filter: this._st(view).filter, sort: this._st(view).sort };
    saveJSON(VIEW_STATE_KEY, saved);
  }

  _saveCollapsed() {
    const saved = {};
    for (const view of VIEWS) saved[view] = [...this._st(view).collapsed];
    saveJSON(COLLAPSED_KEY, saved);
  }

  async _call(message) {
    return this._hass.connection.sendMessagePromise(message);
  }

  // -- rendering ------------------------------------------------------

  // The current page's sorted rows of a section.
  _sorted(rows) {
    const { sort } = this._st();
    const col = COLUMNS.find((c) => c.key === sort.key) || COLUMNS[0];
    return rows.sort((a, b) =>
      sort.dir * col.compare(a, b) || byName(a, b) || String(a.ieee).localeCompare(String(b.ieee)));
  }

  // The current page's groups of rows: { key, label, cls, rows, group? }.
  // Devices: by category (offline apart), only those with devices. Groups:
  // every group by name (while filtering, only those with a match), then
  // Ungrouped - the devices in no group - when there are any.
  _sections() {
    const words = wordsOf(this._st().filter);
    if (this._view === "devices") {
      const shown = this._devices.filter((d) => matches(d, words));
      return CATEGORIES
        .map(([key, label]) => ({ key, label, cls: key, rows: this._sorted(shown.filter((d) => d.category === key)) }))
        .filter((s) => s.rows.length);
    }
    const byId = new Map(this._devices.map((d) => [d.id, d]));
    const grouped = new Set(this._groups.flatMap((g) => g.device_ids));
    const ungrouped = this._devices.filter((d) => !grouped.has(d.id));
    const rest = {
      key: UNGROUPED, label: "Ungrouped", cls: "ungrouped", ungrouped: true, total: ungrouped.length,
      rows: this._sorted(ungrouped.filter((d) => matches(d, words))),
    };
    const sections = this._groups
      .map((group) => {
        const members = group.device_ids.map((id) => byId.get(id)).filter(Boolean);
        return {
          key: group.id, label: group.name, cls: "user-group", group, total: members.length,
          rows: this._sorted(members.filter((d) => matches(d, words))),
        };
      })
      .filter((s) => !words.length || s.rows.length);
    if (rest.rows.length) sections.push(rest);
    return sections;
  }

  _render() {
    this._rendered = true;
    const isGroups = this._view === "groups";
    for (const btn of this.shadowRoot.querySelectorAll(".view")) {
      btn.classList.toggle("active", btn.dataset.view === this._view);
    }
    const offline = this._devices.filter((d) => !d.available).length;
    const count = this.shadowRoot.querySelector('[data-count="devices"]');
    count.textContent = this._loaded && offline ? num(offline) : "";
    count.classList.toggle("alert", offline > 0);
    count.title = `${offline} offline`;
    const groupCount = this.shadowRoot.querySelector('[data-count="groups"]');
    groupCount.textContent = this._groups.length ? num(this._groups.length) : "";
    groupCount.title = `${this._groups.length} groups`;
    this._renderSummary(offline);
    this._el("notice").hidden = !this._loaded || this._zhaRunning;
    this._el("hint").hidden = !isGroups;
    for (const el of this.shadowRoot.querySelectorAll("[data-only-view]")) {
      el.hidden = !el.dataset.onlyView.split(" ").includes(this._view);
    }
    this._el("filter").placeholder = isGroups
      ? "Filter the groups' devices by name, area, manufacturer or model"
      : "Filter by name, area, manufacturer or model";
    this._renderEditBar();

    const sections = this._sections();
    this._renderHead();
    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const { collapsed } = this._st();
    for (const section of sections) {
      const isCollapsed = collapsed.has(section.key);
      frag.appendChild(this._groupRow(section, isCollapsed));
      if (isCollapsed) continue;
      for (const d of section.rows) frag.appendChild(this._deviceRow(d, section.group, isGroups));
      if (section.group && !section.rows.length) frag.appendChild(this._emptyGroupRow(section.group));
    }
    body.appendChild(frag);

    const status = this._el("status");
    status.hidden = false;
    const filtering = wordsOf(this._st().filter).length > 0;
    if (this._error) status.textContent = `Couldn't load the devices: ${this._error}`;
    else if (!this._loaded || (isGroups && !this._groupsLoaded)) status.textContent = "Loading…";
    else if (isGroups && !this._groups.length) status.textContent = "No groups yet. Make one with New group, then choose its devices.";
    else if (!isGroups && !this._devices.length) status.textContent = "No Zigbee devices found. Is the ZHA integration set up?";
    else if (!sections.length && filtering) status.textContent = isGroups ? "No device in any group matches the filter." : "No devices match the filter.";
    else status.hidden = true;

    const keys = sections.map((s) => s.key);
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-groups"]');
    const allCollapsed = keys.length > 0 && keys.every((k) => collapsed.has(k));
    toggle.textContent = allCollapsed ? "Expand all" : "Collapse all";
    toggle.disabled = !keys.length;

    const footer = this._el("footer");
    if (!this._loaded) footer.textContent = "";
    else if (isGroups) {
      const inGroups = new Set(this._groups.flatMap((g) => g.device_ids)).size;
      footer.textContent = `${num(this._groups.length)} groups · ${num(inGroups)} of ${num(this._devices.length)} devices in at least one group`;
    } else {
      const shown = sections.reduce((n, s) => n + s.rows.length, 0);
      const devices = shown === this._devices.length
        ? `${num(shown)} devices`
        : `${num(shown)} of ${num(this._devices.length)} devices`;
      footer.textContent = `${devices} · updated ${this._updated.toLocaleTimeString()}`;
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
    const { sort } = this._st();
    for (const col of COLUMNS) {
      const th = document.createElement("th");
      th.className = `sortable ${col.cls === "num" ? "num" : ""}`;
      th.dataset.sort = col.key;
      th.tabIndex = 0;
      th.title = `Sort by ${col.label.toLowerCase()}`;
      const sorted = sort.key === col.key;
      th.setAttribute("aria-sort", sorted ? (sort.dir > 0 ? "ascending" : "descending") : "none");
      th.append(col.label);
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = sorted ? (sort.dir > 0 ? "▲" : "▼") : "";
      th.appendChild(arrow);
      head.appendChild(th);
    }
    if (this._view === "groups") {
      const th = document.createElement("th");
      th.className = "remove";
      th.setAttribute("aria-label", "Remove from group");
      head.appendChild(th);
    }
  }

  _groupRow(section, collapsed) {
    const tr = document.createElement("tr");
    tr.className = `group ${section.cls}`;
    tr.dataset.groupToggle = section.key;
    tr.tabIndex = 0;
    tr.setAttribute("aria-expanded", String(!collapsed));
    tr.title = collapsed ? "Show these devices (Enter)" : "Hide these devices (Enter)";
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length + (this._view === "groups" ? 1 : 0);
    const caret = document.createElement("span");
    caret.className = "caret";
    caret.textContent = collapsed ? "▸" : "▾";
    const count = document.createElement("span");
    count.className = "group-count";
    const filtered = (section.group || section.ungrouped) && section.rows.length !== section.total;
    count.textContent = filtered
      ? ` (${num(section.rows.length)} of ${num(section.total)})`
      : ` (${num(section.rows.length)})`;
    td.append(caret, section.group || section.ungrouped ? section.label : CATEGORY_LABELS[section.key], count);
    if (section.group) {
      for (const [action, label, title] of [
        ["choose-devices", "Choose devices", "Add devices to this group, or take them out"],
        ["rename-group", "Rename", "Rename this group"],
        ["ask-delete-group", "Delete", "Delete this group (its devices aren't affected)"],
      ]) {
        const btn = document.createElement("button");
        btn.className = `group-link${action === "ask-delete-group" ? " danger" : ""}`;
        btn.dataset.action = action;
        btn.dataset.group = section.key;
        btn.textContent = label;
        btn.title = title;
        td.appendChild(btn);
      }
    }
    tr.appendChild(td);
    return tr;
  }

  _emptyGroupRow(group) {
    const tr = document.createElement("tr");
    tr.className = "empty-group";
    const td = document.createElement("td");
    td.colSpan = COLUMNS.length + 1;
    td.className = "sub";
    td.append("No devices in this group yet. ");
    const btn = document.createElement("button");
    btn.className = "link-btn";
    btn.dataset.action = "choose-devices";
    btn.dataset.group = group.id;
    btn.textContent = "Choose devices";
    td.appendChild(btn);
    tr.appendChild(td);
    return tr;
  }

  // On the Groups page, a row has a last column: ✕ (take it out of the
  // group), or nothing under Ungrouped.
  _deviceRow(d, group, groupsPage = false) {
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
    if (group) {
      const td = document.createElement("td");
      td.className = "remove";
      const btn = document.createElement("button");
      btn.className = "icon-btn";
      btn.dataset.action = "remove-device";
      btn.dataset.group = group.id;
      btn.dataset.device = d.id;
      btn.textContent = "✕";
      btn.title = `Take ${d.name} out of ${group.name}`;
      btn.setAttribute("aria-label", btn.title);
      td.appendChild(btn);
      tr.appendChild(td);
    } else if (groupsPage) {
      const td = document.createElement("td");
      td.className = "remove";
      tr.appendChild(td);
    }
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

  // -- the Groups page's name and delete bar ---------------------------

  _renderEditBar() {
    const bar = this._el("edit-bar");
    const edit = this._view === "groups" ? this._edit : null;
    bar.classList.toggle("open", !!edit);
    bar.classList.toggle("danger", edit?.mode === "delete");
    if (!edit) return;
    const deleting = edit.mode === "delete";
    this._el("edit-name").hidden = deleting;
    this._el("edit-label").textContent = deleting
      ? `Delete the group ${edit.group.name}? Only the group goes: its devices aren't changed.`
      : edit.mode === "rename" ? `Rename ${edit.group.name}:` : "New group:";
    const save = this._el("edit-save");
    save.textContent = deleting ? "Delete group" : edit.mode === "rename" ? "Rename" : "Create";
    save.classList.toggle("danger", deleting);
  }

  _openEdit(mode, group = null) {
    this._edit = { mode, group };
    this._el("edit-error").textContent = "";
    const input = this._el("edit-name");
    input.value = mode === "rename" ? group.name : "";
    this._renderEditBar();
    if (mode === "delete") this._el("edit-save").focus();
    else {
      input.focus();
      input.select();
    }
  }

  _closeEdit() {
    this._edit = null;
    this._renderEditBar();
  }

  async _saveEdit() {
    const edit = this._edit;
    if (!edit) return;
    const name = this._el("edit-name").value;
    const save = this._el("edit-save");
    save.disabled = true;
    try {
      if (edit.mode === "create") {
        const group = await this._call({ type: WS.GROUPS_CREATE, name });
        this._closeEdit();
        // Straight on to choosing its devices.
        this._openPicker(group);
      } else if (edit.mode === "rename") {
        await this._call({ type: WS.GROUPS_RENAME, group_id: edit.group.id, name });
        this._closeEdit();
      } else {
        await this._call({ type: WS.GROUPS_DELETE, group_id: edit.group.id });
        this._st("groups").collapsed.delete(edit.group.id);
        this._saveCollapsed();
        this._closeEdit();
      }
    } catch (err) {
      this._el("edit-error").textContent = err?.message || String(err);
    } finally {
      save.disabled = false;
    }
  }

  // -- the device picker -----------------------------------------------

  _openPicker(group) {
    this._picking = { group, selected: new Set(group.device_ids) };
    this._el("pick-title").textContent = `Choose the devices in ${group.name}`;
    this._el("pick-filter").value = "";
    this._el("pick-error").textContent = "";
    this._renderPicker();
    const dialog = this._el("picker");
    if (!dialog.open) dialog.showModal();
    this._el("pick-filter").focus();
  }

  // Every device that isn't in another group (a device can be in only
  // one), by name, ticked when it's in this group; the filter only hides
  // devices, it doesn't untick them.
  _renderPicker() {
    if (!this._picking) return;
    const { group, selected } = this._picking;
    const taken = new Set(this._groups.filter((g) => g.id !== group.id).flatMap((g) => g.device_ids));
    for (const id of taken) selected.delete(id);
    const words = wordsOf(this._el("pick-filter").value);
    const list = this._el("pick-list");
    list.textContent = "";
    const frag = document.createDocumentFragment();
    const devices = [...this._devices].sort((a, b) => byName(a, b) || String(a.ieee).localeCompare(String(b.ieee)));
    let shown = 0;
    const free = devices.filter((d) => !taken.has(d.id));
    for (const d of free) {
      if (!matches(d, words)) continue;
      shown += 1;
      const label = document.createElement("label");
      label.className = "pick-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.dataset.pick = d.id;
      cb.checked = selected.has(d.id);
      const name = document.createElement("span");
      name.className = "pick-name";
      name.textContent = d.name;
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = [d.area, d.manufacturer, d.model].filter(Boolean).join(" · ");
      const info = document.createElement("span");
      info.className = "pick-info";
      info.append(name, sub);
      label.append(cb, info);
      if (!d.available) {
        const chip = document.createElement("span");
        chip.className = "chip offline";
        chip.textContent = "Offline";
        label.appendChild(chip);
      }
      frag.appendChild(label);
    }
    list.appendChild(frag);
    if (!shown) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = !this._devices.length ? "No Zigbee devices found."
        : !free.length ? "Every device is already in another group. Take devices out of their group to add them here."
          : "No devices match the filter.";
      list.appendChild(empty);
    }
    this._el("pick-count").textContent = `${num(selected.size)} selected`;
    this._el("pick-taken").textContent = taken.size
      ? `${num(taken.size)} ${taken.size === 1 ? "device is" : "devices are"} already in another group and not listed: a device can be in only one group.`
      : "";
  }

  async _savePicker() {
    if (!this._picking) return;
    const { group, selected } = this._picking;
    const save = this._el("pick-save");
    save.disabled = true;
    try {
      await this._call({ type: WS.GROUPS_SET_DEVICES, group_id: group.id, device_ids: [...selected] });
      this._st("groups").collapsed.delete(group.id);
      this._saveCollapsed();
      this._el("picker").close();
    } catch (err) {
      this._el("pick-error").textContent = err?.message || String(err);
    } finally {
      save.disabled = false;
    }
  }

  // -- events ---------------------------------------------------------

  _group(id) { return this._groups.find((g) => g.id === id); }

  async _onClick(ev) {
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
    const actionEl = find("action");
    if (actionEl) {
      const group = actionEl.dataset.group ? this._group(actionEl.dataset.group) : null;
      switch (actionEl.dataset.action) {
        case "menu":
          this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
          return;
        case "toggle-groups":
          this._toggleAll();
          return;
        case "new-group":
          this._openEdit("create");
          return;
        case "rename-group":
          if (group) this._openEdit("rename", group);
          return;
        case "ask-delete-group":
          if (group) this._openEdit("delete", group);
          return;
        case "edit-save":
          this._saveEdit();
          return;
        case "edit-cancel":
          this._closeEdit();
          return;
        case "choose-devices":
          if (group) this._openPicker(group);
          return;
        case "remove-device":
          if (group) {
            try {
              await this._call({ type: WS.GROUPS_REMOVE_DEVICES, group_id: group.id, device_ids: [actionEl.dataset.device] });
            } catch (err) {
              this._error = err?.message || String(err);
              this._render();
            }
          }
          return;
        case "pick-all":
        case "pick-none": {
          const all = actionEl.dataset.action === "pick-all";
          for (const cb of this._el("pick-list").querySelectorAll("input[data-pick]")) {
            if (all) this._picking.selected.add(cb.dataset.pick);
            else this._picking.selected.delete(cb.dataset.pick);
          }
          this._renderPicker();
          return;
        }
        case "pick-save":
          this._savePicker();
          return;
        case "pick-cancel":
          this._el("picker").close();
          return;
        default:
          return;
      }
    }
    const view = find("view");
    if (view) {
      this._setView(view.dataset.view);
      return;
    }
    const sort = find("sort");
    if (sort) {
      this._setSort(sort.dataset.sort);
      return;
    }
    const groupRow = find("groupToggle");
    if (groupRow) this._toggleGroup(groupRow.dataset.groupToggle);
  }

  _onChange(ev) {
    const cb = ev.composedPath()[0];
    if (cb.dataset?.pick === undefined || !this._picking) return;
    if (cb.checked) this._picking.selected.add(cb.dataset.pick);
    else this._picking.selected.delete(cb.dataset.pick);
    this._el("pick-count").textContent = `${num(this._picking.selected.size)} selected`;
  }

  _onKeyDown(ev) {
    const target = ev.composedPath()[0];
    if (target === this._el("edit-name")) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._saveEdit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        this._closeEdit();
      }
      return;
    }
    if (ev.key !== "Enter" && ev.key !== " ") return;
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
    const st = this._st();
    st.sort = st.sort.key === key ? { key, dir: -st.sort.dir } : { key, dir: 1 };
    this._saveViewState();
    this._render();
  }

  _toggleGroup(key) {
    const { collapsed } = this._st();
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    this._saveCollapsed();
    this._render();
  }

  // Collapses every group shown, or expands them all when they all are.
  _toggleAll() {
    const { collapsed } = this._st();
    const keys = this._sections().map((s) => s.key);
    const allCollapsed = keys.every((k) => collapsed.has(k));
    for (const k of keys) {
      if (allCollapsed) collapsed.delete(k);
      else collapsed.add(k);
    }
    this._saveCollapsed();
    this._render();
  }
}
