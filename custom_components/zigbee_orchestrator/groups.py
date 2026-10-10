"""Device groups, made on the panel's Groups page.

A group is just a name and a list of devices (device registry ids), for
finding and viewing devices easily. They have nothing to do with ZHA's own
Zigbee groups: nothing is sent to the devices or the Zigbee network. A
device can be in only one group: adding it to a group it isn't in fails
while it's in another (the panel only offers the devices in no group).
They're kept in Home Assistant's storage
(.storage/zigbee_orchestrator.groups).
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any
import uuid

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store

STORAGE_KEY = "zigbee_orchestrator.groups"
STORAGE_VERSION = 1
NAME_MAX = 100


class GroupError(ValueError):
    """A change that can't be made (no such group, a name that's taken)."""


class GroupStore:
    """The groups, saved on every change, with listeners for the panel."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._groups: dict[str, dict[str, Any]] = {}
        self._listeners: list[Callable[[], None]] = []

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        for group in data.get("groups", []):
            if isinstance(group, dict) and group.get("id") and group.get("name"):
                self._groups[group["id"]] = {
                    "id": group["id"],
                    "name": str(group["name"]),
                    "device_ids": list(dict.fromkeys(str(d) for d in group.get("device_ids", []))),
                }
        # Groups saved before a device could be in only one (0.2.0): each
        # device stays in the first of its groups by name.
        seen: set[str] = set()
        for group in self.groups:
            kept = [d for d in group["device_ids"] if d not in seen]
            seen.update(kept)
            self._groups[group["id"]]["device_ids"] = kept

    @property
    def groups(self) -> list[dict[str, Any]]:
        """Every group, by name."""
        return sorted(
            ({**g, "device_ids": list(g["device_ids"])} for g in self._groups.values()),
            key=lambda g: (g["name"].casefold(), g["id"]),
        )

    @callback
    def async_subscribe(self, listener: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(listener)
        return lambda: self._listeners.remove(listener)

    def _name(self, name: str, group_id: str | None = None) -> str:
        name = " ".join(str(name).split())
        if not name:
            raise GroupError("A group needs a name")
        if len(name) > NAME_MAX:
            raise GroupError(f"A group's name can be at most {NAME_MAX} characters")
        for other in self._groups.values():
            if other["id"] != group_id and other["name"].casefold() == name.casefold():
                raise GroupError(f"There's already a group called {other['name']}")
        return name

    def _get(self, group_id: str) -> dict[str, Any]:
        if (group := self._groups.get(group_id)) is None:
            raise GroupError("No such group")
        return group

    def _check_free(self, device_ids: list[str], group_id: str | None = None) -> None:
        """Fails if any of the devices is in a group other than group_id."""
        wanted = set(device_ids)
        for other in self._groups.values():
            if other["id"] != group_id and wanted.intersection(other["device_ids"]):
                raise GroupError(
                    f"A device can be in only one group, and some of these are "
                    f"already in {other['name']}"
                )

    @callback
    def _changed(self) -> None:
        self._store.async_delay_save(
            lambda: {"groups": list(self._groups.values())}, 1
        )
        for listener in list(self._listeners):
            listener()

    @callback
    def async_create(self, name: str, device_ids: list[str] | None = None) -> dict[str, Any]:
        self._check_free(device_ids or [])
        group = {
            "id": uuid.uuid4().hex,
            "name": self._name(name),
            "device_ids": list(dict.fromkeys(device_ids or [])),
        }
        self._groups[group["id"]] = group
        self._changed()
        return dict(group)

    @callback
    def async_rename(self, group_id: str, name: str) -> None:
        group = self._get(group_id)
        group["name"] = self._name(name, group_id)
        self._changed()

    @callback
    def async_delete(self, group_id: str) -> None:
        self._get(group_id)
        del self._groups[group_id]
        self._changed()

    @callback
    def async_set_devices(self, group_id: str, device_ids: list[str]) -> None:
        group = self._get(group_id)
        self._check_free(device_ids, group_id)
        group["device_ids"] = list(dict.fromkeys(device_ids))
        self._changed()

    @callback
    def async_add_devices(self, group_id: str, device_ids: list[str]) -> None:
        group = self._get(group_id)
        self._check_free(device_ids, group_id)
        group["device_ids"] = list(dict.fromkeys([*group["device_ids"], *device_ids]))
        self._changed()

    @callback
    def async_remove_devices(self, group_id: str, device_ids: list[str]) -> None:
        group = self._get(group_id)
        group["device_ids"] = [d for d in group["device_ids"] if d not in set(device_ids)]
        self._changed()

    @callback
    def async_forget_device(self, device_id: str) -> None:
        """Takes a device removed from Home Assistant out of its group."""
        changed = False
        for group in self._groups.values():
            if device_id in group["device_ids"]:
                group["device_ids"].remove(device_id)
                changed = True
        if changed:
            self._changed()
