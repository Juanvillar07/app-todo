"""Borrado suave de tareas y "Deshacer" (restaurar)."""

from datetime import timedelta

import pytest
from sqlmodel import Session

from app.db import engine
from app.models import Task


@pytest.fixture
def statuses(client, auth_headers):
    """Estados del usuario por nombre: {"Por hacer": id, ...}."""
    return {s["name"]: s["id"] for s in client.get("/api/statuses", headers=auth_headers).json()}


@pytest.fixture
def create(client, auth_headers):
    def _create(**fields):
        r = client.post("/api/tasks", json={"title": "Tarea", **fields}, headers=auth_headers)
        assert r.status_code == 201, r.text
        return r.json()

    return _create


def column(client, headers, status_id) -> list[tuple[str, int]]:
    """(título, posición) de la columna en orden, como la ve el tablero."""
    items = client.get(f"/api/tasks?status_id={status_id}&sort=position", headers=headers).json()[
        "items"
    ]
    return [(t["title"], t["position"]) for t in items]


def delete(client, headers, task_id):
    return client.delete(f"/api/tasks/{task_id}", headers=headers)


def restore(client, headers, task_id):
    return client.post(f"/api/tasks/{task_id}/restore", headers=headers)


def test_deleted_task_disappears_everywhere(client, auth_headers, create, statuses):
    a = create(title="A")
    create(title="B")
    assert delete(client, auth_headers, a["id"]).status_code == 204

    assert client.get(f"/api/tasks/{a['id']}", headers=auth_headers).status_code == 404
    assert column(client, auth_headers, statuses["Por hacer"]) == [("B", 0)]
    page = client.get("/api/tasks?q=A", headers=auth_headers).json()
    assert page["total"] == 0
    # Una borrada no se puede editar, mover ni volver a borrar.
    r = client.patch(f"/api/tasks/{a['id']}", json={"title": "X"}, headers=auth_headers)
    assert r.status_code == 404
    assert delete(client, auth_headers, a["id"]).status_code == 404


def test_restore_puts_task_back_in_place(client, auth_headers, create, statuses):
    create(title="A")
    b = create(title="B")
    create(title="C")
    delete(client, auth_headers, b["id"])
    assert column(client, auth_headers, statuses["Por hacer"]) == [("A", 0), ("C", 1)]

    r = restore(client, auth_headers, b["id"])
    assert r.status_code == 200
    assert r.json()["title"] == "B"
    assert column(client, auth_headers, statuses["Por hacer"]) == [("A", 0), ("B", 1), ("C", 2)]


def test_restore_after_column_changed(client, auth_headers, create, statuses):
    a = create(title="A")
    create(title="B")
    delete(client, auth_headers, a["id"])
    create(title="C")  # va al final de la columna, que ya no tiene a A

    restore(client, auth_headers, a["id"])
    assert column(client, auth_headers, statuses["Por hacer"]) == [("A", 0), ("B", 1), ("C", 2)]


def test_restore_requires_a_deleted_task(client, auth_headers, create):
    task = create()
    assert restore(client, auth_headers, task["id"]).status_code == 404


def test_cannot_restore_task_of_another_user(client, auth_headers, other_headers, create):
    task = create()
    delete(client, auth_headers, task["id"])
    assert restore(client, other_headers, task["id"]).status_code == 404
    assert restore(client, auth_headers, task["id"]).status_code == 200


def test_old_deleted_tasks_are_purged(client, auth_headers, create):
    old = create(title="Vieja")
    delete(client, auth_headers, old["id"])
    with Session(engine) as db:
        task = db.get(Task, old["id"])
        task.deleted_at -= timedelta(days=8)
        db.add(task)
        db.commit()

    recent = create(title="Reciente")
    delete(client, auth_headers, recent["id"])  # al borrar se purgan las de hace > 7 días

    with Session(engine) as db:
        assert db.get(Task, old["id"]) is None
        assert db.get(Task, recent["id"]) is not None
    assert restore(client, auth_headers, old["id"]).status_code == 404
    assert restore(client, auth_headers, recent["id"]).status_code == 200


def test_deleted_task_follows_its_status_when_status_is_deleted(
    client, auth_headers, create, statuses
):
    source, target = statuses["En progreso"], statuses["Hecho"]
    task = create(title="Borrada", status_id=source)
    delete(client, auth_headers, task["id"])

    r = client.delete(f"/api/statuses/{source}?move_to={target}", headers=auth_headers)
    assert r.status_code == 204
    restored = restore(client, auth_headers, task["id"]).json()
    assert restored["status_id"] == target


def test_status_with_only_deleted_tasks_can_be_deleted(client, auth_headers, create, statuses):
    source = statuses["En progreso"]
    task = create(status_id=source)
    delete(client, auth_headers, task["id"])

    # Las borradas no cuentan como "tiene tareas": no hace falta move_to.
    assert client.delete(f"/api/statuses/{source}", headers=auth_headers).status_code == 204
    assert restore(client, auth_headers, task["id"]).status_code == 404
