import uuid

import pytest


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


def list_tasks(client, headers, query=""):
    r = client.get(f"/api/tasks{query}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def titles(page):
    return [t["title"] for t in page["items"]]


# --- CRUD ---


def test_create_task_with_defaults(create, statuses):
    task = create(title="  Comprar pan  ")
    assert task["title"] == "Comprar pan"
    assert task["status_id"] == statuses["Por hacer"]
    assert task["priority"] == "medium"
    assert task["description"] is None
    assert task["due_date"] is None
    assert task["position"] == 0


def test_create_task_with_all_fields(create, statuses):
    task = create(
        title="Informe",
        description="# Título\n\n- punto **uno**",
        priority="urgent",
        due_date="2026-12-31",
        status_id=statuses["En progreso"],
    )
    assert task["description"].startswith("# Título")
    assert task["priority"] == "urgent"
    assert task["due_date"] == "2026-12-31"
    assert task["status_id"] == statuses["En progreso"]


def test_new_tasks_go_to_end_of_column(create):
    assert [create(title=str(i))["position"] for i in range(3)] == [0, 1, 2]


def test_create_task_validates(client, auth_headers):
    for payload in (
        {"title": ""},
        {"title": "x" * 201},
        {"title": "ok", "priority": "critica"},
        {"title": "ok", "due_date": "mañana"},
    ):
        assert client.post("/api/tasks", json=payload, headers=auth_headers).status_code == 422


def test_create_task_with_unknown_status(client, auth_headers):
    r = client.post(
        "/api/tasks", json={"title": "x", "status_id": str(uuid.uuid4())}, headers=auth_headers
    )
    assert r.status_code == 404


def test_get_task(client, auth_headers, create):
    task = create(title="Leer")
    r = client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Leer"


def test_update_task_partial(client, auth_headers, create):
    task = create(title="Original", description="texto", due_date="2026-11-01")
    r = client.patch(
        f"/api/tasks/{task['id']}",
        json={"title": "Editada", "priority": "high"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Editada"
    assert body["priority"] == "high"
    assert body["description"] == "texto"  # lo no enviado no cambia
    assert body["updated_at"] > task["updated_at"]


def test_update_task_can_clear_optional_fields(client, auth_headers, create):
    task = create(description="algo", due_date="2026-11-01")
    r = client.patch(
        f"/api/tasks/{task['id']}",
        json={"description": None, "due_date": None},
        headers=auth_headers,
    )
    assert r.json()["description"] is None
    assert r.json()["due_date"] is None


def test_update_task_rejects_null_required_fields(client, auth_headers, create):
    task = create()
    for field in ("title", "priority", "status_id"):
        r = client.patch(f"/api/tasks/{task['id']}", json={field: None}, headers=auth_headers)
        assert r.status_code == 422, field


def test_update_task_status_appends_to_new_column(client, auth_headers, create, statuses):
    create(title="ya", status_id=statuses["Hecho"])
    task = create(title="mover")
    r = client.patch(
        f"/api/tasks/{task['id']}", json={"status_id": statuses["Hecho"]}, headers=auth_headers
    )
    assert r.json()["status_id"] == statuses["Hecho"]
    assert r.json()["position"] == 1


def test_delete_task(client, auth_headers, create):
    task = create()
    assert client.delete(f"/api/tasks/{task['id']}", headers=auth_headers).status_code == 204
    assert client.get(f"/api/tasks/{task['id']}", headers=auth_headers).status_code == 404


def test_unknown_task_is_404(client, auth_headers):
    missing = uuid.uuid4()
    assert client.get(f"/api/tasks/{missing}", headers=auth_headers).status_code == 404
    assert client.delete(f"/api/tasks/{missing}", headers=auth_headers).status_code == 404


# --- Filtros, búsqueda, orden y paginación ---


def test_filter_by_status(client, auth_headers, create, statuses):
    create(title="a")
    create(title="b", status_id=statuses["Hecho"])
    page = list_tasks(client, auth_headers, f"?status_id={statuses['Hecho']}")
    assert titles(page) == ["b"]
    assert page["total"] == 1


def test_filter_by_priority(client, auth_headers, create):
    create(title="baja", priority="low")
    create(title="alta", priority="high")
    create(title="urgente", priority="urgent")
    page = list_tasks(client, auth_headers, "?priority=high&priority=urgent&sort=title")
    assert titles(page) == ["alta", "urgente"]


def test_search_in_title_and_description(client, auth_headers, create):
    create(title="Llamar al banco")
    create(title="Otra", description="revisar el BANCO de pruebas")
    create(title="Nada que ver")
    page = list_tasks(client, auth_headers, "?q=banco&sort=title")
    assert titles(page) == ["Llamar al banco", "Otra"]


def test_sort_by_priority_uses_severity(client, auth_headers, create):
    for p in ("medium", "urgent", "low", "high"):
        create(title=p, priority=p)
    assert titles(list_tasks(client, auth_headers, "?sort=-priority")) == [
        "urgent",
        "high",
        "medium",
        "low",
    ]
    assert titles(list_tasks(client, auth_headers, "?sort=priority"))[0] == "low"


def test_sort_by_due_date_puts_empty_last(client, auth_headers, create):
    create(title="sin fecha")
    create(title="tarde", due_date="2026-12-01")
    create(title="pronto", due_date="2026-11-01")
    assert titles(list_tasks(client, auth_headers, "?sort=due_date")) == [
        "pronto",
        "tarde",
        "sin fecha",
    ]
    assert titles(list_tasks(client, auth_headers, "?sort=-due_date"))[-1] == "sin fecha"


def test_invalid_sort_is_rejected(client, auth_headers):
    assert client.get("/api/tasks?sort=hashed_password", headers=auth_headers).status_code == 422


def test_pagination(client, auth_headers, create):
    for i in range(5):
        create(title=f"t{i}")
    page = list_tasks(client, auth_headers, "?sort=title&limit=2&offset=2")
    assert titles(page) == ["t2", "t3"]
    assert page["total"] == 5
    assert client.get("/api/tasks?limit=0", headers=auth_headers).status_code == 422
    assert client.get("/api/tasks?limit=201", headers=auth_headers).status_code == 422


# --- Mover (kanban) ---


def column(client, headers, status_id):
    page = list_tasks(client, headers, f"?status_id={status_id}&sort=position")
    return [(t["title"], t["position"]) for t in page["items"]]


def test_move_within_same_column(client, auth_headers, create, statuses):
    a, _, _ = create(title="a"), create(title="b"), create(title="c")
    r = client.patch(
        f"/api/tasks/{a['id']}/move",
        json={"status_id": statuses["Por hacer"], "position": 2},
        headers=auth_headers,
    )
    assert r.status_code == 200
    assert column(client, auth_headers, statuses["Por hacer"]) == [("b", 0), ("c", 1), ("a", 2)]


def test_move_to_other_column_renumbers_both(client, auth_headers, create, statuses):
    _, b, _ = create(title="a"), create(title="b"), create(title="c")
    create(title="x", status_id=statuses["Hecho"])
    create(title="y", status_id=statuses["Hecho"])

    r = client.patch(
        f"/api/tasks/{b['id']}/move",
        json={"status_id": statuses["Hecho"], "position": 1},
        headers=auth_headers,
    )
    assert r.json()["status_id"] == statuses["Hecho"]
    assert column(client, auth_headers, statuses["Hecho"]) == [("x", 0), ("b", 1), ("y", 2)]
    assert column(client, auth_headers, statuses["Por hacer"]) == [("a", 0), ("c", 1)]


def test_move_position_beyond_end_is_clamped(client, auth_headers, create, statuses):
    task = create(title="a")
    r = client.patch(
        f"/api/tasks/{task['id']}/move",
        json={"status_id": statuses["Hecho"], "position": 99},
        headers=auth_headers,
    )
    assert r.json()["position"] == 0


def test_move_validates(client, auth_headers, create, statuses):
    task = create()
    url = f"/api/tasks/{task['id']}/move"
    bad_position = {"status_id": statuses["Hecho"], "position": -1}
    assert client.patch(url, json=bad_position, headers=auth_headers).status_code == 422
    unknown_status = {"status_id": str(uuid.uuid4()), "position": 0}
    assert client.patch(url, json=unknown_status, headers=auth_headers).status_code == 404
