"""Un usuario nunca ve ni toca datos de otro: siempre 404, nunca 403."""

import pytest


@pytest.fixture
def ana_data(client, auth_headers):
    statuses = client.get("/api/statuses", headers=auth_headers).json()
    task = client.post("/api/tasks", json={"title": "Secreto de Ana"}, headers=auth_headers).json()
    return {"status_id": statuses[1]["id"], "task_id": task["id"], "statuses": statuses}


def test_lists_only_show_own_data(client, auth_headers, other_headers, ana_data):
    beto_statuses = client.get("/api/statuses", headers=other_headers).json()
    assert {s["id"] for s in beto_statuses}.isdisjoint({s["id"] for s in ana_data["statuses"]})

    page = client.get("/api/tasks", headers=other_headers).json()
    assert page == {"items": [], "total": 0}

    page = client.get("/api/tasks?q=Secreto", headers=other_headers).json()
    assert page["total"] == 0


def test_cannot_access_other_users_task(client, other_headers, ana_data):
    url = f"/api/tasks/{ana_data['task_id']}"
    assert client.get(url, headers=other_headers).status_code == 404
    assert client.patch(url, json={"title": "hack"}, headers=other_headers).status_code == 404
    move = {"status_id": ana_data["status_id"], "position": 0}
    assert client.patch(f"{url}/move", json=move, headers=other_headers).status_code == 404
    assert client.delete(url, headers=other_headers).status_code == 404


def test_task_untouched_after_attempts(client, auth_headers, other_headers, ana_data):
    url = f"/api/tasks/{ana_data['task_id']}"
    client.patch(url, json={"title": "hack"}, headers=other_headers)
    client.delete(url, headers=other_headers)
    r = client.get(url, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Secreto de Ana"


def test_cannot_touch_other_users_status(client, other_headers, ana_data):
    url = f"/api/statuses/{ana_data['status_id']}"
    assert client.patch(url, json={"name": "hack"}, headers=other_headers).status_code == 404
    assert client.delete(url, headers=other_headers).status_code == 404


def test_cannot_use_other_users_status_in_own_tasks(client, other_headers, ana_data):
    foreign_status = ana_data["status_id"]
    r = client.post(
        "/api/tasks", json={"title": "x", "status_id": foreign_status}, headers=other_headers
    )
    assert r.status_code == 404

    own = client.post("/api/tasks", json={"title": "propia"}, headers=other_headers).json()
    url = f"/api/tasks/{own['id']}"
    assert (
        client.patch(url, json={"status_id": foreign_status}, headers=other_headers).status_code
        == 404
    )
    assert (
        client.patch(
            f"{url}/move", json={"status_id": foreign_status, "position": 0}, headers=other_headers
        ).status_code
        == 404
    )

    own_statuses = client.get("/api/statuses", headers=other_headers).json()
    r = client.delete(
        f"/api/statuses/{own_statuses[1]['id']}?move_to={foreign_status}", headers=other_headers
    )
    assert r.status_code == 404


def test_cannot_reorder_with_other_users_ids(client, other_headers, ana_data):
    ids = [s["id"] for s in ana_data["statuses"]]
    r = client.put("/api/statuses/reorder", json={"ids": ids}, headers=other_headers)
    assert r.status_code == 400
