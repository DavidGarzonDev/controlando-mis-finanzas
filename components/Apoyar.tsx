'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Heart, Star } from 'lucide-react';
import { PROYECTO, metodosDonacion } from '@/lib/proyecto';

/** "Apoya Pilas": la app es gratis; quien quiera puede invitar un tinto. */
export function Apoyar() {
  const metodos = metodosDonacion();
  const [copiado, setCopiado] = useState<string | null>(null);
  return (
    <section aria-labelledby="t-apoyar" className="apoyar" id="apoyar">
      <div className="apoyar-cab">
        <span className="apoyar-ico" aria-hidden><Heart size={22} /></span>
        <div>
          <h2 id="t-apoyar">Apoya {PROYECTO.nombre}</h2>
          <p>
            {PROYECTO.nombre} es gratis y de código abierto. Si te ayuda a llevar tus cuentas, puedes invitarme un tinto ☕
            para seguir mejorándolo. Cualquier aporte suma, y una estrella en GitHub también ayuda.
          </p>
        </div>
      </div>
      {metodos.length > 0 && (
        <ul className="apoyar-metodos">
          {metodos.map((m) => (
            <li key={m.id}>
              <span><small>{m.nombre}</small><b>{m.valor}</b></span>
              {m.enlace ? (
                <a className="btn chico" href={m.enlace} target="_blank" rel="noopener noreferrer">
                  Abrir <ExternalLink size={14} aria-hidden />
                </a>
              ) : (
                <button className="btn chico" onClick={async () => {
                  await navigator.clipboard?.writeText(m.valor).catch(() => {});
                  setCopiado(m.id);
                  setTimeout(() => setCopiado(null), 1600);
                }}>
                  {copiado === m.id ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copiado === m.id ? 'Copiado' : 'Copiar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <a className="btn" href={PROYECTO.repo} target="_blank" rel="noopener noreferrer">
        <Star size={16} aria-hidden /> Dale una estrella en GitHub
      </a>
      <p className="sub">
        Software libre bajo licencia <a href={`${PROYECTO.repo}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">{PROYECTO.licencia}</a>:
        puedes ver, usar y mejorar el <a href={PROYECTO.repo} target="_blank" rel="noopener noreferrer">código fuente</a>.
      </p>
    </section>
  );
}
