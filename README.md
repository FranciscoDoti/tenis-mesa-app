# 🏓 Tenis de Mesa — Dina Huapi & Bariloche (MVP)

App web para administrar el tenis de mesa local: ranking por categorías, jugadores, torneos con reglas y armado automático de grupos. Roles **administrador** (gestiona todo) y **jugador** (solo ve).

## ▶️ Cómo correrlo (sin instalar nada)

**Opción rápida:** doble clic en **`index.html`** → se abre en el navegador. Listo.

**Opción recomendada** (algunas cosas andan mejor con un server local):

```bash
# con Node
npx serve .
# o con Python
python -m http.server 8080
```

Luego abrí `http://localhost:8080`.

## 👤 Usuarios de prueba

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin` | Administrador — alta/baja de jugadores, crear torneos, inscribir, armar grupos |
| `jugador` | `jugador` | Jugador — solo ve ranking, torneos y grupos |

## ✨ Qué incluye el MVP

- **Ranking** por categoría (1ra, 2da, 3ra, 4ta), ordenado por puntos, con foto, localidad y edad.
- **Jugadores** (admin): inscribir con datos básicos + **foto** (se redimensiona sola), editar y eliminar.
- **Torneos**: crear con **fecha** y **reglas** — partidos al mejor de **3 o 5 sets**, **mín/máx por grupo** (default 3–4).
- **Inscripción** de jugadores al torneo y **armado automático de grupos** (distribución *snake* sembrada por ranking, respetando mín/máx; avisa si no se puede con esa cantidad).
- **Visualización para todos** de torneos y grupos.
- Estética con tema de tenis de mesa (mesa verde, pelota naranja, paleta roja) y logo propio.

## 🗄️ Sobre los datos (importante)

Este MVP guarda todo en **`localStorage` del navegador** — cero setup, ideal para verlo ya. Implicancias:
- Los datos viven **en ese navegador/equipo** (no se comparten entre dispositivos todavía).
- Las fotos se guardan redimensionadas dentro del navegador.

**Siguiente paso de base de datos (a elegir):**
- **SQLite + un backend chico (Node)** — gratis, local, datos compartidos en la red del club. *Mi recomendación para datos reales.*
- **Firebase (plan Spark)** — gratis para uso chico y da nube/multi-dispositivo y login real, pero suma setup de cuenta y deja de ser 100% local.

## 🛣️ Roadmap sugerido (para tus mejoras)

- Cargar **resultados de partidos** y tabla de posiciones por grupo.
- **Llaves/playoffs** tras la fase de grupos.
- Login real + recuperación de contraseña (hoy es un login simple de MVP, **no seguro**).
- Backend + DB compartida (SQLite o Firebase).
- Historial de torneos y **actualización automática de puntos** del ranking según resultados.
- Exportar/Importar datos (backup).

> Nota: el login del MVP es solo para separar vistas admin/jugador; las contraseñas están en texto plano en el código y **no** es seguro para producción.
