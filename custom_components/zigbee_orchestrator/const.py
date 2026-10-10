"""Constants for WP Zigbee Orchestrator."""
from __future__ import annotations

DOMAIN = "zigbee_orchestrator"
NAME = "WP Zigbee Orchestrator"

# The ZHA integration's domain, as in its devices' identifiers.
ZHA_DOMAIN = "zha"

DATA_PANEL_STATIC_REGISTERED = f"{DOMAIN}_panel_static_registered"

PANEL_URL_PATH = "zigbee-orchestrator"
PANEL_TITLE = "Zigbee Orchestrator"
PANEL_ICON = "mdi:zigbee"
PANEL_ELEMENT = "zigbee-orchestrator-panel"
PANEL_STATIC_URL = "/zigbee_orchestrator_static"
PANEL_MODULE_FILE = "zigbee-orchestrator-panel.js"

# Each device's role on the Zigbee network (ZHA's logical device type).
ROLE_COORDINATOR = "coordinator"
ROLE_ROUTER = "router"
ROLE_END_DEVICE = "end_device"
ROLE_UNKNOWN = "unknown"
