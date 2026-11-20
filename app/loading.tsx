/** Mientras carga el mes: la silueta de la página, para que nada salte cuando llegan los datos. */
export default function Cargando() {
  return (
    <div className="app cargando" aria-busy="true" aria-label="Cargando tus finanzas">
      <div className="aurora" aria-hidden />
      <aside className="lateral">
        <div className="marca">
          <span className="esq esq-logo" />
          <span className="esq esq-linea" style={{ width: 110 }} />
        </div>
        <div className="esq-nav solo-escritorio">
          {[0, 1, 2, 3].map((i) => <span key={i} className="esq esq-linea" />)}
        </div>
      </aside>
      <div className="contenido">
        <header className="barra">
          <div className="barra-titulo">
            <span className="esq esq-linea" style={{ width: 160, height: 26 }} />
            <span className="esq esq-linea" style={{ width: 120 }} />
          </div>
        </header>
        <div className="bento">
          <div className="esq esq-hero" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="esq esq-ficha" />)}
        </div>
        <div className="rejilla">
          <div className="col-principal">
            <div className="esq esq-bloque" style={{ height: 280 }} />
            <div className="esq esq-bloque" style={{ height: 220 }} />
          </div>
          <div className="col-lateral">
            <div className="esq esq-bloque" style={{ height: 200 }} />
            <div className="esq esq-bloque" style={{ height: 240 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
