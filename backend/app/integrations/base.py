"""
Base protocol and shared types for task sink integrations.

Any class that implements TaskSink can receive approved items.
This allows the push endpoint to work with Trello, GitHub, or any
future integration without changing endpoint code.
"""
from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable


@dataclass
class ExternalRef:
    """Reference to a task created in an external system."""
    external_id:  str           # e.g. Trello card ID
    external_url: str           # e.g. https://trello.com/c/...
    system:       str           # "trello" | "github"


@runtime_checkable
class TaskSink(Protocol):
    """
    Protocol that all task integrations must implement.
    The push endpoint calls create_task() for each APPROVED item.
    """

    def create_task(self, item, meeting) -> ExternalRef:
        """
        Create a task in the external system and return its reference.

        Args:
            item:    ORM Item instance (status must be APPROVED — enforced by caller)
            meeting: ORM Meeting instance

        Returns:
            ExternalRef with id and URL of the created task

        Raises:
            IntegrationError: if the external call fails
        """
        ...

    def get_task_list_name(self, external_id: str) -> Optional[str]:
        """
        Return the list/column name a task currently sits in.
        Used by the sync job to detect when tasks move to 'Done'.
        Returns None if the task cannot be found.
        """
        ...
