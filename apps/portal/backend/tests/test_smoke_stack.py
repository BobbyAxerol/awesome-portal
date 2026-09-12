from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
SMOKE_SCRIPT = REPO_ROOT / "scripts" / "smoke-stack.sh"
COMPOSE_PATHS = (
    REPO_ROOT / "compose.yaml",
    REPO_ROOT / "deploy" / "compose.production.stable-runtime.yaml",
)
MINIO_IMAGE = (
    "quay.io/minio/minio@"
    "sha256:cd04ea408e185cb50076ea1c3988d444119b19aaae15aab45387ccf14b2a2f86"
)


def test_smoke_builds_shared_image_producers_before_starting_services() -> None:
    script = SMOKE_SCRIPT.read_text(encoding="utf-8")

    assert (
        '"${COMPOSE[@]}" build '
        "portal-api roadmap-task-board-api portal-web control-api"
    ) in script
    assert '"${COMPOSE[@]}" up --detach --no-build' in script
    assert '"${COMPOSE[@]}" up --detach --build' not in script


def test_compose_pins_the_available_minio_oci_index_everywhere() -> None:
    for compose_path in COMPOSE_PATHS:
        content = compose_path.read_text(encoding="utf-8")
        assert f"image: {MINIO_IMAGE}" in content
        assert "image: minio/minio:" not in content
