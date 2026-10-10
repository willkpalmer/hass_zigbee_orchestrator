# Zigbee Orchestrator

A Home Assistant custom integration for viewing and managing the Zigbee
devices of the [ZHA](https://www.home-assistant.io/integrations/zha/)
integration, from its own **Zigbee Orchestrator** page in the sidebar. It
looks like [WP Log Doctor](https://github.com/willkpalmer/hass_logdoctor).

## Devices

Every Zigbee device ZHA knows about, grouped by its role on the network:

- **Coordinator** - the Zigbee radio itself
- **Routers** - mains-powered devices that relay messages for others
- **End devices** - mostly battery-powered sensors, buttons and remotes
- **Offline** - every device ZHA currently considers unavailable, whatever
  its role

Each group can be collapsed (click its heading, or press Enter on it); the
groups you've collapsed are remembered in your browser. Within a group,
devices are sorted by name - click a column heading to sort by it instead.

| Column | |
|---|---|
| Device name | The name you gave the device, or ZHA's. Opens the device's page. |
| Area | The device's area. |
| Manufacturer, Model | As ZHA reports them. |
| Battery | The battery level, from the device's battery sensor (red at 20% or below), or Low/OK for devices that only report a low battery. Opens the battery's history. "—" for mains-powered devices. |
| Status | Online or Offline; hover for when ZHA last heard from it. |

The list updates live: devices going offline or coming back, new battery
readings, renames and area changes appear straight away. The filter box
(press `/` to jump to it) narrows the list by name, area, manufacturer,
model or IEEE address.

If ZHA isn't running, the devices it registered are still listed, all
offline, with a note at the top.

## Groups

Your own groups of devices, purely for finding and viewing them easily -
for example "Upstairs sensors" or "Garden lights".

**These are not Zigbee groups.** They're separate from the groups on
ZHA's own configuration page: making or changing them sends nothing to the
devices and changes nothing in ZHA, and deleting a group never touches
its devices. A device can be in only one group.

- **New group** - name it, then tick its devices in the list of every
  Zigbee device that isn't already in a group (filterable).
- **Choose devices** on a group's heading - tick or untick devices.
  Devices already in another group aren't listed: take a device out of
  its group first to move it.
- **✕** on a device's row - take it out of that group.
- **Rename** and **Delete** on a group's heading.

Each group is listed with the same columns as the Devices page, sorted by
name, and can be collapsed like the Devices page's groups. Every device
that isn't in any group is listed last, under **Ungrouped**.

Ungrouped devices can be ticked (or all of them at once, with the box on
the Ungrouped heading). Then either pick a group and **Add to group**, or
**New group with these** to name a new group made of them. The filter box
narrows every group to the devices that match. Groups are kept in Home
Assistant's storage (`.storage/zigbee_orchestrator.groups`), and a device
removed from Home Assistant leaves its groups by itself.

## Installation

### HACS

1. HACS → ⋮ → **Custom repositories** → add
   `https://github.com/willkpalmer/hass_zigbee_orchestrator` as an
   **Integration**.
2. Install **WP Zigbee Orchestrator** and restart Home Assistant.
3. **Settings → Devices & services → Add integration → WP Zigbee
   Orchestrator**.

### Manually

Copy `custom_components/zigbee_orchestrator` into your Home Assistant
`config/custom_components/` folder, restart, and add the integration as
above.

The page is in the sidebar for administrators only.

## Development

```sh
pip install -r requirements_test.txt
pytest
```

The panel is plain JavaScript modules in
`custom_components/zigbee_orchestrator/frontend/`, with no build step.
The icon is drawn by `scripts/generate_icon.py`.
