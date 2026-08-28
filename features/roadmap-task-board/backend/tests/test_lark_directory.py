from __future__ import annotations

from dataclasses import replace

import httpx
import pytest

from backend.app.infrastructure.lark_directory import (
    LarkDirectoryError,
    LarkDirectoryResolver,
)


class DirectoryClient:
    def __init__(self, open_id: str = "ou_00000000000000000000000000000000"):
        self.open_id = open_id
        self.posts = []
        self.gets = []

    def post(self, url, *, json):
        self.posts.append((url, json))
        return httpx.Response(
            200,
            json={"code": 0, "tenant_access_token": "tenant-token", "expire": 7200},
            request=httpx.Request("POST", url),
        )

    def get(self, url, *, params, headers):
        self.gets.append((url, params, headers))
        return httpx.Response(
            200,
            json={"code": 0, "data": {"user": {"open_id": self.open_id}}},
            request=httpx.Request("GET", url),
        )


def test_directory_resolves_tenant_user_id_and_caches_open_id(client):
    settings = replace(
        client.app.state.settings,
        lark_app_id="cli_test",
        lark_app_secret="app-secret",
        lark_org_user_id_map={"bobby": "tenant_bobby"},
    )
    resolver = LarkDirectoryResolver(settings)
    directory_client = DirectoryClient()

    assert resolver.resolve("tenant_bobby", directory_client) == directory_client.open_id
    assert resolver.resolve("tenant_bobby", directory_client) == directory_client.open_id

    assert len(directory_client.posts) == 1
    token_url, token_body = directory_client.posts[0]
    assert token_url == resolver.TOKEN_URL
    assert token_body == {"app_id": "cli_test", "app_secret": "app-secret"}
    assert len(directory_client.gets) == 1
    user_url, params, headers = directory_client.gets[0]
    assert user_url.endswith("/tenant_bobby")
    assert params == {"user_id_type": "user_id"}
    assert headers == {"Authorization": "Bearer tenant-token"}


def test_directory_rejects_non_open_id_without_leaking_identity(client):
    settings = replace(
        client.app.state.settings,
        lark_app_id="cli_test",
        lark_app_secret="app-secret",
    )
    resolver = LarkDirectoryResolver(settings)

    with pytest.raises(LarkDirectoryError, match="no valid open_id") as caught:
        resolver.resolve("tenant_private_user", DirectoryClient("wrong-id-type"))

    assert "tenant_private_user" not in str(caught.value)
    assert "app-secret" not in str(caught.value)


def test_directory_rejects_malformed_response_shape(client):
    settings = replace(
        client.app.state.settings,
        lark_app_id="cli_test",
        lark_app_secret="app-secret",
    )
    resolver = LarkDirectoryResolver(settings)
    directory_client = DirectoryClient()

    def malformed_get(url, *, params, headers):
        return httpx.Response(
            200,
            json={"code": 0, "data": None},
            request=httpx.Request("GET", url),
        )

    directory_client.get = malformed_get
    with pytest.raises(LarkDirectoryError, match="no valid open_id"):
        resolver.resolve("tenant_bobby", directory_client)
