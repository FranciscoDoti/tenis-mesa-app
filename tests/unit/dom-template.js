// Estructura estática del body (copia de index.html sin los <script>) que app.js/render() necesitan.
// Vive aparte para que tanto el setup (que la inyecta ANTES de importar app.js) como el harness
// (que la re-inyecta entre tests) usen exactamente la misma plantilla.
export const BODY = `
  <header class="topbar"><button class="menu-btn" id="menuBtn" hidden>☰</button></header>
  <div class="drawer-overlay" id="drawerOverlay" hidden></div>
  <aside class="drawer" id="drawer">
    <nav class="nav" id="nav" hidden>
      <div id="ctxBar"></div>
      <div class="nav-group" id="rankGroup">
        <button data-view="ranking" class="nav-btn nav-sub active school-scope-only">Mi escuela</button>
        <button data-view="orgrank" class="nav-btn nav-sub">Organización</button>
        <button data-view="dobles" class="nav-btn nav-sub doubles-only">Dobles</button>
        <button data-view="schools" class="nav-btn nav-sub schoolrank-only school-scope-only">Escuelas</button>
      </div>
      <button data-view="torneos" class="nav-btn">Torneos</button>
      <button data-view="historial" class="nav-btn">Cara a cara</button>
      <button data-view="noticias" class="nav-btn news-only">Noticias</button>
      <button data-view="reglamento" class="nav-btn reglamento-link">Reglamento</button>
      <button data-view="pagos" class="nav-btn mypay-only">Mis pagos</button>
      <button data-view="perfil" class="nav-btn profile-only">Mi perfil</button>
      <div class="nav-group admin-only" id="adminGroup">
        <button data-view="jugadores" class="nav-btn nav-sub">Jugadores</button>
        <button data-view="aprobaciones" class="nav-btn nav-sub">Altas</button>
        <button data-view="gimnasios" class="nav-btn nav-sub">Gimnasios</button>
        <button data-view="categorias" class="nav-btn nav-sub">Categorías</button>
        <button data-view="reportes" class="nav-btn nav-sub">Estado de pagos</button>
        <button data-view="cuentas" class="nav-btn nav-sub payments-only">Cuentas de cobro</button>
        <button data-view="pagos" class="nav-btn nav-sub payments-only">Historial de pagos</button>
        <button data-view="apariencia" class="nav-btn nav-sub">Apariencia</button>
        <button data-view="settings" class="nav-btn nav-sub">Ajustes</button>
      </div>
    </nav>
    <div class="user-area" id="userArea"></div>
  </aside>
  <main id="app"></main>
  <footer class="footer"><span class="muted" id="storeInfo"></span></footer>
  <div class="modal-overlay" id="modal" hidden><div class="modal-card" id="modalCard"></div></div>
`;
