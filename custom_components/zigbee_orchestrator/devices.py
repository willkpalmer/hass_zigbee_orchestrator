"""The Zigbee devices of the ZHA integration, as the panel lists them.

Each device comes from Home Assistant's device registry (every device ZHA
registers carries a ("zha", <IEEE address>) identifier), with its name,
area, manufacturer and model as shown on the device's own page, and its
battery level from its battery sensor. What only ZHA knows - the device's
role on the network (coordinator, router or end device), whether it's
online, its signal, and which router or coordinator an end device is
connected to - comes from ZHA's running gateway (see zha_network). When
ZHA isn't running, every device is listed as offline.

Each device is put in one category, which the panel groups by: offline
devices are kept apart from the rest, whatever their role.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import logging
from typing import Any

from homeassistant.const import STATE_ON, STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import ROLE_COORDINATOR, ROLE_END_DEVICE, ROLE_ROUTER, ROLE_UNKNOWN, ZHA_DOMAIN

_LOGGER = logging.getLogger(__name__)

CATEGORY_OFFLINE = "offline"

# ZHA's logical device types (zigpy's LogicalType names).
_ROLES = {
    "Coordinator": ROLE_COORDINATOR,
    "Router": ROLE_ROUTER,
    "EndDevice": ROLE_END_DEVICE,
}

_BATTERY = "battery"


@dataclass(frozen=True)
class ZhaDevice:
    """What ZHA's gateway knows about a device."""

    role: str
    available: bool
    # Link quality (0-255) and signal strength (dBm) of the last message
    # heard from the device.
    lqi: int | None = None
    rssi: int | None = None
    # When the device was last heard from, as a Unix time.
    last_seen: float | None = None
    mains_powered: bool | None = None
    # An end device's parent: the router or coordinator it's connected to
    # (its device registry id), as of ZHA's last topology scan.
    parent_id: str | None = None


def role_of(device_type: str | None, is_active_coordinator: bool = False) -> str:
    """The role for ZHA's logical device type ("Router", "EndDevice", ...)."""
    if is_active_coordinator:
        return ROLE_COORDINATOR
    return _ROLES.get(device_type or "", ROLE_UNKNOWN)


@callback
def zha_network(hass: HomeAssistant) -> dict[str, ZhaDevice] | None:
    """ZHA's devices by device registry id, or None if ZHA isn't running.

    This reads ZHA's gateway, which isn't a public interface: anything
    missing from it is left out rather than failing the whole list.
    """
    if ZHA_DOMAIN not in hass.config.components:
        return None
    try:
        from homeassistant.components.zha.helpers import get_zha_gateway_proxy

        gateway_proxy = get_zha_gateway_proxy(hass)
    except Exception:  # noqa: BLE001 - not set up, or a ZHA without the helper
        return None

    proxies: list[tuple[str, Any]] = []
    ids_by_ieee: dict[str, str] = {}
    for proxy in list(getattr(gateway_proxy, "device_proxies", {}).values()):
        try:
            device_id = proxy.device_id
            device = proxy.device
        except AttributeError:  # not in the device registry yet
            continue
        proxies.append((device_id, device))
        ids_by_ieee[str(getattr(device, "ieee", "")).lower()] = device_id
    parents = _parents(gateway_proxy)

    network: dict[str, ZhaDevice] = {}
    for device_id, device in proxies:
        try:
            parent_ieee = parents.get(str(getattr(device, "ieee", "")).lower())
            network[device_id] = ZhaDevice(
                role=role_of(
                    getattr(device, "device_type", None),
                    bool(getattr(device, "is_active_coordinator", False)),
                ),
                available=bool(getattr(device, "available", False)),
                lqi=getattr(device, "lqi", None),
                rssi=getattr(device, "rssi", None),
                last_seen=getattr(device, "last_seen", None),
                mains_powered=getattr(device, "is_mains_powered", None),
                parent_id=ids_by_ieee.get(parent_ieee) if parent_ieee else None,
            )
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Couldn't read ZHA device %s", device_id, exc_info=True)
    return network


def _parents(gateway_proxy: Any) -> dict[str, str]:
    """Each end device's parent, by IEEE address (lower case).

    ZHA scans every router's (and the coordinator's) neighbour table every
    few hours (zigpy's topology scan, every 4 hours by default); the
    devices a table lists as its children are connected to that router.
    """
    try:
        tables = gateway_proxy.gateway.application_controller.topology.neighbors
    except AttributeError:
        return {}
    parents: dict[str, str] = {}
    for parent_ieee, neighbors in list(tables.items()):
        for neighbor in neighbors or []:
            relationship = getattr(neighbor, "relationship", None)
            if getattr(relationship, "name", relationship) == "Child":
                parents[str(neighbor.ieee).lower()] = str(parent_ieee).lower()
    return parents


def _ieee(device: dr.DeviceEntry) -> str | None:
    return next((value for domain, value in device.identifiers if domain == ZHA_DOMAIN), None)


def _battery(
    hass: HomeAssistant, entries: list[er.RegistryEntry]
) -> tuple[int | None, bool | None, str | None]:
    """(level in %, low, entity_id) from the device's battery entities.

    A battery sensor gives the level; a battery binary sensor (on = low)
    only whether it's low. Neither, or no reading: (None, None, entity_id).
    """
    level: int | None = None
    low: bool | None = None
    entity_id: str | None = None
    for entry in entries:
        if (entry.device_class or entry.original_device_class) != _BATTERY:
            continue
        if entry.domain not in ("sensor", "binary_sensor"):
            continue
        state = hass.states.get(entry.entity_id)
        if entry.domain == "sensor":
            entity_id = entry.entity_id
            if state is None or state.state in (STATE_UNAVAILABLE, STATE_UNKNOWN):
                continue
            try:
                level = round(float(state.state))
            except ValueError:
                continue
        elif state is not None and state.state not in (STATE_UNAVAILABLE, STATE_UNKNOWN):
            entity_id = entity_id or entry.entity_id
            low = state.state == STATE_ON
    return level, low, entity_id


@callback
def build_device_list(
    hass: HomeAssistant, network: dict[str, ZhaDevice] | None
) -> list[dict[str, Any]]:
    """Every ZHA device, as the panel's records.

    network is zha_network's result: None when ZHA isn't running.
    """
    dev_reg = dr.async_get(hass)
    ent_reg = er.async_get(hass)
    area_reg = ar.async_get(hass)
    records: list[dict[str, Any]] = []
    for device in dev_reg.devices.values():
        if (ieee := _ieee(device)) is None:
            continue
        info = (network or {}).get(device.id)
        area = area_reg.async_get_area(device.area_id) if device.area_id else None
        entries = er.async_entries_for_device(ent_reg, device.id)
        level, low, battery_entity = _battery(hass, entries)
        role = info.role if info else ROLE_UNKNOWN
        available = bool(info and info.available)
        # Only for an online end device: where it's connected now.
        parent = (
            dev_reg.async_get(info.parent_id)
            if info and info.parent_id and available and role == ROLE_END_DEVICE
            else None
        )
        last_seen = (
            datetime.fromtimestamp(info.last_seen, UTC).isoformat()
            if info and info.last_seen
            else None
        )
        records.append(
            {
                "id": device.id,
                "ieee": ieee,
                "name": device.name_by_user or device.name or ieee,
                "area": area.name if area else "",
                "area_id": device.area_id or "",
                "manufacturer": device.manufacturer or "",
                "model": device.model or "",
                "role": role,
                "available": available,
                "category": role if available else CATEGORY_OFFLINE,
                "battery": level,
                "battery_low": low,
                "battery_entity": battery_entity,
                "mains_powered": info.mains_powered if info else None,
                "lqi": info.lqi if info else None,
                "rssi": info.rssi if info else None,
                "parent_id": parent.id if parent else None,
                "parent_name": (parent.name_by_user or parent.name or "") if parent else None,
                "last_seen": last_seen,
                "disabled": device.disabled_by is not None,
            }
        )
    records.sort(key=lambda r: (r["name"].casefold(), r["id"]))
    return records
