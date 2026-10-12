"""Devices in maintenance (maintenance.py) and their WebSocket command."""
from __future__ import annotations

import types

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import device_registry as dr

from custom_components.zigbee_orchestrator import websocket_api as ws
from custom_components.zigbee_orchestrator.const import DATA_MAINTENANCE
from custom_components.zigbee_orchestrator.devices import ZhaDevice, build_device_list
from custom_components.zigbee_orchestrator.maintenance import MaintenanceStore


async def test_store(hass):
    store = MaintenanceStore(hass)
    await store.async_load()
    changes = []
    store.async_subscribe(lambda: changes.append(1))

    store.async_set(["a", "b", "a"], True)
    store.async_set(["b"], True)  # no change
    assert store.device_ids == {"a", "b"}
    store.async_set(["a", "x"], False)
    assert store.device_ids == {"b"}
    store.async_forget_device("b")
    assert store.device_ids == set()
    assert len(changes) == 3

    store.async_set(["c"], True)
    await store._store._async_handle_write_data()
    again = MaintenanceStore(hass)
    await again.async_load()
    assert again.device_ids == {"c"}


async def test_category(hass):
    entry = ConfigEntry(
        data={}, discovery_keys={}, domain="zha", minor_version=1, options={},
        source="user", title="zha", unique_id=None, version=1, subentries_data=None,
    )
    hass.config_entries._entries[entry.entry_id] = entry
    reg = dr.async_get(hass)
    lamp = reg.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("zha", "1")}, name="Lamp")
    plug = reg.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("zha", "2")}, name="Plug")
    network = {
        lamp.id: ZhaDevice(role="router", available=False),
        plug.id: ZhaDevice(role="router", available=True),
    }
    records = {r["name"]: r for r in build_device_list(hass, network, {lamp.id, plug.id})}
    # In maintenance, whether it's offline or back online.
    assert (records["Lamp"]["category"], records["Lamp"]["maintenance"]) == ("maintenance", True)
    assert (records["Plug"]["category"], records["Plug"]["available"]) == ("maintenance", True)
    records = {r["name"]: r for r in build_device_list(hass, network)}
    assert (records["Lamp"]["category"], records["Lamp"]["maintenance"]) == ("offline", False)

    # The command: the device list is sent again straight away.
    store = MaintenanceStore(hass)
    await store.async_load()
    hass.data[DATA_MAINTENANCE] = store
    sent, results = [], []
    connection = types.SimpleNamespace(
        user=types.SimpleNamespace(is_admin=True),
        subscriptions={},
        send_result=lambda _id, result=None: results.append(_id),
        send_error=lambda _id, code, message: None,
        send_message=sent.append,
    )
    ws.websocket_devices_subscribe(hass, connection, {"id": 1, "type": ws.WS_DEVICES_SUBSCRIBE})
    ws.websocket_maintenance_set(
        hass, connection, {"id": 2, "type": ws.WS_MAINTENANCE_SET, "device_ids": [lamp.id], "maintenance": True}
    )
    assert 2 in results
    by_name = {r["name"]: r for r in sent[-1]["event"]["devices"]}
    assert by_name["Lamp"]["category"] == "maintenance"
    assert by_name["Plug"]["category"] == "offline"  # ZHA isn't running here
    ws.websocket_maintenance_set(
        hass, connection, {"id": 3, "type": ws.WS_MAINTENANCE_SET, "device_ids": [lamp.id], "maintenance": False}
    )
    assert {r["name"]: r for r in sent[-1]["event"]["devices"]}["Lamp"]["category"] == "offline"
    connection.subscriptions[1]()
