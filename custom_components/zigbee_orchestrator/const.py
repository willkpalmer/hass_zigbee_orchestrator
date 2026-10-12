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

# The device groups made on the Groups page (groups.py): only for finding
# devices, nothing to do with ZHA's own Zigbee groups.
DATA_GROUPS = f"{DOMAIN}_groups"

# The devices marked as in maintenance on the Devices page (maintenance.py).
DATA_MAINTENANCE = f"{DOMAIN}_maintenance"
