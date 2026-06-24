# Conectar la app a Firebase (Firestore + Auth)

La app funciona en dos modos:

- **Local (sin configurar)**: si `firebase-config.js` sigue con el proyecto `demo-tenis-mesa` y NO estás en `localhost`, la app usa almacenamiento local del navegador y el login simple (como antes). Útil para probar sin nube.
- **Nube (Firebase)**: con tu config real, todos los datos se guardan en **Firestore** y el login usa **Firebase Authentication** (email + contraseña).

En `localhost` la app se conecta automáticamente al **emulador** de Firebase (ver "Desarrollo local").

---

## 1. Crear el proyecto

1. Entrá a https://console.firebase.google.com/ → **Agregar proyecto** (podés desactivar Analytics).
2. **Build → Firestore Database → Crear base de datos** → modo *production* → región (ej. `southamerica-east1`).
3. **Build → Authentication → Comenzar → Sign-in method → Email/Password → Habilitar**.
4. **⚙️ Configuración del proyecto → Tus apps → Web (`</>`)** → registrá una app web y copiá el objeto `firebaseConfig`.

## 2. Pegar la config

Reemplazá el contenido de **`firebase-config.js`** con tus valores reales:

```js
window.firebaseConfig = {
  apiKey: "...",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

> Estos valores **no son secretos** (van en el navegador). La seguridad la dan las reglas.

## 3. Publicar las reglas de seguridad

En la consola: **Firestore → Reglas**, pegá el contenido de **`firestore.rules`** y **Publicar**.
(O con Firebase CLI: `firebase deploy --only firestore:rules`.)

## 4. Crear el primer admin (una sola vez)

1. **Authentication → Users → Add user**: poné un email y contraseña para el admin.
2. Copiá el **User UID** que se genera.
3. **Firestore → Iniciar colección** `users` → ID del documento = ese **UID** → campos:
   - `role` (string) = `admin`
   - `name` (string) = `Administrador`
   - `playerId` (string) = *(vacío)*
   - `email` (string) = el email del admin

## 5. Cargar los datos de ejemplo

Entrá a la app y **logueate con el admin**. Si la base está vacía, la app **siembra automáticamente** los jugadores, gimnasios y el torneo de ejemplo, y quedan guardados en Firestore.

A partir de ahí: los jugadores se **autoregistran** con email+contraseña (quedan *pendientes*), y el admin los aprueba desde **🙋 Altas**.

---

## Desarrollo local (emulador)

Requiere Node y Java 11+.

```bash
npm install -g firebase-tools
firebase emulators:start --only firestore,auth --project demo-tenis-mesa
```

Serví los archivos estáticos (ej. `python -m http.server 8765`) y abrí `http://localhost:8765`.
En `localhost` la app se conecta sola al emulador (Auth `:9099`, Firestore `:8080`, UI `:4000`).

---

## Notas

- **Fotos**: se guardan como imagen comprimida dentro del documento de cada jugador (no en Storage), así que no hace falta configurar Storage.
- **Rechazar un alta** borra el jugador y su perfil de `users`, pero la cuenta de **Authentication** queda huérfana; si querés, borrala a mano desde **Authentication → Users**.
- **Plan gratis (Spark)** alcanza de sobra para un club; no hace falta tarjeta.
