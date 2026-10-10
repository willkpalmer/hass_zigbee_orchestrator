"""The device list (devices.py) and its WebSocket feed (websocket_api.py)."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from custom_components.zigbee_orchestrator.devices import (
    ZhaDevice,
    build_device_list,
    role_of,
    zha_network,
)
from custom_components.zigbee_orchestrator.websocket_api import device_payload


def _entry(hass, domain="zha") -> ConfigEntry:
    entry = ConfigEntry(
        data={}, discovery_keys={}, domain=domain, minor_version=1, options={},
        source="user", title=domain, unique_id=None, version=1, subentries_data=None,
    )
    # As pytest-homeassistant-custom-component's MockConfigEntry.add_to_hass.
    hass.config_entries._entries[entry.entry_id] = entry
    return entry


def _device(hass, entry, ieee, name, **kwargs) -> dr.DeviceEntry:
    return dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("zha", ieee)},
        name=name,
        **kwargs,
    )


def test_role_of():
    assert role_of("Coordinator") == "coordinator"
    assert role_of("Router") == "router"
    assert role_of("EndDevice") == "end_device"
    assert role_of("unknown") == "unknown"
    assert role_of(None) == "unknown"
    # The active coordinator is the coordinator, whatever it reports.
    assert role_of("Router", is_active_coordinator=True) == "coordinator"


async def test_device_list(hass):
    zha = _entry(hass)
    other = _entry(hass, "hue")
    kitchen = ar.async_get(hass).async_create("Kitchen")

    coordinator = _device(hass, zha, "00:00:00:00:00:00:00:01", "SkyConnect", manufacturer="Nabu Casa", model="SkyConnect")
    plug = _device(hass, zha, "00:00:00:00:00:00:00:02", "Plug", manufacturer="IKEA", model="TRETAKT")
    sensor = _device(hass, zha, "00:00:00:00:00:00:00:03", "lumi.sensor", manufacturer="LUMI", model="WSDCGQ11LM")
    dr.async_get(hass).async_update_device(sensor.id, name_by_user="Kitchen sensor", area_id=kitchen.id)
    remote = _device(hass, zha, "00:00:00:00:00:00:00:04", "Remote")
    dr.async_get(hass).async_get_or_create(
        config_entry_id=other.entry_id, identifiers={("hue", "bulb")}, name="Hue bulb"
    )

    ent_reg = er.async_get(hass)
    battery = ent_reg.async_get_or_create(
        "sensor", "zha", "sensor-battery", device_id=sensor.id, original_device_class="battery"
    )
    hass.states.async_set(battery.entity_id, "86.4")
    low = ent_reg.async_get_or_create(
        "binary_sensor", "zha", "remote-battery-low", device_id=remote.id, original_device_class="battery"
    )
    hass.states.async_set(low.entity_id, "on")

    network = {
        coordinator.id: ZhaDevice(role="coordinator", available=True, mains_powered=True),
        plug.id: ZhaDevice(role="router", available=True, lqi=200, rssi=-61, last_seen=0.0, mains_powered=True),
        sensor.id: ZhaDevice(role="end_device", available=True, last_seen=1_700_000_000.0),
        remote.id: ZhaDevice(role="end_device", available=False),
    }
    records = {r["name"]: r for r in build_device_list(hass, network)}

    # ZHA's devices only, sorted by name; the user's own name wins.
    assert list(records) == ["Kitchen sensor", "Plug", "Remote", "SkyConnect"]
    assert records["SkyConnect"]["category"] == "coordinator"
    assert records["Plug"]["category"] == "router"
    assert records["Plug"]["battery"] is None
    assert records["Plug"]["mains_powered"] is True
    assert (records["Plug"]["lqi"], records["Plug"]["rssi"]) == (200, -61)
    assert records["Remote"]["rssi"] is None
    s = records["Kitchen sensor"]
    assert s["category"] == "end_device"
    assert (s["area"], s["manufacturer"], s["model"]) == ("Kitchen", "LUMI", "WSDCGQ11LM")
    assert s["battery"] == 86
    assert s["battery_entity"] == battery.entity_id
    assert s["last_seen"].startswith("2023-11-14T22:13:20")
    # Offline devices are apart from their role.
    r = records["Remote"]
    assert (r["role"], r["available"], r["category"]) == ("end_device", False, "offline")
    assert (r["battery"], r["battery_low"]) == (None, True)


async def test_unavailable_battery_reading(hass):
    zha = _entry(hass)
    device = _device(hass, zha, "00:00:00:00:00:00:00:05", "Button")
    battery = er.async_get(hass).async_get_or_create(
        "sensor", "zha", "button-battery", device_id=device.id, original_device_class="battery"
    )
    hass.states.async_set(battery.entity_id, "unavailable")
    (record,) = build_device_list(hass, {device.id: ZhaDevice(role="end_device", available=True)})
    assert record["battery"] is None
    assert record["battery_entity"] == battery.entity_id


async def test_without_zha(hass):
    zha = _entry(hass)
    _device(hass, zha, "00:00:00:00:00:00:00:06", "Lamp")
    # ZHA isn't running: every device is offline, of no known role.
    assert zha_network(hass) is None
    payload = device_payload(hass)
    assert payload["zha_running"] is False
    (record,) = payload["devices"]
    assert (record["role"], record["available"], record["category"]) == ("unknown", False, "offline")


async def test_zha_network(hass, monkeypatch):
    import sys
    import types

    class Device:
        def __init__(self, device_type, available, active=False):
            self.device_type = device_type
            self.available = available
            self.is_active_coordinator = active
            self.lqi = 255
            self.rssi = -70
            self.last_seen = 1.0
            self.is_mains_powered = True

    class Proxy:
        def __init__(self, device_id, device):
            if device_id:
                self.device_id = device_id
            self.device = device

        def __getattr__(self, name):
            # As ZHA's proxy before the device is in the device registry.
            raise AttributeError(name)

    proxies = {
        1: Proxy("coordinator", Device("Coordinator", True, active=True)),
        2: Proxy("router", Device("Router", False)),
        3: Proxy(None, Device("EndDevice", True)),
    }
    helpers = types.ModuleType("homeassistant.components.zha.helpers")
    helpers.get_zha_gateway_proxy = lambda _hass: types.SimpleNamespace(device_proxies=proxies)
    monkeypatch.setitem(sys.modules, "homeassistant.components.zha.helpers", helpers)
    hass.config.components.add("zha")

    network = zha_network(hass)
    assert network == {
        "coordinator": ZhaDevice(role="coordinator", available=True, lqi=255, rssi=-70, last_seen=1.0, mains_powered=True),
        "router": ZhaDevice(role="router", available=False, lqi=255, rssi=-70, last_seen=1.0, mains_powered=True),
    }


async def test_subscription_sends_changes(hass, monkeypatch):
    import asyncio
    import types

    from custom_components.zigbee_orchestrator import websocket_api as ws

    monkeypatch.setattr(ws, "_DEBOUNCE_SECONDS", 0)
    zha = _entry(hass)
    device = _device(hass, zha, "00:00:00:00:00:00:00:07", "Lamp")
    sent = []
    connection = types.SimpleNamespace(
        user=types.SimpleNamespace(is_admin=True),
        subscriptions={},
        send_result=lambda _id, _result=None: None,
        send_message=sent.append,
    )
    ws.websocket_devices_subscribe(hass, connection, {"id": 5, "type": ws.WS_DEVICES_SUBSCRIBE})
    assert sent[0]["event"]["devices"][0]["name"] == "Lamp"

    async def settle():
        for _ in range(3):
            await hass.async_block_till_done()
            await asyncio.sleep(0.01)

    # A rename is sent; nothing changed, nothing sent.
    dr.async_get(hass).async_update_device(device.id, name_by_user="Desk lamp")
    await settle()
    assert len(sent) == 2
    assert sent[1]["event"]["devices"][0]["name"] == "Desk lamp"
    hass.bus.async_fire(dr.EVENT_DEVICE_REGISTRY_UPDATED, {"action": "update", "device_id": device.id})
    await settle()
    assert len(sent) == 2

    connection.subscriptions[5]()
    dr.async_get(hass).async_update_device(device.id, name_by_user="Lamp")
    await settle()
    assert len(sent) == 2
