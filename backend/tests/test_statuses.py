import uuid


def get_statuses(client, headers):
    return client.get("/api/statuses", headers=headers).json()


def by_name(statuses):
    return {s["name"]: s for s in statuses}


def test_register_creates_default_statuses(client, auth_headers):
    statuses = get_statuses(client, auth_headers)
    assert [s["name"] for s in statuses] == ["Por hacer", "En progreso", "Hecho"]
    assert [s["position"] for s in statuses] == [0, 1, 2]
    assert [s["is_default"] for s in statuses] == [True, False, False]
    assert [s["is_done"] for s in statuses] == [False, False, True]


def test_statuses_require_auth(client):
    assert client.get("/api/statuses").status_code == 401


def test_create_status_goes_last(client, auth_headers):
    r = client.post(
        "/api/statuses",
        json={"name": "Bloqueada", "color": "#EF4444"},
        headers=auth_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["position"] == 3
    assert body["color"] == "#ef4444"
    assert body["is_default"] is False


def test_create_status_validates(client, auth_headers):
    bad_color = client.post(
        "/api/statuses", json={"name": "X", "color": "rojo"}, headers=auth_headers
    )
    assert bad_color.status_code == 422
    empty = client.post("/api/statuses", json={"name": "   "}, headers=auth_headers)
    assert empty.status_code == 422


def test_status_names_are_unique_per_user(client, auth_headers):
    r = client.post("/api/statuses", json={"name": "hecho"}, headers=auth_headers)
    assert r.status_code == 409


def test_create_default_status_replaces_previous(client, auth_headers):
    client.post("/api/statuses", json={"name": "Bandeja", "is_default": True}, headers=auth_headers)
    defaults = [s["name"] for s in get_statuses(client, auth_headers) if s["is_default"]]
    assert defaults == ["Bandeja"]


def test_update_status(client, auth_headers):
    status_id = by_name(get_statuses(client, auth_headers))["En progreso"]["id"]
    r = client.patch(
        f"/api/statuses/{status_id}",
        json={"name": "Haciendo", "color": "#f59e0b", "is_done": False},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Haciendo"
    assert r.json()["color"] == "#f59e0b"


def test_update_status_duplicate_name(client, auth_headers):
    status_id = by_name(get_statuses(client, auth_headers))["En progreso"]["id"]
    r = client.patch(f"/api/statuses/{status_id}", json={"name": "Hecho"}, headers=auth_headers)
    assert r.status_code == 409


def test_update_status_can_keep_its_own_name(client, auth_headers):
    status_id = by_name(get_statuses(client, auth_headers))["Hecho"]["id"]
    r = client.patch(f"/api/statuses/{status_id}", json={"name": "Hecho"}, headers=auth_headers)
    assert r.status_code == 200


def test_set_default_moves_flag(client, auth_headers):
    statuses = by_name(get_statuses(client, auth_headers))
    r = client.patch(
        f"/api/statuses/{statuses['En progreso']['id']}",
        json={"is_default": True},
        headers=auth_headers,
    )
    assert r.status_code == 200
    defaults = [s["name"] for s in get_statuses(client, auth_headers) if s["is_default"]]
    assert defaults == ["En progreso"]


def test_cannot_unset_only_default(client, auth_headers):
    status_id = by_name(get_statuses(client, auth_headers))["Por hacer"]["id"]
    r = client.patch(f"/api/statuses/{status_id}", json={"is_default": False}, headers=auth_headers)
    assert r.status_code == 400


def test_reorder_statuses(client, auth_headers):
    ids = [s["id"] for s in get_statuses(client, auth_headers)]
    new_order = [ids[2], ids[0], ids[1]]
    r = client.put("/api/statuses/reorder", json={"ids": new_order}, headers=auth_headers)
    assert r.status_code == 200
    assert [s["id"] for s in r.json()] == new_order
    assert [s["id"] for s in get_statuses(client, auth_headers)] == new_order


def test_reorder_requires_all_ids_once(client, auth_headers):
    ids = [s["id"] for s in get_statuses(client, auth_headers)]
    for payload in ([ids[0], ids[1]], [ids[0], ids[0], ids[1]], [*ids, str(uuid.uuid4())]):
        r = client.put("/api/statuses/reorder", json={"ids": payload}, headers=auth_headers)
        assert r.status_code == 400


def test_delete_empty_status(client, auth_headers):
    statuses = by_name(get_statuses(client, auth_headers))
    r = client.delete(f"/api/statuses/{statuses['En progreso']['id']}", headers=auth_headers)
    assert r.status_code == 204
    remaining = get_statuses(client, auth_headers)
    assert [s["name"] for s in remaining] == ["Por hacer", "Hecho"]
    assert [s["position"] for s in remaining] == [0, 1]


def test_delete_status_with_tasks_requires_move_to(client, auth_headers):
    statuses = by_name(get_statuses(client, auth_headers))
    source = statuses["En progreso"]["id"]
    client.post("/api/tasks", json={"title": "A", "status_id": source}, headers=auth_headers)

    r = client.delete(f"/api/statuses/{source}", headers=auth_headers)
    assert r.status_code == 400

    r = client.delete(f"/api/statuses/{source}?move_to={source}", headers=auth_headers)
    assert r.status_code == 400


def test_delete_status_moves_tasks_to_end_of_target(client, auth_headers):
    statuses = by_name(get_statuses(client, auth_headers))
    source, target = statuses["En progreso"]["id"], statuses["Hecho"]["id"]
    post = lambda title, sid: client.post(  # noqa: E731
        "/api/tasks", json={"title": title, "status_id": sid}, headers=auth_headers
    )
    post("ya hecha", target)
    post("mover 1", source)
    post("mover 2", source)

    r = client.delete(f"/api/statuses/{source}?move_to={target}", headers=auth_headers)
    assert r.status_code == 204

    tasks = client.get(f"/api/tasks?status_id={target}&sort=position", headers=auth_headers).json()[
        "items"
    ]
    assert [t["title"] for t in tasks] == ["ya hecha", "mover 1", "mover 2"]
    assert [t["position"] for t in tasks] == [0, 1, 2]


def test_delete_default_status_passes_flag(client, auth_headers):
    statuses = by_name(get_statuses(client, auth_headers))
    default_id, target = statuses["Por hacer"]["id"], statuses["Hecho"]["id"]
    r = client.delete(f"/api/statuses/{default_id}?move_to={target}", headers=auth_headers)
    assert r.status_code == 204
    defaults = [s["name"] for s in get_statuses(client, auth_headers) if s["is_default"]]
    assert defaults == ["Hecho"]


def test_cannot_delete_last_status(client, auth_headers):
    statuses = get_statuses(client, auth_headers)
    for s in statuses[1:]:
        client.delete(f"/api/statuses/{s['id']}", headers=auth_headers)
    r = client.delete(f"/api/statuses/{statuses[0]['id']}", headers=auth_headers)
    assert r.status_code == 400


def test_unknown_status_is_404(client, auth_headers):
    missing = uuid.uuid4()
    assert (
        client.patch(
            f"/api/statuses/{missing}", json={"name": "x"}, headers=auth_headers
        ).status_code
        == 404
    )
    assert client.delete(f"/api/statuses/{missing}", headers=auth_headers).status_code == 404
