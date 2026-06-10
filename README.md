# Pizarra — Prof. Baldemar

Pizarra infinita en vivo, lista para desplegar en cualquier host con Docker (probada con **EasyPanel**).

- 🎨 Dibujo, formas, flechas, texto, notas, imágenes, láser, resaltador
- 📐 Selección múltiple, redimensionar, alinear, rellenos tipo Excalidraw
- 🗂️ Espacios y pizarras (carpetas con archivos)
- 📡 Modo espectador EN VIVO — solo lectura, ven tu cursor y todo lo que dibujas
- 💾 Guardado local; preparado para conectar a **Directus**

---

## 1. Subir a GitHub

```bash
# desde la raíz del proyecto
git init
git add .
git commit -m "Pizarra Prof. Baldemar - primera versión"

# crea un repo nuevo en https://github.com/new (en blanco, sin README)
# después:
git branch -M main
git remote add origin https://github.com/TU-USUARIO/pizarra-baldemar.git
git push -u origin main
```

> Si te pide login en `git push`, usa un **Personal Access Token** de GitHub
> (Settings → Developer settings → Tokens).

---

## 2. Desplegar en EasyPanel

1. Entra a tu EasyPanel y crea un **nuevo proyecto** (o usa uno existente).
2. **Add Service → App**.
3. **Source = GitHub** → conecta tu cuenta si no lo has hecho y selecciona el repo `pizarra-baldemar`, rama `main`.
4. **Build:**
   - Method: **Dockerfile**
   - Dockerfile path: `Dockerfile` (default)
5. **Domain:** asigna el subdominio que quieras (ej. `pizarra.tudominio.com`) y activa HTTPS.
6. Click **Deploy**. EasyPanel construye la imagen, levanta el contenedor y queda servido en el puerto 80.

Cada `git push` a `main` redepliega automáticamente si dejas el auto-deploy activado.

---

## 3. Conectar Directus (guardar pizarras en tu servidor)

Ya tienes Directus en EasyPanel. Pasos:

### a) Crear la colección en Directus

En el admin de Directus → **Settings → Data Model → Create Collection**:

- **Nombre:** `boards`
- **Campos:**

| Campo        | Tipo                 | Notas                      |
|--------------|----------------------|----------------------------|
| `id`         | UUID (primary)       | auto                       |
| `name`       | String               | nombre de la pizarra       |
| `workspace`  | String               | id del espacio             |
| `shapes`     | JSON                 | el contenido de la pizarra |
| `cam`        | JSON                 | posición/zoom de la cámara |
| `bg`         | String               | dots/grid/lines/blank      |
| `created_at` | Timestamp (created)  | auto                       |
| `updated_at` | Timestamp (updated)  | auto                       |

Opcional: crea otra colección `workspaces` con `id`, `name` para los espacios.

### b) Permisos

En **Settings → Access Control**, crea un rol `pizarra` (o usa Public si vas a hacerlo público) y dale permisos de **read/create/update** en `boards`.

Genera un **Token estático** para ese rol (o login con email/password) — lo usarás en el frontend.

### c) Cablear el frontend

Abre `public/assets/wb-core.js` y busca el comentario `TODO Directus`. Cámbialo por:

```js
const DIRECTUS_URL = 'https://directus.tudominio.com';
const DIRECTUS_TOKEN = 'TU_TOKEN_ESTATICO';

fetch(`${DIRECTUS_URL}/items/boards/${b.id}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DIRECTUS_TOKEN}`
  },
  body: JSON.stringify({
    name: b.name,
    workspace: b.wsId,
    shapes: WB.shapes,
    cam: WB.cam,
    bg: WB.bg,
  })
});
```

Lo mismo para cargar al iniciar: `GET /items/boards?filter[workspace][_eq]=...`

---

## 4. Tiempo real (en vivo) — siguiente paso

Hay tres opciones, de menor a mayor esfuerzo:

1. **Directus Realtime (WebSocket)** — Directus ya trae un servidor WS. Te suscribes a cambios en `boards` y el espectador ve los `shapes` actualizados. **Recomendado** porque ya tienes Directus.
2. **Un servicio Node aparte (Socket.IO / ws)** — más control, pero un servicio más que mantener.
3. **Solo polling** (refrescar cada 1-2 s) — fácil pero no es tan fluido.

Cuando estés listo te lo cableo. Lo más cómodo: dejarlo con Directus Realtime.

---

## 5. Estructura del repo

```
.
├── Dockerfile          ← imagen nginx para EasyPanel
├── nginx.conf          ← config del servidor web
├── public/             ← lo que se sirve
│   ├── index.html
│   └── assets/
│       ├── wb.css
│       ├── wb-core.js
│       ├── wb-tools.js
│       └── wb-ui.js
├── .gitignore
└── README.md
```

---

## Atajos útiles

| Tecla            | Acción                       |
|------------------|------------------------------|
| `V`              | Seleccionar                  |
| `M` / espacio    | Mover pizarra                |
| `D`              | Lápiz                        |
| `H`              | Resaltador                   |
| `E`              | Goma                         |
| `T`              | Texto                        |
| `N`              | Nota adhesiva                |
| `R / O / A / L`  | Rectángulo / Elipse / Flecha / Línea |
| `X`              | Láser                        |
| `Esc`            | Volver a Seleccionar         |
| `⌘/Ctrl + Z / ⇧Z`| Deshacer / Rehacer           |
| `⌘/Ctrl + A`     | Seleccionar todo             |
| `⌘/Ctrl + C/V/X` | Copiar / Pegar / Cortar      |
| `⌘/Ctrl + D`     | Duplicar                     |
| `Alt + arrastrar`| Duplicar al arrastrar        |
| `⌘/Ctrl + scroll`| Zoom                         |
| `Supr`           | Borrar selección             |
