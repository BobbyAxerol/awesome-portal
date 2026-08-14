.DEFAULT_GOAL := help

.PHONY: help verify build up run down logs status config smoke hooks contributor-provision

help: ## Show available workspace commands.
	@./scripts/portal help

verify: ## Validate tracked source, shell scripts and Compose config.
	@./scripts/portal verify

build: ## Build all portal images from checked-out source.
	@./scripts/portal build

up: ## Build and start the complete portal stack in the background.
	@./scripts/portal up

run: ## Build and run the complete portal stack in the foreground.
	@./scripts/portal run

down: ## Stop the complete portal stack.
	@./scripts/portal down

logs: ## Follow logs from every portal service.
	@./scripts/portal logs

status: ## Show portal service status.
	@./scripts/portal status

config: ## Render the effective Docker Compose configuration.
	@./scripts/portal config

smoke: ## Build, start, verify and tear down an isolated smoke-test stack.
	@./scripts/portal smoke

hooks: ## Enable parent workspace pre-commit hooks.
	@./scripts/install-git-hooks.sh

contributor-provision: ## Create Thanh Vuong's Primus feature workspace (set BRANCH=feat/topic).
	@./scripts/provision-contributor-workspace.sh --branch "$(BRANCH)"
