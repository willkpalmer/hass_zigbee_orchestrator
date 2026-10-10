"""The WP Zigbee Orchestrator integration.

Adds a sidebar panel for viewing and managing the Zigbee devices of the
ZHA integration. Its first page lists every ZHA device, grouped by its role
on the network (coordinator, routers, end devices) with the offline ones
apart, kept up to date live (see devices.py and websocket_api.py).
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .panel import async_register_panel, async_remove_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up WP Zigbee Orchestrator from a config entry."""
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = True
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a WP Zigbee Orchestrator config entry."""
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    async_remove_panel(hass)
    return True
