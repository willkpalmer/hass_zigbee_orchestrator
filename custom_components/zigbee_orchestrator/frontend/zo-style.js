// WP Zigbee Orchestrator panel - the page's styles and markup (see
// zigbee-orchestrator-panel.js for how the modules fit together). The look
// is WP Log Doctor's.

export const STYLE = `
:host {
  /* Fills the window; only the list scrolls, so everything above it and
     the column headings stay in view. */
  display: flex; flex-direction: column;
  height: 100vh; height: 100dvh;
  background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121);
  font-family: var(--paper-font-body1_-_font-family, var(--ha-font-family-body, Roboto, sans-serif));
  font-size: 14px;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.header {
  display: flex; align-items: center; gap: 8px;
  height: var(--header-height, 56px); padding: 0 16px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff);
  flex: none;
}
.header h1 { font-size: 20px; font-weight: 400; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.header .version { font-size: 13px; opacity: 0.8; margin-left: 4px; }
.header .summary { font-size: 13px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 55%; }
.header .summary .warn { font-weight: 600; }
.menu-btn { display: none; background: none; border: 0; color: inherit; font-size: 22px; cursor: pointer; padding: 4px 8px; }
:host([narrow]) .menu-btn { display: inline-block; }
.content {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
  width: 100%; max-width: 1400px; margin: 0 auto; padding: 16px;
}
.views { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; flex: none; }
.view {
  font: inherit; font-weight: 500; padding: 8px 16px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
}
.view.active { background: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
/* Offline devices, on the page button: red when there are any. */
.view .count {
  display: inline-block; min-width: 20px; margin-left: 4px; padding: 0 6px; border-radius: 10px;
  font-size: 12px; font-weight: 600; line-height: 18px; text-align: center;
  background: rgba(127, 127, 127, 0.18); color: inherit;
}
.view .count:empty { display: none; }
.view .count.alert { background: var(--error-color, #db4437); color: #fff; }
.view.active .count:not(.alert) { background: rgba(255, 255, 255, 0.3); }
.view:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: -2px; }
.card {
  background: var(--card-background-color, #fff);
  border-radius: var(--ha-card-border-radius, 12px);
  border: 1px solid var(--divider-color, #e0e0e0);
  overflow: hidden;
  flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.card > .toolbar, .card > .notice, .card > .footer { flex: none; }
/* When ZHA isn't running. */
.notice {
  padding: 10px 16px; background: rgba(255, 152, 0, 0.14);
  border-bottom: 1px solid var(--divider-color, #e0e0e0);
}
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; }
.toolbar input[type=search] {
  font: inherit; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--divider-color, #ccc);
  background: var(--secondary-background-color, #f5f5f5); color: inherit;
  flex: 1 1 220px; min-width: 160px;
}
.spacer { flex: 1 1 auto; }
.action {
  font: inherit; font-weight: 500; padding: 8px 14px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--primary-color, #03a9f4); background: var(--primary-color, #03a9f4);
  color: var(--text-primary-color, #fff);
}
.action.secondary { background: transparent; color: var(--primary-color, #03a9f4); }
.action:disabled { opacity: 0.4; cursor: default; }
.table-wrap { flex: 0 1 auto; min-height: 0; overflow: auto; }
thead th {
  position: sticky; top: 0; z-index: 1;
  background: var(--card-background-color, #fff);
  box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
}
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th, td { text-align: left; padding: 8px 12px; border-top: 1px solid var(--divider-color, #e0e0e0); vertical-align: top; }
th { font-weight: 500; color: var(--secondary-text-color, #727272); white-space: nowrap; user-select: none; }
th.sortable { cursor: pointer; }
th.sortable:hover { color: var(--primary-text-color, #212121); }
th .arrow { display: inline-block; width: 1em; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
th.num { text-align: right; }
td.name { min-width: 200px; word-break: break-word; }
tbody tr.row:hover { background: var(--secondary-background-color, rgba(0,0,0,0.03)); }
tbody tr.group:focus { outline: none; }
tbody tr.group:focus-visible { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: -2px; }
tbody tr.group td {
  background: var(--secondary-background-color, #f5f5f5); font-weight: 500; padding: 6px 12px;
}
tbody tr.group { cursor: pointer; user-select: none; }
tbody tr.group .caret { display: inline-block; width: 1.2em; color: var(--secondary-text-color, #727272); }
tbody tr.group .group-count { font-weight: 400; color: var(--secondary-text-color, #727272); }
tbody tr.group.offline td { color: var(--error-color, #db4437); }
tbody tr.group.ungrouped td { color: var(--secondary-text-color, #727272); }
tbody tr.row.disabled td { opacity: 0.6; }
a { color: var(--primary-color, #03a9f4); text-decoration: none; }
a:hover { text-decoration: underline; }
.sub { color: var(--secondary-text-color, #727272); font-size: 12px; }
.muted { color: var(--secondary-text-color, #727272); }
.chip {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  padding: 1px 7px; border-radius: 10px; margin-right: 6px; text-transform: uppercase; white-space: nowrap;
}
.chip.online { background: rgba(76, 175, 80, 0.15); color: var(--success-color, #43a047); }
.chip.offline { background: rgba(219, 68, 55, 0.15); color: var(--error-color, #db4437); }
.chip.disabled { background: rgba(127, 127, 127, 0.15); color: var(--secondary-text-color, #727272); }
.battery.low { color: var(--error-color, #db4437); font-weight: 600; }
.empty, .status { padding: 32px 16px; text-align: center; color: var(--secondary-text-color, #727272); }
.footer { padding: 8px 16px 12px; color: var(--secondary-text-color, #727272); font-size: 12px; }
.label { display: none; }

/* The Groups page. */
.hint { padding: 0 16px 10px; color: var(--secondary-text-color, #727272); font-size: 12px; flex: none; }
tbody tr.group .group-link {
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1.5; white-space: nowrap; cursor: pointer;
  margin-left: 12px; padding: 1px 8px; border-radius: 10px;
  border: 1px solid var(--primary-color, #03a9f4); background: none; color: var(--primary-color, #03a9f4);
}
tbody tr.group .group-link + .group-link { margin-left: 6px; }
tbody tr.group .group-link:hover { background: rgba(3, 169, 244, 0.1); }
tbody tr.group .group-link.danger { color: var(--error-color, #db4437); border-color: var(--error-color, #db4437); }
tbody tr.group .group-link.danger:hover { background: rgba(219, 68, 55, 0.12); }
td.remove, th.remove { width: 40px; text-align: center; padding-left: 0; padding-right: 8px; }
.icon-btn {
  background: none; border: 0; cursor: pointer; font-size: 14px; line-height: 1; padding: 4px 6px; border-radius: 50%;
  color: var(--secondary-text-color, #727272);
}
.icon-btn:hover { color: var(--error-color, #db4437); background: rgba(219, 68, 55, 0.1); }
.link-btn { font: inherit; background: none; border: 0; padding: 0; cursor: pointer; color: var(--primary-color, #03a9f4); }
.link-btn:hover { text-decoration: underline; }
tr.empty-group td { padding: 10px 12px 10px 36px; }
/* New group / Rename / Delete, under the toolbar. */
.edit-bar {
  display: none; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px; flex: none;
  background: rgba(3, 169, 244, 0.08); border-top: 1px solid var(--divider-color, #e0e0e0);
}
.edit-bar.open { display: flex; }
.edit-bar.danger { background: rgba(219, 68, 55, 0.1); }
.edit-bar input {
  font: inherit; padding: 8px 10px; border-radius: 6px; flex: 1 1 220px; min-width: 160px;
  border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: inherit;
}
.edit-bar .error, .picker .error { color: var(--error-color, #db4437); flex-basis: 100%; }
.edit-bar .error:empty, .picker .error:empty { display: none; }
.action.danger { border-color: var(--error-color, #db4437); background: var(--error-color, #db4437); }
/* Choose devices. */
.picker {
  width: min(640px, calc(100vw - 32px)); max-height: min(80vh, 760px); padding: 0;
  border: 1px solid var(--divider-color, #e0e0e0); border-radius: var(--ha-card-border-radius, 12px);
  background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
}
.picker[open] { display: flex; flex-direction: column; }
.picker::backdrop { background: rgba(0, 0, 0, 0.4); }
.picker h2 { font-size: 18px; font-weight: 500; margin: 0; padding: 16px 16px 4px; }
.picker .toolbar { padding: 8px 16px; }
.pick-list { flex: 1 1 auto; min-height: 0; overflow: auto; border-top: 1px solid var(--divider-color, #e0e0e0); border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.pick-row { display: flex; align-items: center; gap: 12px; padding: 8px 16px; cursor: pointer; }
.pick-row:hover { background: var(--secondary-background-color, #f5f5f5); }
.pick-row + .pick-row { border-top: 1px solid var(--divider-color, #e0e0e0); }
.pick-info { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.pick-name { word-break: break-word; }
.picker .buttons { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 16px; }
input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color, #03a9f4); flex: none; }

/* Phones: one card per device; the column headers become sort buttons. */
@media (max-width: 700px) {
  .content { padding: 8px; }
  table, thead, tbody { display: block; }
  thead tr {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px;
    padding: 6px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  thead {
    position: sticky; top: 0; z-index: 1; background: var(--card-background-color, #fff);
    box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
  }
  thead th { border: 0; padding: 6px 2px; position: static; box-shadow: none; }
  th.num { text-align: left; }
  tbody tr.row {
    display: grid; grid-template-columns: 1fr; row-gap: 3px;
    padding: 10px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  tbody tr.row td { border: 0; padding: 0; min-width: 0; text-align: left; }
  tbody tr.row td.num { font-size: 12px; color: var(--secondary-text-color, #727272); }
  tbody tr.row td:empty { display: none; }
  tbody tr.group { display: flex; align-items: center; }
  tbody tr.group td { display: block; flex: 1 1 auto; min-width: 0; line-height: 2; }
  tbody tr.row td.remove { position: absolute; right: 8px; top: 8px; width: auto; }
  tbody tr.row { position: relative; }
  tr.empty-group { display: block; }
  tr.empty-group td { display: block; border: 0; padding: 4px 12px 10px; }
  thead th.remove { display: none; }
  .label { display: inline; }
  .header .summary { max-width: 45%; font-size: 12px; }
}

/* Too short for a fixed top part (e.g. a phone held sideways): the whole
   page scrolls instead. */
@media (max-height: 520px) {
  :host { height: auto; min-height: 100vh; display: block; }
  .content, .card { display: block; }
  .table-wrap { overflow: visible; overflow-x: auto; }
  thead, thead th { position: static; }
}
`;

export const TEMPLATE = `
<div class="header">
  <button class="menu-btn" title="Menu" aria-label="Menu" data-action="menu">&#9776;</button>
  <h1>Zigbee Orchestrator <span class="version" data-el="version"></span></h1>
  <span class="summary" data-el="summary"></span>
</div>
<div class="content">
  <nav class="views" aria-label="Pages">
    <button class="view" data-view="devices">Devices<span class="count" data-count="devices"></span></button>
    <button class="view" data-view="groups">Groups<span class="count" data-count="groups"></span></button>
  </nav>
  <div class="card" data-el="devices-card">
    <div class="notice" data-el="notice" hidden>
      ZHA isn't running, so every device is shown as offline and their roles on the network aren't known.
    </div>
    <div class="toolbar">
      <input type="search" data-el="filter" aria-label="Filter" placeholder="Filter by name, area, manufacturer or model" title="Filter (press / to jump here)">
      <span class="spacer"></span>
      <button class="action secondary" data-action="toggle-groups" title="Collapse or expand every group">Collapse all</button>
      <button class="action" data-action="new-group" data-only-view="groups" title="Make a group of devices, to find them easily">New group</button>
    </div>
    <div class="hint" data-el="hint" hidden>
      Groups here are only for finding and viewing devices. They aren't Zigbee groups: making or changing them
      doesn't change anything in ZHA or on the devices, and a device can be in any number of them.
    </div>
    <div class="edit-bar" data-el="edit-bar">
      <span data-el="edit-label"></span>
      <input type="text" data-el="edit-name" maxlength="100" aria-label="Group name" placeholder="Group name, e.g. Upstairs sensors">
      <button class="action secondary" data-action="edit-cancel">Cancel</button>
      <button class="action" data-action="edit-save" data-el="edit-save">Create</button>
      <span class="error" data-el="edit-error" role="alert"></span>
    </div>
    <div class="table-wrap" data-el="scroll">
      <table>
        <thead><tr data-el="head"></tr></thead>
        <tbody data-el="body"></tbody>
      </table>
      <div class="status" data-el="status">Loading…</div>
    </div>
    <div class="footer" data-el="footer"></div>
  </div>
</div>
<dialog class="picker" data-el="picker" aria-labelledby="pick-title">
  <h2 id="pick-title" data-el="pick-title"></h2>
  <div class="toolbar">
    <input type="search" data-el="pick-filter" aria-label="Filter devices" placeholder="Filter by name, area, manufacturer or model">
    <button class="action secondary" data-action="pick-all" title="Tick every device shown">Select shown</button>
    <button class="action secondary" data-action="pick-none" title="Untick every device shown">Clear shown</button>
  </div>
  <div class="pick-list" data-el="pick-list"></div>
  <div class="buttons">
    <span class="sub" data-el="pick-count"></span>
    <span class="spacer"></span>
    <span class="error" data-el="pick-error" role="alert"></span>
    <button class="action secondary" data-action="pick-cancel">Cancel</button>
    <button class="action" data-action="pick-save" data-el="pick-save">Save</button>
  </div>
</dialog>
`;
