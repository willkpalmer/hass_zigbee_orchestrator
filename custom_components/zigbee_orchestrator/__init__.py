"""The WP Zigbee Orchestrator integration.

Adds a sidebar panel for viewing and managing the Zigbee devices of the
ZHA integration. Its Devices page lists every ZHA device, grouped by its
role on the network (coordinator, routers, end devices) with the offline
ones apart, kept up to date live (see devices.py and websocket_api.py).
Its Groups page lists the device groups made there, for finding devices
easily - nothing to do with ZHA's own Zigbee groups (see groups.py).
Devices that are deliberately offline can be put in maintenance, which
lists them apart (see maintenance.py).
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import device_registry as dr

from .const import DATA_GROUPS, DATA_MAINTENANCE, DOMAIN
from .groups import GroupStore
from .maintenance import MaintenanceStore
from .panel import async_register_panel, async_remove_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up WP Zigbee Orchestrator from a config entry."""
    # Kept across reloads, so the panel's subscriptions stay live.
    if (groups := hass.data.get(DATA_GROUPS)) is None:
        groups = GroupStore(hass)
        await groups.async_load()
        hass.data[DATA_GROUPS] = groups
    if (maintenance := hass.data.get(DATA_MAINTENANCE)) is None:
        maintenance = MaintenanceStore(hass)
        await maintenance.async_load()
        hass.data[DATA_MAINTENANCE] = maintenance

    @callback
    def _device_removed(event: Event) -> None:
        if event.data.get("action") == "remove":
            groups.async_forget_device(event.data["device_id"])
            maintenance.async_forget_device(event.data["device_id"])

    entry.async_on_unload(
        hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, _device_removed)
    )
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = True
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a WP Zigbee Orchestrator config entry."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    async_remove_panel(hass)
    return True
