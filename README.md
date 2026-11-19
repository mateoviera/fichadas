# Gestión de Personal

Sistema web (React) de gestión de empleados: legajos, horarios, vacaciones y solicitudes, y control de fichadas a partir de los TXT de los relojes ProSoft de cada establecimiento.

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

La app tiene cuatro secciones:

1. **Personal**: todo el personal con apellido, nombre, legajo, DNI, puesto, horario, antigüedad, grupo y **última modificación** (cuándo y quién). Se puede buscar, filtrar por sector o estado (activos / de baja), asignar en lote, importar y exportar CSV, agregar personas y abrir la **ficha** de cada una:
   - **Datos**: apellido y nombre por separado, DNI, CUIL, nacimiento, contacto, puesto, sector, fecha de ingreso (antigüedad) y de baja, grupo de vacaciones y notas.
   - **Horario**: elegir un modelo o crear un horario propio y editarlo ahí mismo.
   - **Vacaciones y solicitudes**: saldo del año y solicitudes de la persona.
   - **Fichadas manuales**: para olvidos o fallas del reloj.
   - Al pie: última modificación, **Dar de baja** (deja de aparecer en Fichadas) y **Eliminar**.
2. **Fichadas**: elegí el mes, el establecimiento, el sector o el estado. Arriba se ven solo cinco números (cumplimiento, llegadas tarde, salidas antes de hora, falta entrada o salida, ausencias) con una explicación plegable. Al abrir una persona se ven sus horas (trabajadas, las que debía trabajar y la diferencia) y el detalle día por día. Exporta a Excel, CSV o PDF.
3. **Vacaciones y solicitudes**: vacaciones, días particulares, francos, licencias y permisos por horas.
   - **Calendario** interactivo por grupo: tocá un día y después otro en la fila de una persona para cargar una solicitud; tocá una solicitud para verla o cambiarla. Cada grupo muestra cuántas personas faltan cada día contra el máximo permitido.
   - **Solicitudes**: lista con filtros, aprobar / rechazar y última modificación.
   - **Grupos**: cuántas personas pueden faltar a la vez (o «sin control»), con prioridad por antigüedad.
   - Si algo no corresponde (se pisa con alguien del grupo, supera los días de vacaciones según la LCT, ya tiene otra solicitud, está fuera de la fecha de ingreso o de baja), aparece un **aviso** con el motivo que pregunta si se quiere hacer igual; si se acepta queda marcado como **excepción**.
   - Solo las solicitudes aprobadas de días completos excusan ausencias en Fichadas.
4. **Configuración**:
   - **Horarios**: modelos compartidos. **Fijo** (días y horas, detecta ausencias, varios bloques, egreso el mismo día, al siguiente o a los 2 días para guardias de 48 h) o **Rotativo** (cada fichada se asocia al turno más cercano; las horas esperadas del mes son del día 1 al anteúltimo menos 6 francos —1, 2, 1 y 2 por semana— descontando licencias aprobadas). Cada bloque puede limitarse a un establecimiento.
   - **Archivos del reloj**: arrastrá los TXT. Se detecta el formato y se pide el establecimiento (se recuerda por nombre de archivo). Las fichadas repetidas se ignoran.
   - **Ajustes**: tolerancias, feriados y copias de seguridad.

Los días de vacaciones se calculan según la LCT: 14, 21, 28 o 35 días corridos según la antigüedad al 31/12; si ingresó en el año y no trabajó la mitad, 1 día cada 20 hábiles.

## Cómo interpreta las fichadas

- Las marcas repetidas dentro de 10 minutos en el mismo reloj se unen (configurable).
- Para cada ingreso se busca el turno esperado más cercano dentro de la ventana de búsqueda (3 h, configurable). El egreso es la última fichada cercana al fin de ese turno. Las marcas que quedan en el medio se muestran como «intermedias» (ej. una salida y reingreso).
- Si una fichada solo encaja con el final de un turno, se informa «Sin ingreso». Si no aparece la salida, «Sin egreso».
- Tolerancias de ingreso y egreso (10 min por defecto), umbral de horas extra y demás reglas se ajustan en **Ajustes**.
- Las ausencias solo se calculan en horarios fijos (en rotativos se comparan las horas del mes), en días cubiertos por los archivos cargados, y no cuentan feriados ni licencias.
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

Para que varias personas trabajen sobre los mismos datos, la app puede guardar en **Supabase** (en la nube o en una PC de la empresa con Docker). Se activa completando `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; sin esas variables sigue funcionando en el navegador como siempre. Paso a paso en [docs/BACKEND.md](docs/BACKEND.md).

## Estructura

```
src/
  lib/parser.js     lectura de los TXT de los relojes
  lib/engine.js     motor de emparejamiento de turnos (fijos, rotativos, nocturnos)
  lib/report.js     armado del reporte y de las exportaciones
  lib/store.js      datos guardados y acciones
  lib/xlsx.js       generador de Excel sin dependencias
  lib/io.js         CSV, descargas y feriados
  lib/personal.js   antigüedad, vacaciones (LCT), tipos de solicitud, superposición y avisos
  lib/schedule.js   textos legibles de los horarios
  components/       diálogos, ventana de solicitud y piezas comunes
  views/            pantallas: Personal (y ficha), Fichadas, Vacaciones y solicitudes, Horarios, Archivos, Ajustes
  samples/          los dos TXT de ejemplo
tests/              pruebas del motor con los TXT reales (npm test)
```

## Supuesto importante

El número de legajo identifica a la persona en todos los relojes. Si la misma persona ficha en dos establecimientos con el mismo legajo, sus fichadas se analizan juntas. Si en algún reloj los legajos no coinciden con los de la empresa, conviene corregirlos en el reloj.
