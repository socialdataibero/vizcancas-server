# VizCanvas — Guía de integración para frontends externos

Este documento describe cómo consumir la API de VizCanvas desde cualquier frontend: React, Vue, Svelte, Observable Framework, o cualquier cliente HTTP.

> **Arquitectura:** El servidor VizCanvas maneja todo el procesamiento de datos en el backend — subida de archivos, gestión de tablas, ejecución de SQL (DuckDB) y el chat con IA (Claude). El cliente no necesita procesar datos localmente.

---

## Configuración base

```js
const BASE_URL = "http://localhost:3001";
const API = `${BASE_URL}/api`;
```
---

## 1. Subir archivos de datos

Acepta: `.csv` `.tsv` `.json` `.jsonl` `.parquet` `.geojson` `.topojson`

### Subir un archivo

```js
async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API}/files/upload`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

// Uso
const input = document.querySelector('input[type="file"]');
input.addEventListener("change", async (e) => {
  const result = await uploadFile(e.target.files[0]);
  console.log(result.tableName);  // nombre de la tabla creada
  console.log(result.columns);    // esquema inferido
  console.log(result.rowCount);   // total de filas
});
```

**Respuesta:**
```json
{
  "originalName": "ventas.csv",
  "filename": "ventas.csv",
  "tableName": "ventas",
  "columns": [
    { "name": "municipio", "type": "VARCHAR", "nullable": true, "role": "join_key" },
    { "name": "monto",     "type": "DOUBLE",  "nullable": true }
  ],
  "rowCount": 1500,
  "size": 48320,
  "mimetype": "text/csv",
  "uploadedAt": "2024-05-15T10:30:00.000Z"
}
```

### Subir múltiples archivos

```js
async function uploadMany(files) {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  const res = await fetch(`${API}/files/upload-many`, {
    method: "POST",
    body: form,
  });
  return res.json(); // array de resultados
}
```

---

## 2. Consultar tablas disponibles

```js
async function getTables() {
  const res = await fetch(`${API}/tables`);
  return res.json();
}

// Respuesta: array de tablas con columnas, rowCount y metadata
const tables = await getTables();
tables.forEach(t => {
  console.log(`${t.name}: ${t.rowCount} filas, ${t.columns.length} columnas`);
});
```

### Obtener esquema de una tabla

```js
async function getSchema(tableName) {
  const res = await fetch(`${API}/tables/${tableName}/schema`);
  return res.json();
}
```

---

## 3. Ejecutar consultas SQL

El servidor corre DuckDB. Soporta SQL completo: CTEs, window functions, JOINs, funciones geoespaciales.

### Consulta completa

```js
async function query(sql) {
  const res = await fetch(`${API}/query/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const { columns, rows, totalRows } = await query(`
  SELECT municipio, SUM(monto) AS total
  FROM ventas
  GROUP BY municipio
  ORDER BY total DESC
`);
```

### Consulta paginada

```js
async function queryLimited(sql, limit = 250) {
  const res = await fetch(`${API}/query/execute-limited`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, limit }),
  });
  return res.json();
  // totalRows = conteo real sin el límite (útil para paginar)
}

// Ejemplo: paginación manual
async function getPage(tableName, page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  return queryLimited(
    `SELECT * FROM ${tableName} LIMIT ${pageSize} OFFSET ${offset}`,
    pageSize
  );
}
```

---

## 4. Exportar tabla completa

```js
async function exportTable(tableName) {
  const res = await fetch(`${API}/tables/${tableName}/export`);
  const data = await res.json();

  if (!data.dataEmbedded) {
    // Tabla > 100k filas — usar paginación con /query/execute-limited
    console.warn("Tabla demasiado grande para exportación inline");
    return null;
  }

  return data; // { columns, rows, rowCount, dataEmbedded: true }
}
```

---

## 5. Sugerencias de join geoespacial

Detecta automáticamente qué columnas conectan tablas geográficas con tablas de datos.

```js
async function getJoinSuggestions(tableName = null) {
  const url = tableName
    ? `${API}/analysis/map-flows?tableName=${tableName}`
    : `${API}/analysis/map-flows`;

  const res = await fetch(url);
  return res.json();
}

const suggestions = await getJoinSuggestions();
// [
//   {
//     geoTableName: "municipios",
//     dataTableName: "ventas",
//     join: {
//       leftColumn: "cve_mun",
//       rightColumn: "municipio_cve",
//       score: 87.5,
//       sharedValueCount: 312,
//       sampleCoverage: 0.85,
//       reason: "312 valores compartidos · 85% de cobertura"
//     }
//   }
// ]

// Construir el JOIN automáticamente
const s = suggestions[0];
const joinSql = `
  SELECT g.*, d.*
  FROM ${s.geoTableName} g
  LEFT JOIN ${s.dataTableName} d
    ON g.${s.join.leftColumn} = d.${s.join.rightColumn}
`;
```

---

## 6. Chat con IA (Claude)

El endpoint principal del servidor. Recibe el contexto del canvas (tablas y nodos existentes) y devuelve un plan estructurado de nodos y conexiones.

```js
async function chat(messages, context = {}) {
  const res = await fetch(`${API}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

### Ejemplo mínimo

```js
const { reply, plan } = await chat([
  { role: "user", content: "Crea un gráfico de barras de ventas por municipio" }
]);

console.log(reply);      // texto del asistente
console.log(plan.nodes); // nodos a crear
console.log(plan.edges); // conexiones entre nodos
```

### Con contexto completo (recomendado)

```js
// 1. Obtener tablas disponibles
const tables = await getTables();

// 2. Estado actual del canvas (lo maneja tu frontend)
const existingNodes = [
  {
    ref: "node_abc",
    type: "from",
    status: "success",
    summary: "Tabla ventas (1500 filas)",
    columns: ["municipio", "monto", "fecha"]
  }
];

// 3. Llamar al chat
const { reply, plan, usage } = await chat(
  [
    { role: "user", content: "Agrupa por municipio y muéstralo en un mapa" }
  ],
  {
    tables: tables.map(t => ({ name: t.name, columns: t.columns })),
    nodeCount: existingNodes.length,
    existingNodes,
  }
);

// 4. Aplicar el plan al canvas
plan.nodes.forEach(node => crearNodo(node));
plan.edges.forEach(edge => conectarNodos(edge.from, edge.to));
```

### Conversación multi-turno

```js
const history = [];

async function sendMessage(userText, context) {
  history.push({ role: "user", content: userText });

  const { reply, plan } = await chat(history, context);

  history.push({ role: "assistant", content: reply });
  return { reply, plan };
}

// Turno 1
await sendMessage("Muéstrame las ventas por año");

// Turno 2 — el modelo recuerda el contexto anterior
await sendMessage("Ahora filtra solo los últimos 3 años");
```

### Tipos de nodos que puede devolver el plan

| Tipo | Descripción |
|------|-------------|
| `from` | Carga una tabla. Config: `tableName`, `selectedColumns`, `filters`, `sortColumn` |
| `sql` | SQL personalizado. Config: `query`, `autoRun` |
| `group` | Agrupa y agrega. Config: `groupByColumns`, `aggregations` |
| `join` | Une dos datasets. Config: `joinType`, `leftColumn`, `rightColumn` |
| `chart` | Visualización. Config: `chartType`, `xColumn`, `yColumn`, `colorColumn`, etc. |
| `table` | Vista tabular. Config: `hiddenColumns`, `sortColumn` |
| `distinct` | Valores únicos. Config: `columns` |
| `controls` | Filtros interactivos. Config: `controls[]` |
| `javascript` | Transformación JS. Config: `code` |

### Gráficas disponibles

`bar` · `barX` · `barY` · `line` · `area` · `scatter` · `dot` · `pie` ·
`histogram` · `heatmap` · `box` · `stackedBar` · `waffle` · `waterfall` ·
`treemap` · `sankey` · `choropleth` · `geoPoint` · `spike` · `arc` ·
`grid` (alias: `cartogram`) · `link`

---

## 7. Autenticación (endpoints de usuarios)

Los endpoints de datos no requieren autenticación. Los de gestión de usuarios sí.

```js
// Login
async function login(username, password) {
  const res = await fetch(`${API}/users/sign-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const { token, user } = await res.json();
  localStorage.setItem("vztoken", token);
  return { token, user };
}

// Helper para peticiones autenticadas
async function authFetch(path, options = {}) {
  const token = localStorage.getItem("vztoken");
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...options.headers,
    },
  });
}

// Perfil del usuario actual
async function getProfile() {
  const res = await authFetch("/users/myProfile");
  return res.json();
}
```

---

## 8. Cliente completo reutilizable

```js
class VizCanvasClient {
  constructor(baseUrl = "http://localhost:3001") {
    this.api = `${baseUrl}/api`;
    this.token = null;
  }

  // ── Auth ────────────────────────────────────────────────
  async login(username, password) {
    const res = await this._post("/users/sign-in", { username, password });
    this.token = res.token;
    return res;
  }

  // ── Files ───────────────────────────────────────────────
  async upload(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${this.api}/files/upload`, {
      method: "POST",
      body: form,
    });
    return res.json();
  }

  async uploadMany(files) {
    const form = new FormData();
    files.forEach(f => form.append("files", f));
    const res = await fetch(`${this.api}/files/upload-many`, {
      method: "POST",
      body: form,
    });
    return res.json();
  }

  // ── Tables ──────────────────────────────────────────────
  async tables()              { return this._get("/tables"); }
  async schema(name)          { return this._get(`/tables/${name}/schema`); }
  async exportTable(name)     { return this._get(`/tables/${name}/export`); }
  async dropTable(name)       { return this._delete(`/tables/${name}`); }
  async clearTables()         { return this._delete("/tables"); }

  async importTable(tableName, columns, rows) {
    return this._post("/tables/import", { tableName, columns, rows });
  }

  // ── Query ───────────────────────────────────────────────
  async query(sql)                   { return this._post("/query/execute", { sql }); }
  async queryPage(sql, limit = 250)  { return this._post("/query/execute-limited", { sql, limit }); }

  // ── Analysis ────────────────────────────────────────────
  async joinSuggestions(tableName) {
    const qs = tableName ? `?tableName=${tableName}` : "";
    return this._get(`/analysis/map-flows${qs}`);
  }

  // ── AI ──────────────────────────────────────────────────
  async chat(messages, context = {}) {
    return this._post("/ai/chat", { messages, context });
  }

  // ── Internals ───────────────────────────────────────────
  async _get(path) {
    const res = await fetch(`${this.api}${path}`, {
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  }

  async _post(path, body) {
    const res = await fetch(`${this.api}${path}`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async _delete(path) {
    const res = await fetch(`${this.api}${path}`, {
      method: "DELETE",
      headers: this._headers(),
    });
    if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  }

  _headers() {
    const h = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }
}

// Uso
const vz = new VizCanvasClient("http://localhost:3001");

await vz.upload(myFile);
const tables = await vz.tables();
const { rows } = await vz.query("SELECT * FROM ventas LIMIT 10");
const { reply, plan } = await vz.chat(
  [{ role: "user", content: "Agrupa ventas por mes" }],
  { tables }
);
```

---

## 9. Uso desde Observable Framework

### Data loader (build time)

`src/data/tables.json.js`
```js
const res = await fetch(`${process.env.VIZCANVAS_URL}/api/tables`);
process.stdout.write(await res.text());
```

Consumo en el markdown:
```js
const tables = FileAttachment("data/tables.json").json();
```

### Query reactiva (runtime)

```js
const sqlInput = view(Inputs.textarea({ label: "SQL", value: "SELECT * FROM ventas" }));

const result = await fetch("http://localhost:3001/api/query/execute-limited", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sql: sqlInput, limit: 250 }),
}).then(r => r.json());

Inputs.table(result.rows)
```

---

## Referencia rápida de endpoints

| Método | Endpoint | Auth | Descripción |
|--------|----------|:----:|-------------|
| POST | `/api/files/upload` | — | Subir archivo (crea tabla DuckDB) |
| POST | `/api/files/upload-many` | — | Subir múltiples archivos |
| GET | `/api/files` | — | Listar archivos subidos |
| DELETE | `/api/files/:filename` | — | Eliminar archivo del disco |
| GET | `/api/tables` | — | Listar tablas con metadata |
| GET | `/api/tables/:name/schema` | — | Esquema de columnas |
| GET | `/api/tables/:name/export` | — | Exportar datos (≤100k filas inline) |
| POST | `/api/tables/import` | — | Importar datos como tabla |
| DELETE | `/api/tables/:name` | — | Eliminar tabla |
| DELETE | `/api/tables` | — | Eliminar todas las tablas |
| POST | `/api/query/execute` | — | SQL completo |
| POST | `/api/query/execute-limited` | — | SQL paginado |
| GET | `/api/analysis/map-flows` | — | Sugerencias de join |
| POST | `/api/ai/chat` | — | Chat con Claude — devuelve plan de nodos |
| POST | `/api/users` | — | Registrar usuario |
| POST | `/api/users/sign-in` | — | Login → JWT |
| GET | `/api/users/myProfile` | JWT | Perfil propio |
| PATCH | `/api/users/profile` | JWT | Actualizar perfil |
| GET | `/api/users` | JWT+ADMIN | Listar usuarios |
| PATCH | `/api/users/:id` | JWT+ADMIN | Actualizar rol/acceso |

---

## Manejo de errores

```js
async function safeQuery(sql) {
  try {
    const res = await fetch(`${API}/query/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    });

    if (res.status === 400) {
      const err = await res.json();
      throw new Error(`SQL inválido: ${err.message}`);
    }
    if (res.status === 401) throw new Error("Token expirado o inválido");
    if (res.status === 403) throw new Error("Sin permisos");
    if (!res.ok) throw new Error(`Error ${res.status}`);

    return res.json();
  } catch (e) {
    console.error("VizCanvas API error:", e.message);
    throw e;
  }
}
```

| Código HTTP | Causa |
|-------------|-------|
| 400 | SQL inválido, DTO mal formado |
| 401 | Token JWT ausente o expirado |
| 403 | Rol insuficiente o usuario inactivo |
| 404 | Tabla o recurso no encontrado |
| 500 | Error interno del servidor |
