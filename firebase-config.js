/* ─────────────────────────────────────────────────────────────────────────
   Configuración de Firebase.

   👉 PARA PRODUCCIÓN: reemplazá este objeto por la config de TU proyecto
      (Firebase Console → ⚙️ Configuración del proyecto → "Tus apps" → Web).
      Estos valores NO son secretos (la seguridad va por las reglas de Firestore).

   En desarrollo local (localhost) la app se conecta automáticamente al
   emulador de Firebase, así que con esta config "demo" alcanza para probar.
   Mientras el projectId siga siendo "demo-tenis-mesa" y NO estés en localhost,
   la app sigue funcionando con almacenamiento local (sin nube).
   ───────────────────────────────────────────────────────────────────────── */
window.firebaseConfig = {
  apiKey: "demo-api-key",
  authDomain: "demo-tenis-mesa.firebaseapp.com",
  projectId: "demo-tenis-mesa",
  storageBucket: "demo-tenis-mesa.appspot.com",
  messagingSenderId: "0",
  appId: "demo-app-id"
};
