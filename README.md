# Tablero financiero Eleganza Academia

Tablero web de una sola página con los resultados reales por sede de Eleganza Academia (CEINDER S.A.S., 24 sedes) frente al Plan Financiero 2027. Lo preparó Daniel Financiero · DiCi y usa su identidad visual. Se abre desde un link con una clave. Los datos van cifrados en el repositorio: sin la clave no se pueden leer.

## Qué muestra

| # | Sección | Contenido |
|---|---------|-----------|
| — | Resumen | Lectura automática del mes en prosa e indicadores: ingresos, margen de contribución, gastos fijos de sede, pauta sobre ventas, utilidad de gestión, punto de equilibrio con margen de seguridad, y sedes con utilidad (u ocupación de franjas cuando se elige una sede). |
| 01 | Estado de resultados de gestión | Real, % sobre ventas, plan del mes, variación contra el plan y contra el mes anterior. Los no recurrentes, las compras de activos y la utilidad neta para socios aparecen aparte. |
| 02 | Capacidad y ocupación | Por sede: salones (hoy, 2027 y posibles), franjas, cupos, grupos activos, estudiantes activos, ocupación de franjas y de cupos, grupos que se pueden habilitar, deserción, CAC y cursos asignados. |
| 03 | Presupuesto vs ejecución | Presupuesto vigente frente al real del mes por línea de gasto y por sede, con % de ejecución y desviación. |
| 04 | Tendencia | Ingresos y utilidad por mes, real contra plan, y el acumulado 2027 contra el plan desde enero. |
| 05 | Sedes | Ranking de las 24 sedes con utilidad, margen y variación contra el plan. Al hacer clic en una sede, todo el tablero se filtra por ella. |
| 06 | Gastos | Categorías contra la referencia y las 15 cuentas de mayor gasto del mes. |
| 07 | Plan 2027 | Presupuesto vigente y los tres escenarios presentados (base, ajustado, sin kit y sin aumento), con el plan mensual: grupos enteros, inscritos y estudiantes activos. |
| 08 | Decisiones del 19-nov | Acuerdos de la reunión y su efecto en la utilidad, próximos pasos con responsable y estado, y sedes críticas con su utilidad base, ajustada y vigente. |
| 09 | Sedes nuevas e inversión | Inversión inicial más 3 meses de fijos como capital de trabajo, utilidad 2027 y en año pleno, meses en pérdida, recuperación, VPN y TIR frente al CDT, plazo máximo en pérdida y criterio de expansión. |

Los filtros de la barra superior son **Sede**, **Mes** (meses reales y meses del plan) y **Comparar con** (presupuesto vigente o uno de los escenarios del plan).

## Parámetros (back editable)

El botón **Parámetros** abre la base que alimenta todo el tablero:

- **Por sede:**
  - Capacidad: salones habilitados, salones posibles, grupos activos, estudiantes activos y deserción.
  - Plan 2027: salones, ocupación objetivo, CAC, incremento de precio y si entrega kit.
  - Presupuesto mensual de gastos fijos por línea.
  - Cursos asignados: grupos, estudiantes y programados por curso.
  - Apertura, inversión inicial y nota.
- **Generales:**
  - Capacidad: franjas por salón, cupo por grupo y tope de ocupación.
  - Precio: incremento efectivo y del plan base.
  - Proyección: meses de rampa.
  - Evaluación de inversión: tasa del CDT, meses de capital de trabajo, horizonte y corte de datos.
  - Reglas de expansión y cierre: ocupación para expandir, meses de maduración y plazo máximo en pérdida.

**Aplicar cambios** recalcula el tablero en la sesión. **Guardar y descargar** genera el `dataset.json` cifrado, que se sube a GitHub igual que en la carga mensual. **Restablecer sede** vuelve a los valores iniciales. El estado de los próximos pasos también se guarda así.

La base inicial sale de dos fuentes: la hoja Sedes del Plan Financiero 2027 y los datos del Power BI con corte a noviembre de 2026 (estudiantes activos y grupos por curso). Ya trae cargadas las decisiones del 19 de noviembre:

- Incremento efectivo de 4,2% en cuotas.
- Barrancabermeja: 2 salones, media renta, medios servicios y una persona menos.
- Sincelejo: sin kit, sin aumento y 60% de ocupación.
- Venecia y Zipaquirá: 60% de ocupación.

Se regenera con `python3 tools/export_params.py <Plan.xlsx> <carpeta pbi>`.

### Presupuesto vigente

Es el plan base recalculado con los parámetros de cada sede, en este orden:

1. **Factor de volumen** = (salones 2027 × franjas por salón × ocupación objetivo) ÷ (franjas del plan × ocupación del plan).
2. **Inscritos nuevos y pauta** cambian desde enero. La pauta también se ajusta por el CAC del parámetro frente al del plan.
3. **Ingresos, costos variables, estudiantes y grupos activos** llegan al nuevo volumen de forma gradual, en los meses de rampa (4 por defecto).
4. **Precio**: se interpola entre el escenario sin aumento y el plan base según el incremento.
5. **Kit**: se toma el costo variable del plan base (con kit) o del escenario sin kit.
6. **Fijos** salen del presupuesto de la sede. El **corporativo y los financieros** son los del plan base.

Validación: con los parámetros sin cambios reproduce exactamente el plan base y el escenario sin kit. Con la ocupación ajustada de las sedes críticas queda dentro de 3% del plan ajustado. La diferencia viene de que el Excel trabaja con grupos enteros. La cifra oficial por sede sigue siendo la del Excel; el tablero sirve para simular y hacer seguimiento.

## Criterio del estado de resultados

Es el mismo criterio del Plan Financiero 2027:

- **Ingresos (41)**.
- **Costos variables directos**, divididos en tres partes:
  - Uniformes, kits, cartillas y diplomas.
  - Docentes: nómina docente de la cuenta 61.
  - Insumos de enseñanza y eventos.
- **Bonificaciones comerciales e impuestos sobre ingresos**: ICA y 4×1000.
- **Margen de contribución**.
- **Gastos fijos de sede**: personal, arriendo, servicios, mantenimiento, otros y provisión de IVA.
- **Pauta y mercadeo**.
- **Contribución de la sede**.
- **Gasto corporativo asignado (51)** y **gastos financieros (intereses 53)**.
- **Utilidad de gestión**.

Las adecuaciones extraordinarias y la compra de activos fijos se muestran como información y no restan de la utilidad de gestión.

El punto de equilibrio se calcula como (gastos fijos de sede + pauta + corporativo + financieros) ÷ margen de contribución %. El margen de seguridad es 1 − punto de equilibrio ÷ ventas.

La clasificación de cuentas está en `src/core.js` (`clasificaCuenta`). Si contabilidad crea una cuenta nueva que no encaja, la carga la muestra como "sin clasificar".

## Guardado automático (base de datos)

Los datos viven en una base Redis (Upstash, conectada desde Storage en Vercel) detrás de la función `api/datos.js`. Cada cambio se guarda solo a los pocos segundos y queda visible para todos los que entren con la clave: parámetros, estado de las tareas, informes cargados, meses quitados y cambio de clave. El indicador de la barra superior muestra el estado: Guardado con la hora, Guardando o No se guardó (al tocarlo se reintenta). La base conserva las últimas 10 versiones como historial.

- **Si dos personas editan a la vez:** el segundo guardado detecta que hay una versión más nueva y pregunta si cargarla o guardar encima.
- **Si la base no está conectada:** la app abre con `data/dataset.json` del repositorio, avisa que los cambios quedan solo en el navegador y permite descargar un respaldo.
- **Respaldo:** en Configuración o en Parámetros se descarga cuando se quiera una copia cifrada (`dataset.json`).

## Actualización mensual

1. Abra el link e ingrese la clave.
2. Pulse **Cargar informe** y arrastre el Excel del informe consolidado por sedes, tal como lo envía contabilidad.
3. Revise lo que muestra la pantalla:
   - El mes detectado. Se toma del nombre del archivo o de la hoja; corríjalo si hace falta.
   - Que las 24 sedes estén detectadas.
   - Que el cuadre con la columna total diga **Cuadra**.
4. Pulse **Incorporar y guardar**. Queda guardado en la base. No hay que subir nada a GitHub.
5. En **Parámetros**, actualice los grupos y estudiantes activos de cada sede con el corte del mes.

## Seguridad

- **Cifrado en el navegador:** el dataset se cifra antes de salir del navegador, con AES-GCM de 256 bits. Una sola derivación PBKDF2-SHA256 (600.000 iteraciones) de la clave produce dos cosas: la llave de cifrado y un permiso de escritura.
- **Lo que guarda el servidor:**
  - El sobre cifrado.
  - El SHA-256 del permiso de escritura.

  Nunca recibe la clave ni los datos en claro. Para guardar hay que enviar el permiso correcto: quien no tenga la clave no puede leer ni escribir.
- **Primer guardado:** se valida contra el permiso del `data/dataset.json` publicado en el repositorio.
- **Cambio de clave:** reemplaza el permiso en la base y la clave anterior deja de funcionar para todos.
- **Excel originales:** nunca se suben; `data-raw/` está en `.gitignore`.
- **Si se olvida la clave:** nadie puede recuperar los datos. Hay que regenerarlos con `npm run seed` y luego guardar desde la app.

## Despliegue en Vercel

1. En vercel.com entre a **Add New › Project** e importe el repositorio `DashboardEleganzaAcademia`.
2. La configuración se toma de `vercel.json`: build `npm run build`, salida `dist`, y la función `api/datos.js`.
3. En el proyecto, entre a **Storage › Create Database › Upstash for Redis** (plan gratuito) y conéctelo al proyecto. Vercel crea solo las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`, que son las que usa la función.
4. Vuelva a publicar (**Deployments › Redeploy**) para que la función tome las variables. Cada commit en `main` publica de nuevo; los datos de la base no se tocan.

## Desarrollo

```bash
npm install
npm run build                                # genera dist/index.html
python3 tools/export_plan.py <Plan.xlsx>     # regenera data-raw/plan2027.json
CLAVE='su-clave' npm run seed                # reconstruye data/dataset.json desde data-raw/
```

Estructura:

- `src/core.js`: lectura del informe, clasificación de cuentas, motor de cálculo y cifrado.
- `src/ui.js`: interfaz.
- `src/styles.css`: marca Daniel Financiero.
- `scripts/`: build y seed. Las pruebas de cuadre (`scripts/test.mjs`) contienen cifras en claro, por eso no se suben al repositorio.
- `tools/export_plan.py`: lleva el plan del Excel a JSON.

---
Daniel Financiero · DiCi — Di que sí, con criterio.

## Simulador de escenarios 2027

Vista aparte (botón «Simulador 2027» en el menú lateral, o el enlace `#simulador`). Replica en el navegador el motor de cohortes del Excel del plan (hoja Motor: sede × curso × mes de inicio, con deserción acumulada por mes del curso, pagos cada 28 días, kit, docentes y diplomas) y con las plantillas reproduce el plan base ($151,1M), el escenario sin kit ($930,8M), el acordado del 19-nov ($1.547,2M) y la variante con maquillaje igualado ($1.272,6M).

- Carga: una sola vez desde el Excel `Plan_Financiero_2027_Eleganza_Academia.xlsx` (hojas Motor, Cursos, Sedes, Supuestos y Sedes_Criticas, con valores calculados). Queda dentro del dataset cifrado (`ds.sim.base`, ~80 KB).
- Escenarios de referencia (solo lectura): plan base, plan ajustado, sin kit y sin aumento, acordado 19-nov y acordado con maquillaje igualado. Los escenarios editables se crean como copia y se guardan solos en la base (`ds.sim.escenarios`).
- Variables: inscripción y cuota 2027 por curso, descuento, maquillaje igualado; inscritos por grupo y deserción; ocupación objetivo, salones, kit, sin aumento y CAC por sede; reducciones de personal, arriendo, servicios, mantenimiento y otros por sede; incremento salarial, IPC, kits, bonificaciones, impuestos, corporativo, financieros y caja inicial.
- Salidas: estado de resultados anual y mensual, caja operativa (recaudo 92/5/2), resultado por sede, sensibilidad de la utilidad a cada variable y cálculo de la palanca necesaria para un margen meta.
- Funciones en `src/core.js`: `simDesdeExcel`, `simPlantilla`, `simular`, `simResolver`.
