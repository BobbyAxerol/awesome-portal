"""Domain constants shared by schemas and persistence."""

TASK_STATUSES = ("Backlog", "Ready", "In Progress", "Validating", "Done")
NOTIFY_STATUSES = frozenset({"In Progress", "Validating", "Done"})
ENTITY_TASK = "task"
ENTITY_ROADMAP_PHASE = "roadmap_phase"
