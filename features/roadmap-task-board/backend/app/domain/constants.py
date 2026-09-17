"""Domain constants shared by schemas and persistence."""

TASK_STATUSES = ("Backlog", "Ready", "In Progress", "Validating", "Done")

# Who a task can be assigned to.
#
# `owner` is a TEAM ("Trading + Risk", "SRE"); this is a PERSON, and the Portal
# declares exactly three of them. Keeping the two apart is deliberate: forcing
# people into `owner` would have erased the team on every existing task.
#
# "Unassigned" is a real state, not a missing value — a task nobody has picked
# up is a fact worth showing rather than an empty cell.
TASK_ASSIGNEE_UNASSIGNED = "Unassigned"
TASK_ASSIGNEES = (TASK_ASSIGNEE_UNASSIGNED, "bobby", "stan", "thanhvuong")
NOTIFY_STATUSES = frozenset({"In Progress", "Validating", "Done"})
ENTITY_TASK = "task"
ENTITY_ROADMAP_PHASE = "roadmap_phase"
