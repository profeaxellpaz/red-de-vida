# Red de Vida — Control de Asistencia

Aplicación web instalable (PWA) para registrar asistencia, entradas/salidas y llegadas tardías de colaboradores. **Funciona 100% sin internet**: los datos se guardan dentro del propio teléfono o computadora.

## Características
- 🏠 **Inicio**: resumen y próximo evento.
- 📅 **Eventos**: el usuario crea cada actividad con **nombre, fecha, hora de entrada/salida y tolerancia** (Ej: "Escuela de Formación 7:00–9:00 pm", "Celebración General domingo 9:50–11:45 am").
- 🕒 **Pasar lista** (dentro de cada evento): el encargado marca **entrada/salida manualmente** por colaborador; la tardía se calcula contra el horario del evento. Permite editar horas y marcar **ausente**.
- 👥 **Equipo**: alta/edición/baja de colaboradores (nombre, cédula, puesto).
- 📊 **Reportes**: filtro por evento, colaborador y rango de fechas + exportación a **CSV** (se abre en Excel).
- ⚙️ **Ajustes**: nombre de empresa, tolerancia por defecto, **respaldo/restauración** de datos y borrado total.

## Cómo usarla

### En el celular (recomendado)
1. Copia esta carpeta a un servidor o ábrela vía un enlace local.
2. Abre `index.html` en el navegador del celular (Chrome/Safari).
3. Menú del navegador → **"Agregar a pantalla de inicio" / "Instalar app"**.
4. Listo: queda como una app y funciona sin conexión.

> Las PWA requieren `https://` o `localhost` para instalarse y guardar caché offline. Abrir el archivo directo con `file://` funciona para probar, pero para instalación real publícala (o usa un servidor local).

### Probar en la computadora
Con Node instalado, desde esta carpeta:
```bash
npx serve .
```
Luego abre la dirección `http://localhost:3000` (o la que indique).

Sin Node, con Python:
```bash
python -m http.server 8000
```
Y abre `http://localhost:8000`.

## Primeros pasos
1. Ve a **Ajustes** → escribe el nombre de la empresa y la tolerancia por defecto.
2. Ve a **Equipo** → agrega colaboradores.
3. Ve a **Eventos** → crea un evento (nombre, fecha, horario).
4. En el evento, **Pasar lista**: marca entrada/salida de cada quien. Haz un **respaldo** periódico desde Ajustes.

## Datos y respaldos
- Todo se guarda en **IndexedDB** del dispositivo. No se envía a ningún servidor.
- Borrar los datos del navegador/app **elimina la información**. Haz respaldos `.json` con frecuencia (Ajustes → Descargar respaldo).

## Estructura
```
index.html            Estructura de la app
css/styles.css        Estilos (móvil primero)
js/db.js              Base de datos local (IndexedDB)
js/app.js             Lógica: vistas, marcaje, reportes, respaldos
manifest.json         Configuración PWA
service-worker.js     Caché para funcionamiento offline
icons/                Íconos de la app
```
