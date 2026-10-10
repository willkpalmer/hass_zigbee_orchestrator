"""The device groups (groups.py) and their WebSocket commands."""
from __future__ import annotations

import types

import pytest

from custom_components.zigbee_orchestrator import websocket_api as ws
from custom_components.zigbee_orchestrator.const import DATA_GROUPS
from custom_components.zigbee_orchestrator.groups import GroupError, GroupStore


async def test_groups(hass):
    store = GroupStore(hass)
    await store.async_load()
    changes = []
    store.async_subscribe(lambda: changes.append(1))

    upstairs = store.async_create("  Upstairs   sensors ", ["a", "b", "a"])
    assert upstairs["name"] == "Upstairs sensors"
    assert upstairs["device_ids"] == ["a", "b"]
    kitchen = store.async_create("kitchen")
    # By name, whatever the case.
    assert [g["name"] for g in store.groups] == ["kitchen", "Upstairs sensors"]

    with pytest.raises(GroupError):
        store.async_create("KITCHEN")
    with pytest.raises(GroupError):
        store.async_create("   ")
    with pytest.raises(GroupError):
        store.async_rename(kitchen["id"], "upstairs SENSORS")
    store.async_rename(kitchen["id"], "Kitchen")

    store.async_add_devices(kitchen["id"], ["b", "c"])
    store.async_add_devices(kitchen["id"], ["c", "d"])
    store.async_remove_devices(upstairs["id"], ["a"])
    by_name = {g["name"]: g for g in store.groups}
    assert by_name["Kitchen"]["device_ids"] == ["b", "c", "d"]
    assert by_name["Upstairs sensors"]["device_ids"] == ["b"]

    # A device removed from Home Assistant leaves every group.
    store.async_forget_device("b")
    by_name = {g["name"]: g for g in store.groups}
    assert by_name["Kitchen"]["device_ids"] == ["c", "d"]
    assert by_name["Upstairs sensors"]["device_ids"] == []

    store.async_set_devices(kitchen["id"], ["x"])
    store.async_delete(upstairs["id"])
    with pytest.raises(GroupError):
        store.async_delete(upstairs["id"])
    assert len(changes) == 9

    # Saved (the delayed save written now), and loaded back.
    await store._store._async_handle_write_data()
    again = GroupStore(hass)
    await again.async_load()
    assert again.groups == [{"id": kitchen["id"], "name": "Kitchen", "device_ids": ["x"]}]


async def test_group_commands(hass):
    store = GroupStore(hass)
    await store.async_load()
    hass.data[DATA_GROUPS] = store
    sent, results, errors = [], [], []
    connection = types.SimpleNamespace(
        user=types.SimpleNamespace(is_admin=True),
        subscriptions={},
        send_result=lambda _id, result=None: results.append(result),
        send_error=lambda _id, code, message: errors.append((code, message)),
        send_message=sent.append,
    )
    ws.websocket_groups_subscribe(hass, connection, {"id": 1, "type": ws.WS_GROUPS_SUBSCRIBE})
    assert sent[-1]["event"] == {"groups": []}

    ws.websocket_groups_create(
        hass, connection, {"id": 2, "type": ws.WS_GROUPS_CREATE, "name": "Lights", "device_ids": ["d1"]}
    )
    group_id = results[-1]["id"]
    assert sent[-1]["event"]["groups"] == [{"id": group_id, "name": "Lights", "device_ids": ["d1"]}]

    ws.websocket_groups_create(
        hass, connection, {"id": 3, "type": ws.WS_GROUPS_CREATE, "name": "lights", "device_ids": []}
    )
    assert errors[-1][0] == "invalid"

    ws.websocket_groups_add_devices(
        hass, connection, {"id": 4, "type": ws.WS_GROUPS_ADD_DEVICES, "group_id": group_id, "device_ids": ["d2"]}
    )
    assert sent[-1]["event"]["groups"][0]["device_ids"] == ["d1", "d2"]
    ws.websocket_groups_delete(hass, connection, {"id": 5, "type": ws.WS_GROUPS_DELETE, "group_id": group_id})
    assert sent[-1]["event"] == {"groups": []}

    connection.subscriptions[1]()
    store.async_create("Other")
    assert sent[-1]["event"] == {"groups": []}
