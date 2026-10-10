"""WebSocket commands for the Zigbee Orchestrator sidebar panel.

zigbee_orchestrator/devices/subscribe sends the full device list (see
devices.py) straight away, {"devices": [...], "zha_running": bool}, and
again whenever it changes: when a ZHA device's entity changes state (a
device going offline makes its entities unavailable, a new battery
reading), when the device, entity or area registry changes, and once a
minute in case ZHA changed something with no state change. Changes close
together are sent once, and an unchanged list isn't sent again.

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
from homeassistant.helpers.event import async_call_later, async_track_time_interval

from .devices import build_device_list, zha_network

WS_DEVICES_SUBSCRIBE = "zigbee_orchestrator/devices/subscribe"

# How long changes are gathered before the list is sent.
_DEBOUNCE_SECONDS = 1.0
_REFRESH_INTERVAL = timedelta(minutes=1)


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_devices_subscribe)


@callback
def device_payload(hass: HomeAssistant) -> dict[str, Any]:
    network = zha_network(hass)
    return {"devices": build_device_list(hass, network), "zha_running": network is not None}


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
