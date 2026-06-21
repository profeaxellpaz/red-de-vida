# Registro del problema: "Entrando..." no avanza al iniciar sesión

## Síntoma reportado
El usuario escribe la clave correcta (`reddevida2026`), presiona **Entrar**, el botón cambia a "Entrando..." y se queda así indefinidamente. Pasó en navegación normal y también en modo privado/incógnito. Ocurrió varias veces, incluso después de varios intentos de arreglo.

## Diagnóstico de fondo (lo verificado, no supuesto)
Antes de tocar más código, se verificó cada capa por separado para no volver a adivinar:

1. **Backend (Supabase) — verificado con `curl` directo, sin pasar por el navegador.**
   Login contra `https://yhhatkyrwnnhpewbnqil.supabase.co/auth/v1/token` responde en **0.95 segundos** con un token válido. Conclusión: el servidor, la base de datos, la confirmación del usuario y la contraseña están perfectamente bien. **El backend nunca fue la causa.**

2. **Código publicado en GitHub Pages — verificado con `curl` contra el sitio en vivo.**
   `index.html` y `js/app.js` en producción ya contenían el fix anterior (timeout de 15s, manejo de errores, "versión 13", service worker "kill switch"). Es decir, lo que está en el servidor está correcto.

3. **Cabeceras HTTP de GitHub Pages — aquí apareció la pista real.**
   ```
   Cache-Control: max-age=600
   ```
   GitHub Pages le dice al navegador que puede reusar `js/app.js`, `index.html`, etc. **hasta 10 minutos** sin volver a preguntarle al servidor. Como las etiquetas `<script src="js/app.js">` no tenían ningún parámetro de versión, un navegador (o una pestaña/PWA que quedó abierta de una sesión anterior) podía seguir usando una copia del código **anterior al arreglo**, sin enterarse nunca de que había una versión nueva. El "kill switch" del service worker (hecho en el intento anterior) limpia la caché del *Service Worker*, pero no tiene ningún efecto sobre la caché HTTP normal del navegador para archivos `.js`/`.css`/`.html`.

## Por qué esto explica el síntoma exacto
El código que el usuario probablemente seguía ejecutando era una versión **sin el timeout de 15 segundos** (ese fix se agregó en un intento anterior). Sin ese timeout, si la promesa de login no se resuelve por cualquier motivo del lado del navegador (extensión, antivirus, "Tracking Prevention", etc.), no hay ningún mecanismo que la rescate — se queda en "Entrando..." para siempre, exactamente como se reportó. Con el timeout puesto, lo máximo que debería tardar en mostrar **algún** mensaje (éxito o error) son 15 segundos.

## Todo lo que se intentó, en orden (para no repetir pasos)
1. Service worker con estrategia *cache-first* → causaba que se sirvieran respuestas viejas de la API. Se cambió a *network-first* para llamadas propias y se excluyó `*.supabase.co` de la caché.
2. Sospecha de bloqueo de CDN externo (`cdn.jsdelivr.net`) por "Tracking Prevention" de Edge → se confirmó en DevTools del usuario y se solucionó copiando la librería de Supabase localmente (`js/vendor/supabase.js`), ya no se carga desde un CDN externo.
3. Sospecha de bloqueo del **Web Locks API** usado internamente por `supabase-js` (causa típica de cuelgues silenciosos) → se configuró el cliente con `lock: (_n, _t, fn) => fn()` para evitarlo por completo, y un `storage` con respaldo en memoria si `localStorage` falla.
4. Se agregó un **timeout de 15 segundos** (`Promise.race`) alrededor de `Auth.login()` para que, pase lo que pase, el usuario vea un mensaje en vez de quedarse pegado.
5. Se detectó (por captura de pantalla del usuario) un error de `refresh_token` con estado 400 y que la versión visible en pantalla no coincidía con la última publicada → confirmaba que el navegador seguía con código viejo. Se reescribió `service-worker.js` como un **"kill switch"**: borra toda la caché del Service Worker, se desregistra solo y fuerza recarga. Se quitó el registro de cualquier Service Worker nuevo en `app.js`. Se envolvió la verificación de sesión inicial en `try/catch` para que un token viejo inválido no rompa el arranque.
6. **(Este registro)** Se detectó que el "kill switch" no resuelve la caché HTTP normal del navegador (`Cache-Control: max-age=600` de GitHub Pages) porque las URLs de los `<script>`/`<link>` no tenían versión. Se agregó *cache-busting* real: `?v=14` en todos los `<script src>` y `<link href>` de `index.html`. Esto obliga al navegador a pedir el archivo nuevo sin importar la caché vieja, sin depender de que el usuario haga un refresco forzado.
7. Se agregó un botón visible **"¿No entra? Forzar actualización"** en la pantalla de login como red de seguridad manual: desregistra cualquier Service Worker, borra toda caché del navegador accesible por JS, y recarga la página con un parámetro anti-caché. Así, si en el futuro algo similar vuelve a pasar, el usuario tiene un botón con el que se puede recuperar solo, sin depender de que se le explique cómo hacer `Ctrl+Shift+R`.

## Verificación hecha
- Se probó el flujo de login real en el entorno de previsualización: con un clic real al botón, `Auth.login()` responde sin error y la app pasa de la pantalla de login a "Inicio" en aproximadamente 3 segundos.
- Se confirmó por `curl` que `js/app.js` en producción contenía el código esperado (con el timeout) antes de este cambio — es decir, el problema no era que el código en el servidor estuviera mal, sino que **no llegaba** al navegador del usuario a tiempo.

## Actualización: falló en TRES dispositivos distintos (wifi y datos móviles)
El usuario probó en tres dispositivos diferentes, mezclando wifi y datos móviles, y le pasó lo mismo en todos. Eso **descarta** que sea caché de un solo navegador o un bloqueo de una sola red/firewall (si fuera de red, no fallaría igual en datos móviles).

Dato clave obtenido al preguntar directamente: **en todos los intentos esperaron menos de 15 segundos** antes de rendirse. El sistema tiene un timeout de 15s que SIEMPRE muestra un mensaje (de éxito o de error) como máximo a los 15s — si sueltan antes, es indistinguible (para el usuario) entre "está realmente colgado" y "solo está tardando unos segundos de más en una red móvil real, más lenta que un entorno de prueba". El texto fijo "Entrando..." no daba ninguna pista de que seguía trabajando, así que parecía congelado en ambos casos.

**Fix aplicado (commit `b2e36ea`):** el mensaje ahora muestra los segundos transcurridos en vivo, ej. "Entrando... (4s) espere, no cierre la pantalla", para que se note que el sistema sigue intentando y no luce como un cuelgue. Publicado y confirmado en producción.

## Qué falta verificar con el usuario (pendiente, AHORA más importante que antes)
- [ ] **Prueba decisiva pendiente**: pedirle que intente entrar UNA vez más, sin tocar nada más, y que **cuente en voz alta hasta 20** sin soltar la pantalla, anotando exactamente qué dice el mensaje en el segundo 5, en el 15 y en el 20. Si en el segundo 15-16 aparece un mensaje de error claro (p. ej. "No hubo respuesta de la nube en 15s..."), confirma que el problema era de paciencia/percepción, no un cuelgue real, y el contador de segundos ya lo resuelve. Si pasan los 20 segundos sin ningún cambio en el texto, eso sí sería un cuelgue real y hay que seguir investigando (sería la primera confirmación de un cuelgue genuino más allá del timeout).
- [ ] Confirmar que ve **"versión 14"** en la pantalla de login (para asegurarnos de que tiene el código con el contador de segundos).
- [ ] Si por alguna razón sigue sin entrar, pedirle que toque **"¿No entra? Forzar actualización"** y lo intente de nuevo.
- [ ] Recordatorio pendiente desde antes: **revocar el Personal Access Token de Supabase** (`sbp_42ce...`) que se usó temporalmente para confirmar el correo del usuario del sistema, en https://supabase.com/dashboard/account/tokens — no confirmado aún que se haya hecho.

## Aprendizaje para no repetir el error
Cuando se publica un sitio estático (GitHub Pages, Netlify, etc.) con archivos JS/CSS referenciados sin versión en la URL, **cualquier arreglo posterior puede tardar hasta el tiempo de `max-age` (o más, si el navegador no revalida) en llegar a usuarios que ya tenían el sitio abierto o cacheado**. La solución correcta no es solo "matar" el Service Worker — hay que versionar también las URLs de los assets (`?v=N` o hash de contenido) para que cada despliegue sea inequívocamente una URL nueva. Esto debe mantenerse de ahora en adelante: **cada vez que se publique un cambio en `index.html`, `app.js`, `cloud.js` o `styles.css`, subir el número de versión en las URLs** (y, ya que estamos, en el texto visible "versión N" de la pantalla de login, que sirve como comprobación rápida en capturas de pantalla del usuario).
