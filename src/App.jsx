import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function App() {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState({});
  const [newRows, setNewRows] = useState([]);

  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [prodPlanMonth, setProdPlanMonth] = useState("");
  const [ovbPlanMonth, setOvbPlanMonth] = useState("");
  const [coalType, setCoalType] = useState("K2");
  const [tables, setTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const now = new Date();
  const [createYear, setCreateYear] = useState(String(now.getFullYear()));
  const [createMonth, setCreateMonth] = useState(String(now.getMonth() + 1));
  const [newUserLogin, setNewUserLogin] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newUserStatus, setNewUserStatus] = useState("");
  const [showNewRowForm, setShowNewRowForm] = useState(false);
  const [newRowDate, setNewRowDate] = useState("");
  const [newRowProd, setNewRowProd] = useState("");
  const [newRowOvb, setNewRowOvb] = useState("");

  const columns = view?.template?.schema_json?.columns || [];
  const groups = view?.template?.schema_json?.groups || [];
  const rows = view?.rows || [];
  const selectedTable = tables.find((t) => t.id === selectedTableId);
  const periodStartStr = selectedTable?.period_start || "";
  const viewMonth = periodStartStr ? periodStartStr.slice(0, 7) : "";
  const templateMap = { K2: 1, K3: 2, K7: 3 };
  const templateId = templateMap[coalType];

  const authedFetch = useCallback(
    (url, options = {}) => {
      const headers = { ...(options.headers || {}) };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      return fetch(url, { ...options, headers });
    },
    [token]
  );

  const fetchTables = useCallback(() => {
    if (!token || !templateId) return;
    authedFetch(`${API_BASE}/tables?template_id=${templateId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        setTables(data);
        if (data.length) {
          const exists = data.some((t) => t.id === selectedTableId);
          if (!selectedTableId || !exists) {
            setSelectedTableId(data[0].id);
          }
        }
      })
      .catch((e) => setError(String(e)));
  }, [authedFetch, token, selectedTableId, templateId]);

  const fetchCurrentTable = useCallback(() => {
    if (!token || !templateId) return;
    authedFetch(`${API_BASE}/tables/current?template_id=${templateId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((table) => {
        setTables([table]);
        setSelectedTableId(table.id);
      })
      .catch((e) => setError(String(e)));
  }, [authedFetch, token, templateId]);

  const fetchView = useCallback(() => {
    if (!token || !selectedTable) return;
    const start = periodStartStr || "2025-11-01";
    const startDate = new Date(start);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const from = startDate.toISOString().slice(0, 10);
    const to = endDate.toISOString().slice(0, 10);
    setError(null);

    authedFetch(`${API_BASE}/tables/${selectedTable.id}/view?from=${from}&to=${to}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => {
        setView(data);
        setNewRows((prev) =>
          prev.filter(
            (nr) => !data.rows.some((row) => row.row_date === nr.row_date)
          )
        );
      })
      .catch((e) => setError(String(e)));
  }, [authedFetch, token, selectedTable, periodStartStr]);

  const loadSession = useCallback(() => {
    if (!token) {
      setMe(null);
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    authedFetch(`${API_BASE}/me`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data) => setMe(data))
      .catch(() => {
        setAuthError("Сессия истекла, войдите снова.");
        setToken("");
        localStorage.removeItem("token");
        setMe(null);
      })
      .finally(() => setAuthLoading(false));
  }, [authedFetch, token]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (me) {
      if (me.is_admin) {
        fetchTables();
      } else {
        fetchCurrentTable();
      }
    }
  }, [me, fetchTables, fetchCurrentTable]);

  useEffect(() => {
    // Reset selection when coal type changes
    setSelectedTableId(null);
    setTables([]);
    setView(null);
    setNewRows([]);
    setDraft({});
    if (me) {
      if (me.is_admin) {
        fetchTables();
      } else {
        fetchCurrentTable();
      }
    }
  }, [coalType, me, fetchTables, fetchCurrentTable]);

  useEffect(() => {
    if (selectedTable) {
      fetchView();
    }
  }, [selectedTable, fetchView]);

  useEffect(() => {
    // Prefill plan inputs from the first row (assumes monthly plan stored there)
    if (rows.length > 0) {
      const first = rows[0].data || {};
      if (first.prod_plan_to_date_t != null) {
        setProdPlanMonth(String(first.prod_plan_to_date_t));
      }
      if (first.ovb_plan_to_date_m3 != null) {
        setOvbPlanMonth(String(first.ovb_plan_to_date_m3));
      }
    }
  }, [rows]);

  const orderedColumns = useMemo(
    () =>
      groups.flatMap((g) => columns.filter((c) => c.group === g.key)),
    [groups, columns]
  );

  const renderValue = (row, col) => {
    if (draft[row.row_date]?.hasOwnProperty(col.key)) {
      return draft[row.row_date][col.key];
    }
    const data = row.data || {};
    return data[col.key] ?? "";
  };

  const formatValue = (val) => {
    if (typeof val === "number") {
      return val.toFixed(2);
    }
    return val ?? "";
  };

  const handleAddRow = async () => {
    const date = newRowDate.trim();
    if (!date) return;
    if (!selectedTable) return;
    if (
      rows.some((r) => r.row_date === date) ||
      newRows.some((r) => r.row_date === date)
    ) {
      setError(`Строка за дату ${date} уже существует`);
      return;
    }
    setError(null);
    const prodVal = newRowProd === "" ? 0 : Number(newRowProd);
    const ovbVal = newRowOvb === "" ? 0 : Number(newRowOvb);
    setNewRows((prev) => [...prev, { row_date: date, data: {}, isNew: true }]);
    setDraft((prev) => ({
      ...prev,
      [date]: {
        prod_fact_day_t: prodVal,
        ovb_fact_day_m3: ovbVal,
      },
    }));
    setNewRowDate("");
    setNewRowProd("");
    setNewRowOvb("");
    setShowNewRowForm(false);
    await handleSave(date, { allowEmpty: true, forceNew: true });
  };

  const handlePlanSave = async () => {
    if (!prodPlanMonth && !ovbPlanMonth) return;
    if (!selectedTable) return;
    setError(null);
    try {
      const res = await authedFetch(`${API_BASE}/tables/${selectedTable.id}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: viewMonth,
          prod_plan_month_t: prodPlanMonth ? Number(prodPlanMonth) : null,
          ovb_plan_month_m3: ovbPlanMonth ? Number(ovbPlanMonth) : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchTables();
      await fetchView();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSave = async (rowDate, { allowEmpty = false, forceNew = false } = {}) => {
    if (!selectedTable) return;
    const payload = draft[rowDate] || {};
    const isNew = forceNew || newRows.some((r) => r.row_date === rowDate);
    if (!allowEmpty && !isNew && Object.keys(payload).length === 0) return;
    setSaving((prev) => ({ ...prev, [rowDate]: true }));
    setError(null);
    try {
      const res = await authedFetch(
        `${API_BASE}/debug/tables/${selectedTable.id}/rows/${rowDate}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      await fetchView();
      setDraft((prev) => {
        const { [rowDate]: _removed, ...rest } = prev;
        return rest;
      });
      setNewRows((prev) => prev.filter((row) => row.row_date !== rowDate));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving((prev) => ({ ...prev, [rowDate]: false }));
    }
  };

  const handleTableChange = (e) => {
    const id = Number(e.target.value);
    setSelectedTableId(id);
    setView(null);
    setDraft({});
    setNewRows([]);
  };

  const handleCreateMonth = async () => {
    if (!createYear || !createMonth) return;
    if (!me?.is_admin) return;
    if (!templateId) return;
    setError(null);
    try {
      const res = await authedFetch(`${API_BASE}/tables/create-month`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          year: Number(createYear),
          month: Number(createMonth),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchTables();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginEmail, password: loginPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setToken(data.access_token);
      localStorage.setItem("token", data.access_token);
      setMe(data.user);
      setAuthError(null);
      if (data.user?.is_admin) {
        fetchTables();
      } else {
        fetchCurrentTable();
      }
    } catch (e) {
      setAuthError(String(e));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken("");
    localStorage.removeItem("token");
    setMe(null);
    setView(null);
    setDraft({});
    setNewRows([]);
    setError(null);
  };

  const handleCreateUser = async () => {
    if (!newUserLogin || !newUserName || !newUserPassword) {
      setNewUserStatus("Заполните все поля.");
      return;
    }
    setNewUserStatus("");
    try {
      const res = await authedFetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: newUserLogin,
          name: newUserName,
          password: newUserPassword,
          is_admin: newUserIsAdmin,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewUserStatus("Пользователь создан.");
      setNewUserLogin("");
      setNewUserName("");
      setNewUserPassword("");
      setNewUserIsAdmin(false);
    } catch (e) {
      setNewUserStatus(String(e));
    }
  };

  const buttonStyle = {
    fontSize: "16px",
    padding: "8px 12px",
    width: "fit-content",
  };
  const pageStyle = {
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "stretch",
    fontSize: 16,
    lineHeight: 1.5,
    boxSizing: "border-box",
  };

  if (!token || !me) {
    return (
      <div style={{ ...pageStyle, maxWidth: 500 }}>
        <h1>Вход</h1>
        <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label>
            Логин
            <input
              type="text"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={authLoading} style={buttonStyle}>
            Войти
          </button>
        </form>
        {authLoading && <div style={{ marginTop: 8 }}>Обработка…</div>}
        {authError && <pre style={{ color: "red" }}>{authError}</pre>}
      </div>
    );
  }

  if (!view) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 8 }}>
          Выполнен вход как {me?.email}{" "}
          <button onClick={handleLogout} style={{ marginLeft: 8 }}>
            Выйти
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <strong>Марка угля:</strong>
          {["K2", "K3", "K7"].map((c) => (
            <label key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="radio"
                name="coalType"
                value={c}
                checked={coalType === c}
                onChange={() => setCoalType(c)}
              />
              {c}
            </label>
          ))}
        </div>
        {me?.is_admin && (
          <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label>
                Год
                <input
                  type="number"
                  value={createYear}
                  onChange={(e) => setCreateYear(e.target.value)}
                  style={{ marginLeft: 4, width: 90 }}
                />
              </label>
            </div>
            <div>
              <label>
                Месяц
                <input
                  type="number"
                  value={createMonth}
                  onChange={(e) => setCreateMonth(e.target.value)}
                  style={{ marginLeft: 4, width: 70 }}
                />
              </label>
            </div>
            <button onClick={handleCreateMonth} style={buttonStyle}>Создать месяц</button>
          </div>
        )}
        {authLoading && <div>Проверяем сессию…</div>}
        {error && <pre style={{ color: "red" }}>Ошибка: {error}</pre>}
        {tables.length === 0 ? (
          <div>Нет доступных таблиц. {me?.is_admin ? "Создайте новую таблицу." : "Попросите администратора создать таблицу за месяц."}</div>
        ) : (
          <div>Загрузка данных…</div>
        )}
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1>{view.table.name}</h1>
        <div>
          <span>Вход: {me?.email}</span>
          <button onClick={handleLogout} style={{ marginLeft: 8, ...buttonStyle }}>
            Выйти
          </button>
        </div>
      </div>

      {me?.is_admin && (
        <div style={{ padding: 12, border: "1px solid #ccc", borderRadius: 6, marginBottom: 12, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          <strong>Админ: создание пользователя</strong>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label>
              Логин
              <input
                type="text"
                value={newUserLogin}
                onChange={(e) => setNewUserLogin(e.target.value)}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label>
              Имя
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={newUserIsAdmin}
                onChange={(e) => setNewUserIsAdmin(e.target.checked)}
              />
              Админ
            </label>
            <button onClick={handleCreateUser} style={buttonStyle}>Создать</button>
          </div>
          {newUserStatus && <div style={{ color: newUserStatus.startsWith("Пользователь создан") ? "green" : "red" }}>{newUserStatus}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <strong>Марка угля:</strong>
        {["K2", "K3", "K7"].map((c) => (
          <label key={c} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              name="coalType"
              value={c}
              checked={coalType === c}
              onChange={() => setCoalType(c)}
            />
            {c}
          </label>
      ))}
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        {me?.is_admin ? (
          <>
            <div>
              <label>
                Месяц
                <select
                  value={selectedTableId || ""}
                  onChange={handleTableChange}
                  style={{ marginLeft: 8 }}
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.period_start || t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <label>
                Год
                <input
                  type="number"
                  value={createYear}
                  onChange={(e) => setCreateYear(e.target.value)}
                  style={{ marginLeft: 4, width: 90 }}
                />
              </label>
              <label>
                Месяц
                <input
                  type="number"
                  value={createMonth}
                  onChange={(e) => setCreateMonth(e.target.value)}
                  style={{ marginLeft: 4, width: 70 }}
                />
              </label>
              <button onClick={handleCreateMonth} style={buttonStyle}>Создать месяц</button>
            </div>
          </>
        ) : (
          <div>
            <strong>Текущий месяц:</strong> {selectedTable?.period_start || "—"}
          </div>
        )}
      </div>

      {me?.is_admin && (
        <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label>
              План по углю (месяц)
              <input
                type="number"
                value={prodPlanMonth}
                onChange={(e) => setProdPlanMonth(e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </div>
          <div>
            <label>
              План по вскрыше (месяц)
              <input
                type="number"
                value={ovbPlanMonth}
                onChange={(e) => setOvbPlanMonth(e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </div>
          <button onClick={handlePlanSave} style={buttonStyle}>Сохранить планы</button>
        </div>
      )}

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setShowNewRowForm((v) => !v)} style={buttonStyle}>
          Добавить новую запись
        </button>
        {showNewRowForm && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label>
              Дата
              <input
                type="date"
                value={newRowDate}
                onChange={(e) => setNewRowDate(e.target.value)}
                style={{ marginLeft: 4 }}
              />
            </label>
            <label>
              Добыча факт сутки
              <input
                type="number"
                value={newRowProd}
                onChange={(e) => setNewRowProd(e.target.value)}
                style={{ marginLeft: 4, width: 140 }}
              />
            </label>
            <label>
              Вскрыша факт сутки
              <input
                type="number"
                value={newRowOvb}
                onChange={(e) => setNewRowOvb(e.target.value)}
                style={{ marginLeft: 4, width: 140 }}
              />
            </label>
            <button onClick={handleAddRow} style={buttonStyle}>Создать запись</button>
            <button
              type="button"
              onClick={() => {
                setShowNewRowForm(false);
                setNewRowDate("");
                setNewRowProd("");
                setNewRowOvb("");
              }}
              style={buttonStyle}
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      {error && <pre style={{ color: "red" }}>Ошибка: {error}</pre>}

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table
          border="1"
          cellPadding="6"
          style={{ borderCollapse: "collapse", width: "100%", fontSize: 16, minWidth: 600 }}
        >
          <thead>
            <tr>
              <th rowSpan={2}>Дата</th>

              {groups.map((g) => {
                const count = columns.filter((c) => c.group === g.key).length;
                return (
                  <th key={g.key} colSpan={count}>
                    {g.title}
                  </th>
                );
              })}
              <th rowSpan={2}>Действия</th>
            </tr>

            <tr>
              {orderedColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {[...rows, ...newRows].map((row) => (
              <tr key={row.row_date}>
                <td>{row.row_date}</td>
                {orderedColumns.map((col) => (
                  <td key={col.key}>
                    {col.editable ? (
                      <input
                        type="text"
                        value={renderValue(row, col)}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [row.row_date]: {
                              ...(prev[row.row_date] || {}),
                              [col.key]: e.target.value,
                            },
                          }))
                        }
                      />
                    ) : (
                      formatValue(renderValue(row, col))
                    )}
                  </td>
                ))}
                <td>
                  {/*
                    Allow saving a brand-new row even if there are no edited cells yet.
                    For existing rows, button stays disabled until a draft value exists.
                  */}
                  {(() => {
                    const isNew = newRows.some(
                      (nr) => nr.row_date === row.row_date
                    );
                    const draftForRow = draft[row.row_date] || {};
                    const hasDraft = Object.keys(draftForRow).length > 0;
                    const disable = saving[row.row_date] || (!isNew && !hasDraft);
                    return (
                      <button
                        onClick={() => handleSave(row.row_date)}
                        disabled={disable}
                        style={buttonStyle}
                      >
                        {saving[row.row_date] ? "Сохраняем…" : "Сохранить"}
                      </button>
                    );
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
