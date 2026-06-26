# Ideas

## Funcionalidades

- [x] Implementar el sistema de puntaje usando Torneos + Partidos entre jugadores. 
- [x] Implementar el sistema que sugiera qué mesas y zonas largar .
  - [x] agregar un link en la setting para una página o un tooltip donde explique cómo funciona esta funcionalidad
  - [x] que avise qué jugadores están involucrados en cada mesa o partido de llave
- [x] Reformular el largado de mesas actual para hacerlo por zona y despues individual por llave
- [x] Implementar la funcioanlidad de pagos
- [x] Impleemntar la funcionalidad de horario estimado
- [x] Implementar un reglamento editable con opción de **publicar / despublicar**.
- [x] Implementar una sección de **Noticias**.
- [ ] Evaluar si conviene implementar la funcionalidad de **Árbitro**.
- [X] Implementar un módulo de **Reportes**.
  - [X] Reporte de jugadores que no pagaron.
- [x] que al jugador le salte un popup cuando tiene categorías que todavía no pagó y recarga la app o inicia sesión, avisandolé cuales le falta pagar, cuanto de cada una y cual es el monto total, y que esto le avise cuando inicie la categoría (es decir cuando se largue la primer mesa) 
- [x] Que el administrador pueda agregar categorías y definir sus reglas de inscripción y edad, y a cuantos sets se juega y todo eso.
- [x] Revisar lo de las reglas de sets y eso a nivel torneo o si se puede sobreescribir a nivel categorias. 
- [ ] Implementar un sisetma de Federaciones y Escuelas con ranking de escuelas, ranking intraescuelas y ranking general
- [x] Implementar un sistema de ranking para Dobles
- [x] hay distintas categorías de dobles. Entonces, hay que tener en cuenta eso para todo, para los rankings para los torneos, etc, en los jugadores vamos a tener que agregar un campo para que digan si son mujer o varon para poder usar eso para los dobles femeninos o mixtos y los rankings deberían poder mostrar por categorías de dobles (ej: dobles primera, dobles segudna, dobles mixto, dobles femenino) 
- [x] hacer que los colaboradores puedan tener más control sobre el torneo para poder editar más cosas
- [x] hacer algo para que se pueda dar por iniciada una categoría y ya no se pueda editar más y lo mismo para cerrar y lo mismo para dar por finalizado un torneo 
- [x] Implementar horarios de comienzo de categorías
- [x] Implementar algo para cdo el jugador no se presentó.
- [x] los singles tambien debería poder agregarselé regla de inscripción por género y que esas reglas efectivamente funcionen a la hora de inscribirse
- [x] el ranking de dobles que muestre un ranking por cada una de las categorías existentes ahora te muestra el ranking de invididual no de dobles si no tiene resultados que muestre algun empty state que tenga sentido
- [x] que al hacer click en la cara del jugador se abra la foto un poquito más grande y que al hacer click en su nombre te mande a su perfil por más que seas jugador (obviamente el jugador no puede editar ese perfil pero el admin sí), y en ese caso si sos jguador y estas viendo el perfil de otro jugador que haya un boton que diga Ver Historial contra este jugador que al clickearlo te mande al historial ya habinedo seleccionado ambos jugadores ) 
- [x] Bugs a arreglar
    - [x]  A veces el menú lateral se carga como topbar en celulares
    - [x] Al recargar la app te vuelve por un instante a la pagina de login incluso cuadno ya tenias la sesión iniciada y no debería
    - [x] no anda para cargar colaboradores a los torneos una vez el torneo ya está empezado
    - [x] la pantalla de inscripción del admin no te pide el mail (revisar consistencia con la de inscripción normal en cuanto a proceso y datos de entrada )
    - [x] que en el historial si un partido terminó 3-0 porque uno no se presentó que en el historial lo aclare
    - [x] lo de los sets que si es a 5 te deja cargar como que terminó 5-0 o 4-1 o sea te deja cargar como que el ganador hizo más de 3 sets

## 🚬🍄 Ideas flasheras

> Lluvia de ideas locas para el futuro (todas montadas sobre los datos que la app ya tiene). Nada está comprometido; es el cajón de las locuras.

- [ ] 🎙️ **TenisMesaTV** — modo cancha en vivo para una pantalla del gimnasio + **relator con IA** (comentarios pícaros pre-partido y al cargar resultados, opcional con voz).
- [ ] 🃏 **Figuritas del club** — cartas estilo FIFA con **OVR** derivado del Elo, foto, logo de escuela y rareza (bronce/plata/oro/leyenda); **compartibles a WhatsApp** como imagen.
- [ ] 🔮 **La Quiniela del Club** — predicciones con fichas (sin plata), **cuotas según diferencia de Elo** y ranking de pronosticadores.
- [ ] 📊 **Odds de campeón en vivo** — simulador **Monte Carlo** estilo "538" que muestra la probabilidad de cada jugador de salir campeón, actualizada con cada resultado.
- [ ] 📱 **Modo Árbitro** — el celular como **marcador en vivo** punto a punto, sincronizado a la llave; los espectadores siguen el partido desde su celu y el resultado se carga solo.
- [ ] 🎵 **Walkout** — apodo de guerra + **canción de entrada** que suena en el modo TV cuando llaman al jugador a la mesa.
- [ ] ⬆️⬇️ **Ascensos y descensos** — **liga permanente** del club por temporada con tabla acumulada y promoción/descenso entre categorías.
- [ ] 👑 **El Regicida** — **bounty** sobre el #1 del ranking: ganarle (o ganarle a alguien muy superior) da puntos bonus + medalla y avisa a todo el club.
- [ ] ⚡ **Torneo Express** — auto-armado por **check-in**: con los presentes, un botón arma un torneo con zonas balanceadas por Elo.
- [ ] 💘 **Tinder del Pong** — **matchmaking** de desafíos entre jugadores de Elo similar para amistosos entre torneos.
- [ ] 🧢 **DT del Club** — liga **fantasy**: armás un equipo de jugadores reales y sumás según cómo les va en los torneos.
- [ ] ⚔️ **El Derby (Bariloche vs Dina)** — tablero de **rivalidad histórica entre escuelas** con marcador acumulado de los cruces y contador en vivo.
- [ ] 🔊 **Sonómetro de la final** — **hype meter** que mide el ruido de la tribuna con el micrófono y corona el punto/partido más caliente.
- [ ] 🏛️ **Salón de la Fama** — récords de todos los tiempos (más títulos, racha más larga, mayor batacazo, pico de Elo, más finales). **← próxima a implementar.**
- [ ] 🎖️ **Medallero** — sistema de **logros** desbloqueables (Matagigantes, Invicto en zona, Remontada, Bicampeón, Centenario, Rey del 5° set…).
- [ ] 🔥 **Power Ranking** — ranking por **forma reciente** + mini guía de forma estilo fútbol (`G G P G G`).
- [ ] 🔮 **"¿Qué pasa si…?"** — simulador de **cruces hipotéticos**: probabilidad, marcador estimado y puntos que ganaría/perdería cada uno.
- [ ] 🤝 **Química de dobles** — analiza con qué compañero ganás más y sugiere tu **dupla ideal**.
- [ ] 📈 **El club en números** — dashboard general (partidos totales, jugador más activo, partido más largo, día más movido…) + **"dato curioso del día"** automático.
- [ ] 🎁 _Bonus:_ **Tu Año en el Club** (Wrapped estilo Spotify), **Coach IA** (scouting report personal con tus stats) y **Bot de WhatsApp** del club (postea resultados y responde `/ranking`).
