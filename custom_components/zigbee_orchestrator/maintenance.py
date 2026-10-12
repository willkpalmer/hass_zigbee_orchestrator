"""Devices in maintenance: deliberately offline (unplugged, batteries out,
moved for a while), marked on the panel's Devices page.

A device in maintenance is listed under Maintenance rather than with the
others, and isn't counted as offline, until it's taken out of maintenance
again - which only happens when you do it, even once the device is back
online. The devices are kept in Home Assistant's storage
(.storage/zigbee_orchestrator.maintenance).
"""
from __future__ import annotations

from collections.abc import Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

STORAGE_KEY = "zigbee_orchestrator.maintenance"
STORAGE_VERSION = 1


class MaintenanceStore:
    """The device registry ids of the devices in maintenance."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, list[str]]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._devices: list[str] = []
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self._devices = list(dict.fromkeys(str(d) for d in data.get("device_ids", [])))

    @property
    def device_ids(self) -> set[str]:
        return set(self._devices)

    @callback
    def async_subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    @callback
    def async_set(self, device_ids: list[str], maintenance: bool) -> None:
        """Puts the devices in maintenance, or takes them out of it."""
        if maintenance:
            devices = list(dict.fromkeys([*self._devices, *device_ids]))
        else:
            devices = [d for d in self._devices if d not in set(device_ids)]
        if devices != self._devices:
            self._devices = devices
            self._changed()

    @callback
    def async_forget_device(self, device_id: str) -> None:
        """Takes a device removed from Home Assistant out of maintenance."""
        self.async_set([device_id], False)

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(lambda: {"device_ids": list(self._devices)}, 1)
        for listener in list(self._listeners):
            listener()
