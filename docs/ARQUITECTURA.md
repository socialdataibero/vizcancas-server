# VizCanvas — Arquitectura del sistema

## Diagrama general

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     CLIENT — corre en el navegador                           │
│                                                                              │
│  ┌───────────────────────┐     ┌────────────────────────────────────────┐   │
│  │    Canvas visual      │     │           Zustand Stores               │   │
│  │                       │◄───►│                                        │   │
│  │  · editor visual      │     │  dagStore   → grafo + ejecución        │   │
│  │    de nodos           │     │  canvasStore→ páginas, título          │   │
│  │  · drag & drop        │     │  dataStore  → tablas + esquemas        │   │
│  │  · conectar edges     │     │  uiStore    → paneles, selección       │   │
│  │  · frames →           │     │  snapshots  → historial (máx. 20)      │   │
│  │    dashboards         │     └──────────────────────────────────────  ┘   │
│  │  · multipágina        │                       │                          │
│  │  · modo presentación  │                       ▼                          │
│  └──────────┬────────────┘     ┌────────────────────────────────────────┐   │
│             │                  │           DAG Executor                 │   │
│   cada cambio                  │                                        │   │
│   dispara re-ejecución         │  · sort topológico del grafo           │   │
│   del grafo (SQL)              │  · construye cadena de CTEs            │   │
│             │                  │    WITH "_node_<uuid>" AS (...)        │   │
│             └─────────────────►│  · re-ejecuta nodos aguas abajo        │   │
│                                │  · nodos: from · sql · group · join    │   │
│                                │           chart · table · distinct     │   │
│                                │           javascript · controls        │   │
│                                └──────────────┬─────────────────────────┘   │
│                                               │ SQL (vía API)               │
│                                               │                             │
│                               ┌──────────────────────────────────────────┐  │
│                               │    Visualización — Observable Plot + D3  │  │
│                               │                                          │  │
│                               │  20+ tipos de gráfica:                   │  │
│                               │  bar · line · scatter · area · pie       │  │
│                               │  heatmap · box · waffle · waterfall      │  │
│                               │  treemap · sankey · choropleth           │  │
│                               │  geoPoint · spike · arc · grid           │  │
│                               │  cartogram · link · stackedBar           │  │
│                               │                                          │  │
│                               │  controles interactivos:                 │  │
│                               │  dropdown · slider · date picker         │  │
│                               │  filtran vía WHERE en tiempo real        │  │
│                               │                                          │  │
│                               │  export .vzc · modo presentación         │  │
│                               │  frames → dashboards compartibles        │  │
│                               └──────────────────────────────────────────┘  │
│                                                                             │
│   canvas se guarda manualmente (snapshots) a localStorage                   │
│   solo estado del canvas: nodos, edges, frames, páginas                     │
│                    │                                                         │
│                    ▼                            todos los datos              │
│         ┌──────────────────┐                   van al servidor ──────────►   │
│         │   localStorage   │                                                 │
│         │                  │                                                 │
│         │  · nodos, edges  │                                                 │
│         │  · frames        │                                                 │
│         │  · páginas       │                                                 │
│         │  · snapshots     │                                                 │
│         │                  │                                                 │
│         │  exportable como │                                                 │
│         │  archivo .vzc    │                                                 │
│         └──────────────────┘                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
                          │
                          │  HTTP — toda la gestión de datos
                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        NestJS API Server  (:3001)                            │
│                                                                              │
│  Archivos            Tablas                  Queries                        │
│  ─────────────       ──────────────────      ──────────────────────         │
│  POST /files/upload  GET    /tables           POST /query/execute           │
│  POST /files/        GET    /tables/:n/schema POST /query/execute-limited   │
│       upload-many    GET    /tables/:n/export                               │
│  GET  /files         POST   /tables/import    Analysis                      │
│  DEL  /files/:name   DELETE /tables/:n        ─────────────────────         │
│                      DELETE /tables           GET /analysis/map-flows       │
│                                                                              │
│  IA                              Usuarios / Auth                            │
│  ──────────────────              ──────────────────────────────────         │
│  POST /ai/chat                   POST   /users          (registro)          │
│  → construye system prompt       POST   /users/sign-in  (login → JWT)       │
│  → llama a Claude API            GET    /users/myProfile                    │
│  → devuelve plan de nodos        PATCH  /users/profile                      │
│                                  GET    /users           (admin)            │
│                                  PATCH  /users/:id       (admin)            │
│                                                                              │
│         ┌───────────────────────────────────────────────────────────┐       │
│         │                    DuckDB (server-side)                   │       │
│         │                                                           │       │
│         │  · recibe archivos subidos y los carga como tablas        │       │
│         │  · ejecuta todas las queries SQL del cliente              │       │
│         │  · soporta CSV · TSV · JSON · JSONL · Parquet             │       │
│         │    GeoJSON · TopoJSON                                     │       │
│         │  · devuelve 250 rows (preview) + totalRows                │       │
│         │  · persistencia en data/vizcanvas.db                      │       │
│         │  · metadata en data/meta.json                             │       │
│         │  · archivos físicos en uploads/                           │       │
│         └───────────────────────────────────────────────────────────┘       │
│                                                                              │
│         ┌─────────────────────────────┐                                      │
│         │     MongoDB Atlas            │                                      │
│         │                             │                                      │
│         │  · usuarios y roles         │                                      │
│         │  · autenticación JWT        │                                      │
│         │  · soft delete              │                                      │
│         └─────────────────────────────┘                                      │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │  solo para el chat de IA
                                   ▼
                    ┌──────────────────────────────────┐
                    │      Anthropic Claude API         │
                    │                                  │
                    │  · modelo: claude-sonnet-4-6     │
                    │  · forzado a usar tool_use       │
                    │    create_canvas_graph           │
                    │  · recibe mensajes + system      │
                    │    prompt con esquema de tablas  │
                    │    y nodos existentes            │
                    │  · devuelve JSON estructurado:   │
                    │    { nodes[], edges[], summary } │
                    │    → se aplica al canvas         │
                    │    → se ejecuta automáticamente  │
                    └──────────────────────────────────┘
```

---

## Componentes en detalle

### Canvas visual (personalizado)
Editor visual de nodos construido con componentes propios (no usa tldraw).

- Drag & drop de nodos al canvas
- Conectar nodos con edges (flechas dirigidas)
- Frames como contenedores → se exportan como dashboards compartibles
- Multipágina y undo/redo
- Modo presentación (oculta la UI, muestra solo visualizaciones)

### DAG Executor

El corazón del procesamiento de datos en el cliente. Cuando el grafo cambia, el ejecutor:

1. Calcula el orden topológico del grafo (resuelve dependencias entre nodos)
2. Traduce cada nodo a un fragmento SQL con alias (`_node_<uuid>`)
3. Construye una consulta SQL con CTEs encadenados:
   ```sql
   WITH
     "_node_<uuid-from>" AS (SELECT * FROM mi_tabla),
     "_node_<uuid-group>" AS (
       SELECT municipio, SUM(monto) AS total
       FROM "_node_<uuid-from>" GROUP BY 1
     ),
     "_node_<uuid-chart>" AS (
       SELECT * FROM "_node_<uuid-group>" ORDER BY total DESC
     )
   SELECT * FROM "_node_<uuid-chart>" LIMIT 250
   ```
4. Envía el SQL al servidor (`POST /api/query/execute-limited`)
5. Recibe las filas y las pasa al nodo de visualización correspondiente
6. Marca solo los nodos afectados por el cambio para re-ejecutarse

### DuckDB — server-side

DuckDB corre en el servidor NestJS, no en el browser.

- **Lectura nativa:** CSV, TSV, JSON, JSONL, Parquet, GeoJSON, TopoJSON
- **Persistencia:** Base de datos en disco `data/vizcanvas.db` — sobrevive reinicios del servidor
- **Metadata:** `data/meta.json` guarda nombre original, tipo y tamaño de cada tabla
- **Preview:** Devuelve hasta 250 filas por consulta + `totalRows` para paginación
- **Archivos físicos:** Guardados en `uploads/` con el nombre original sanitizado

### Zustand Stores

Estado global de la aplicación en el cliente, dividido en 5 stores:

| Store | Responsabilidad |
|-------|----------------|
| `dagStore` | Nodos, edges, estado de ejecución de cada nodo |
| `canvasStore` | Páginas del canvas, título, focusMode, snapshots |
| `dataStore` | Lista de tablas y esquemas (sincronizado desde el servidor) |
| `uiStore` | Paneles abiertos, nodo seleccionado, modo |
| `snapshots` | Historial de estados del canvas (máx. 20, para undo) |

### Visualización — Observable Plot + D3

Capa de renderizado en el cliente. Cada nodo `chart` recibe las filas devueltas por el servidor y las renderiza.

**Tipos de gráfica disponibles:**

| Categoría | Tipos |
|-----------|-------|
| Básicos | `bar`, `barX`, `barY`, `line`, `area`, `scatter`, `dot` |
| Estadísticos | `histogram`, `box`, `heatmap` |
| Proporcionales | `pie`, `waffle`, `stackedBar`, `treemap` |
| Flujo / relación | `sankey`, `waterfall`, `link` |
| Geoespaciales | `choropleth`, `geoPoint`, `spike`, `arc`, `cartogram` |
| Otros | `grid` |

Los controles interactivos (dropdown, slider, date picker) modifican un nodo `controls` que inyecta filtros `WHERE` en el SQL del DAG. Cada cambio re-ejecuta la consulta contra el servidor DuckDB.

### NestJS API Server

Servidor con estado (stateful). Gestiona archivos, tablas DuckDB, SQL, análisis, IA y usuarios.

```
Archivo subido
    │
    ▼
FilesController → DuckDB: CREATE TABLE FROM archivo
                      │
                      ├─► QueryController      (SQL libre del DAG Executor)
                      ├─► TablesController     (export / import / schema / drop)
                      ├─► AnalysisService      (sugerencias de join)
                      └─► AiService ──────────► Claude API
                                                    │
                                                    ▼
                                            plan de nodos y edges
                                            → se aplica al canvas
```

### localStorage

Guarda **solo el estado del canvas** (UI), no los datos de las tablas.

```
localStorage
├── canvas_state   → nodos, edges, páginas, frames, posiciones, tamaños
└── snapshots[]    → hasta 20 snapshots del estado del grafo (undo)
```

Los datos de las tablas viven en el servidor (DuckDB + `uploads/`). El canvas se guarda manualmente como snapshot (botón de guardado); el guardado automático periódico no está implementado aún. Se puede exportar como archivo `.vzc` para compartir o hacer backup.

---

## Flujo completo de una sesión típica

```
1. Usuario abre VizCanvas en el browser
        │
        ▼
2. Se restaura el canvas desde localStorage
   (nodos, edges, páginas — sin datos de tablas)
        │
        ▼
3. Cliente consulta GET /api/tables al servidor
   → Recupera la lista de tablas y esquemas disponibles
   → Actualiza dataStore
        │
        ▼
4. Usuario sube un CSV o GeoJSON
   → POST /api/files/upload
   → El servidor guarda el archivo en uploads/
   → DuckDB crea la tabla automáticamente
   → Respuesta incluye tableName, columns, rowCount
        │
        ▼
5. Usuario crea nodos en el canvas
   (from → group → chart)
        │
        ▼
6. DAG Executor construye la cadena de CTEs
   y envía el SQL al servidor:
   POST /api/query/execute-limited
        │
        ▼
7. DuckDB en el servidor ejecuta el SQL
   y devuelve { columns, rows, totalRows }
        │
        ▼
8. Observable Plot renderiza el resultado
   en el nodo chart del canvas
        │
        ▼
9. (Opcional) Usuario escribe en el chat IA
   → POST /api/ai/chat con contexto
     (tablas del servidor + nodos del canvas)
   → Claude devuelve plan de nodos y edges
   → El plan se aplica automáticamente al canvas
   → DAG Executor re-ejecuta los nodos nuevos
        │
        ▼
10. (Opcional) Usuario guarda snapshot manualmente
    → se persiste en localStorage
    → solo estado del canvas, no los datos de tablas
```

---

## Decisiones de diseño

| Decisión | Razón |
|----------|-------|
| DuckDB en el servidor (no WASM) | Persistencia entre sesiones, soporte para datasets grandes sin límite de memoria del browser, compartición de datos entre usuarios |
| CTEs encadenados en el DAG | Re-ejecuta solo los nodos afectados por un cambio; los nodos sin cambios reutilizan sus resultados |
| localStorage solo para estado del canvas | Los datos viven en el servidor; el cliente solo necesita guardar la configuración visual (posiciones, tamaños, qué nodos existen) |
| Observable Plot + D3 | API declarativa compatible con la salida tabular de DuckDB; soporte nativo de proyecciones geoespaciales |
| MongoDB solo para usuarios | Separa la capa de autenticación (persistente, relacional) del motor de análisis (DuckDB) |
| IA como proxy en el servidor | La clave de Anthropic no puede estar en el frontend; el servidor añade el contexto de tablas y nodos antes de llamar a Claude |
