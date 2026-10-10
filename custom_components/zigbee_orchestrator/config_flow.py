"""Config flow for WP Zigbee Orchestrator: nothing to set, just a confirmation."""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN, NAME


class ZigbeeOrchestratorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the setup of WP Zigbee Orchestrator."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> Any:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=NAME, data={})
        return self.async_show_form(step_id="user")
