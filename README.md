# Control de Fichadas

Web en React para leer los TXT de los relojes ProSoft de cada establecimiento y controlar si cada persona cumple su horario pactado de ingreso y egreso.

## Cómo ponerla en marcha

1. Instalá **Node.js 20 o superior** desde https://nodejs.org (versión LTS).
2. Descomprimí esta carpeta y abrí una terminal dentro de ella.
3. Instalá las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
4. Levantá la web en modo desarrollo:
   ```bash
   npm run dev
   ```
   Abrí la dirección que aparece (por defecto http://localhost:5173).
5. Para probar el motor de lectura con los archivos de ejemplo:
   ```bash
   npm test
   ```
6. Para generar la versión final:
   ```bash
   npm run build
   ```
   Queda todo en la carpeta `dist/`. Se puede subir a cualquier hosting estático (Netlify, Vercel, Cloudflare Pages, GitHub Pages) o copiar a un servidor interno (IIS, Apache, Nginx). No necesita base de datos ni backend.

## Uso diario

1. **Archivos**: arrastrá los TXT del reloj. La web detecta el formato, muestra cuántas fichadas, legajos y fechas trae, y te pide a qué establecimiento corresponde. La próxima vez que cargues un archivo con el mismo nombre se asigna solo al mismo establecimiento. Las fichadas repetidas se ignoran, así que podés cargar el mismo reloj todos los meses sin problema.
2. **Horarios**: creá los horarios pactados una vez.
   - **Fijo**: días de la semana + hora de ingreso y egreso. Admite varios bloques (horario cortado, o sábados distintos) y detecta ausencias.
   - **Rotativo**: lista de turnos posibles (por defecto Enfermería 06–14, 14–22, 22–06). Cada ingreso se asocia al turno más cercano. El turno 22–06 queda registrado en el día del ingreso y el egreso se busca al día siguiente.
   - Cada bloque puede limitarse a un establecimiento (para quien trabaja de mañana en un lugar y de tarde en otro).
3. **Personal**: completá nombre (los relojes UDISKLOG no lo traen) y sector, y asigná el horario. Podés seleccionar varios y asignar en lote, o importar un CSV con columnas `legajo;nombre;sector;horario` (el horario se busca por nombre).
4. **Fichadas**: elegí el mes, el establecimiento, el sector o el estado. Cada persona muestra su % de cumplimiento, tardanzas, salidas anticipadas, turnos incompletos y ausencias. Expandí para ver turno por turno, con los minutos de diferencia.
5. En el **Detalle** de cada persona podés cargar licencias (vacaciones, licencia médica, etc.) y fichadas manuales para olvidos.
6. **Exportar**: Excel (hojas Resumen y Detalle), CSV o Imprimir / PDF.

## Cómo interpreta las fichadas

- Las marcas repetidas dentro de 10 minutos en el mismo reloj se unen (configurable).
- Para cada ingreso se busca el turno esperado más cercano dentro de la ventana de búsqueda (3 h, configurable). El egreso es la última fichada cercana al fin de ese turno. Las marcas que quedan en el medio se muestran como «intermedias» (ej. una salida y reingreso).
- Si una fichada solo encaja con el final de un turno, se informa «Sin ingreso». Si no aparece la salida, «Sin egreso».
- Tolerancias de ingreso y egreso (10 min por defecto), umbral de horas extra y demás reglas se ajustan en **Ajustes**.
- Las ausencias solo se calculan en horarios fijos, en días cubiertos por los archivos cargados, y no cuentan feriados ni licencias.
- Sin horario asignado, cada fichada se empareja con la siguiente del mismo reloj (hasta 16 h) para mostrar las horas trabajadas.

## Integraciones incluidas

| Integración | Dónde |
|---|---|
| Lectura de AllGLog, GLog y UDISKLOG (UTF-8 o Windows-1252) | Archivos |
| Feriados nacionales automáticos (API pública Nager.Date) | Ajustes |
| Exportación a Excel (.xlsx), CSV y PDF (imprimir) | Fichadas |
| Importación y exportación de personal en CSV | Personal |
| Copia de seguridad completa en JSON | Ajustes |

## Dónde se guardan los datos

En el navegador (localStorage) de la computadora donde se usa. Esto significa:

- No hace falta servidor, y los datos no salen de la computadora.
- Cada computadora o navegador tiene sus propios datos. Para pasarlos a otra, usá **Ajustes → Descargar copia** y después **Restaurar copia** en la otra.
- Si se borra el historial del navegador se pierden: hacé una copia de seguridad cada mes.

Si más adelante necesitan que varias personas trabajen sobre los mismos datos, el paso siguiente es reemplazar `src/lib/store.js` por una base compartida (por ejemplo Supabase o Firebase). El resto de la web no cambia.

## Estructura

```
src/
  lib/parser.js     lectura de los TXT de los relojes
  lib/engine.js     motor de emparejamiento de turnos (fijos, rotativos, nocturnos)
  lib/report.js     armado del reporte y de las exportaciones
  lib/store.js      datos guardados y acciones
  lib/xlsx.js       generador de Excel sin dependencias
  lib/io.js         CSV, descargas y feriados
  views/            pantallas: Fichadas, Personal, Horarios, Archivos, Ajustes
  samples/          los dos TXT de ejemplo
tests/              pruebas del motor con los TXT reales (npm test)
```

## Supuesto importante

El número de legajo identifica a la persona en todos los relojes. Si la misma persona ficha en dos establecimientos con el mismo legajo, sus fichadas se analizan juntas. Si en algún reloj los legajos no coinciden con los de la empresa, conviene corregirlos en el reloj.
