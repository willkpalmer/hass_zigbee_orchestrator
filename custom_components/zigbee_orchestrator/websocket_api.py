"""WebSocket commands for the Zigbee Orchestrator sidebar panel.

zigbee_orchestrator/devices/subscribe sends the full device list (see
devices.py) straight away, {"devices": [...], "zha_running": bool}, and
again whenever it changes: when a ZHA device's entity changes state (a
device going offline makes its entities unavailable, a new battery
reading), when the device, entity or area registry changes, and once a
minute in case ZHA changed something with no state change. Changes close
together are sent once, and an unchanged list isn't sent again.

zigbee_orchestrator/groups/subscribe sends the device groups made on the
Groups page (see groups.py), {"groups": [...]}, straight away and after
every change. zigbee_orchestrator/groups/create, rename, delete,
set_devices, add_devices and remove_devices change them.

zigbee_orchestrator/maintenance/set puts devices in maintenance (see
maintenance.py), or takes them out of it; the device list is sent again
straight away.

zigbee_orchestrator/topology/scan has ZHA re-read which router each end
device is connected to now (see devices.async_scan_topology), answers
when that's done, and sends every device list subscription the new list.

Admin-only, like the panel itself.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_time_interval

from .const import DATA_GROUPS, DATA_MAINTENANCE
from .devices import ZhaNotRunning, async_scan_topology, build_device_list, zha_network
from .groups import GroupError, GroupStore

WS_DEVICES_SUBSCRIBE = "zigbee_orchestrator/devices/subscribe"
WS_TOPOLOGY_SCAN = "zigbee_orchestrator/topology/scan"
WS_MAINTENANCE_SET = "zigbee_orchestrator/maintenance/set"
# Sent when the device list should be sent again now (after a scan).
SIGNAL_DEVICES_CHANGED = "zigbee_orchestrator_devices_changed"
WS_GROUPS_SUBSCRIBE = "zigbee_orchestrator/groups/subscribe"
WS_GROUPS_CREATE = "zigbee_orchestrator/groups/create"
WS_GROUPS_RENAME = "zigbee_orchestrator/groups/rename"
WS_GROUPS_DELETE = "zigbee_orchestrator/groups/delete"
WS_GROUPS_SET_DEVICES = "zigbee_orchestrator/groups/set_devices"
WS_GROUPS_ADD_DEVICES = "zigbee_orchestrator/groups/add_devices"
WS_GROUPS_REMOVE_DEVICES = "zigbee_orchestrator/groups/remove_devices"

_DEVICE_IDS = vol.All([str], vol.Length(max=10_000))

# How long changes are gathered before the list is sent.
_DEBOUNCE_SECONDS = 1.0
_REFRESH_INTERVAL = timedelta(minutes=1)


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_devices_subscribe)
    websocket_api.async_register_command(hass, websocket_topology_scan)
    websocket_api.async_register_command(hass, websocket_maintenance_set)
    websocket_api.async_register_command(hass, websocket_groups_subscribe)
    websocket_api.async_register_command(hass, websocket_groups_create)
    websocket_api.async_register_command(hass, websocket_groups_rename)
    websocket_api.async_register_command(hass, websocket_groups_delete)
    websocket_api.async_register_command(hass, websocket_groups_set_devices)
    websocket_api.async_register_command(hass, websocket_groups_add_devices)
    websocket_api.async_register_command(hass, websocket_groups_remove_devices)


@callback
def device_payload(hass: HomeAssistant) -> dict[str, Any]:
    network = zha_network(hass)
    maintenance = hass.data.get(DATA_MAINTENANCE)
    return {
        "devices": build_device_list(hass, network, maintenance.device_ids if maintenance else None),
        "zha_running": network is not None,
    }


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_DEVICES_SUBSCRIBE})
@callback
def websocket_devices_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    payload = device_payload(hass)
    last = {"payload": payload}
    # The device registry ids of the listed devices, to pick out their
    # entities' state changes.
    device_ids = {"ids": {r["id"] for r in payload["devices"]}}
    pending: dict[str, Any] = {"cancel": None}
    ent_reg = er.async_get(hass)

    @callback
    def _send(_now: Any = None) -> None:
        pending["cancel"] = None
        payload = device_payload(hass)
        device_ids["ids"] = {r["id"] for r in payload["devices"]}
        if payload == last["payload"]:
            return
        last["payload"] = payload
        connection.send_message(websocket_api.event_message(msg["id"], payload))

    @callback
    def _changed(_event: Event | None = None) -> None:
        if pending["cancel"] is None:
            pending["cancel"] = async_call_later(hass, _DEBOUNCE_SECONDS, _send)

    @callback
    def _is_zha_state(event_data: Any) -> bool:
        entry = ent_reg.async_get(event_data["entity_id"])
        return entry is not None and entry.device_id in device_ids["ids"]

    unsubs = [
        hass.bus.async_listen(EVENT_STATE_CHANGED, _changed, event_filter=_is_zha_state),
        hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(ar.EVENT_AREA_REGISTRY_UPDATED, _changed),
        async_track_time_interval(hass, _send, _REFRESH_INTERVAL),
        async_dispatcher_connect(hass, SIGNAL_DEVICES_CHANGED, _send),
    ]

    @callback
    def _unsubscribe() -> None:
        for unsub in unsubs:
            unsub()
        if pending["cancel"] is not None:
            pending["cancel"]()

    connection.subscriptions[msg["id"]] = _unsubscribe
    connection.send_result(msg["id"])
    connection.send_message(websocket_api.event_message(msg["id"], payload))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_TOPOLOGY_SCAN})
@websocket_api.async_response
async def websocket_topology_scan(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        await async_scan_topology(hass)
    except ZhaNotRunning:
        connection.send_error(msg["id"], "zha_not_running", "ZHA isn't running")
        return
    except Exception as err:  # noqa: BLE001 - the scan itself failed
        connection.send_error(msg["id"], "scan_failed", f"The network scan failed: {err}")
        return
    async_dispatcher_send(hass, SIGNAL_DEVICES_CHANGED)
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_MAINTENANCE_SET,
        vol.Required("device_ids"): _DEVICE_IDS,
        vol.Required("maintenance"): bool,
    }
)
@callback
def websocket_maintenance_set(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if (store := hass.data.get(DATA_MAINTENANCE)) is None:
        connection.send_error(msg["id"], "not_loaded", "WP Zigbee Orchestrator isn't loaded")
        return
    store.async_set(msg["device_ids"], msg["maintenance"])
    async_dispatcher_send(hass, SIGNAL_DEVICES_CHANGED)
    connection.send_result(msg["id"])


def _groups(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> GroupStore | None:
    store: GroupStore | None = hass.data.get(DATA_GROUPS)
    if store is None:
        connection.send_error(msg["id"], "not_loaded", "WP Zigbee Orchestrator isn't loaded")
    return store


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_GROUPS_SUBSCRIBE})
@callback
def websocket_groups_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if (store := _groups(hass, connection, msg)) is None:
        return

    @callback
    def _forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {"groups": store.groups}))

    connection.subscriptions[msg["id"]] = store.async_subscribe(_forward)
    connection.send_result(msg["id"])
    _forward()


def _group_command(schema: dict, change):
    """A command changing the groups: change(store, msg), answered with its
    result, or an error the panel shows (a name that's taken, ...)."""

    @websocket_api.require_admin
    @websocket_api.websocket_command(schema)
    @callback
    def _command(
        hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
    ) -> None:
        if (store := _groups(hass, connection, msg)) is None:
            return
        try:
            result = change(store, msg)
        except GroupError as err:
            connection.send_error(msg["id"], "invalid", str(err))
            return
        connection.send_result(msg["id"], result)

    return _command


websocket_groups_create = _group_command(
    {
        vol.Required("type"): WS_GROUPS_CREATE,
        vol.Required("name"): str,
        vol.Optional("device_ids", default=[]): _DEVICE_IDS,
    },
    lambda store, msg: store.async_create(msg["name"], msg["device_ids"]),
)
websocket_groups_rename = _group_command(
    {vol.Required("type"): WS_GROUPS_RENAME, vol.Required("group_id"): str, vol.Required("name"): str},
    lambda store, msg: store.async_rename(msg["group_id"], msg["name"]),
)
websocket_groups_delete = _group_command(
    {vol.Required("type"): WS_GROUPS_DELETE, vol.Required("group_id"): str},
    lambda store, msg: store.async_delete(msg["group_id"]),
)
websocket_groups_set_devices = _group_command(
    {
        vol.Required("type"): WS_GROUPS_SET_DEVICES,
        vol.Required("group_id"): str,
        vol.Required("device_ids"): _DEVICE_IDS,
    },
    lambda store, msg: store.async_set_devices(msg["group_id"], msg["device_ids"]),
)
websocket_groups_add_devices = _group_command(
    {
        vol.Required("type"): WS_GROUPS_ADD_DEVICES,
        vol.Required("group_id"): str,
        vol.Required("device_ids"): _DEVICE_IDS,
    },
    lambda store, msg: store.async_add_devices(msg["group_id"], msg["device_ids"]),
)
websocket_groups_remove_devices = _group_command(
    {
        vol.Required("type"): WS_GROUPS_REMOVE_DEVICES,
        vol.Required("group_id"): str,
        vol.Required("device_ids"): _DEVICE_IDS,
    },
    lambda store, msg: store.async_remove_devices(msg["group_id"], msg["device_ids"]),
)
