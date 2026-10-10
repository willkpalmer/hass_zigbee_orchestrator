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
