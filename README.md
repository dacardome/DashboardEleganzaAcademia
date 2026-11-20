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

## Actualización mensual

1. Abra el link e ingrese la clave.
2. Pulse **Cargar informe** y arrastre el Excel del informe consolidado por sedes, tal como lo envía contabilidad.
3. Revise lo que muestra la pantalla:
   - El mes detectado. Se toma del nombre del archivo o de la hoja; corríjalo si hace falta.
   - Que las 24 sedes estén detectadas.
   - Que el cuadre con la columna total diga **Cuadra**.
4. Pulse **Incorporar y guardar**. Se descarga un `dataset.json` cifrado.
5. Súbalo a GitHub en el repositorio `DashboardEleganzaAcademia`: carpeta `data` › **Add file › Upload files**, y luego **Commit changes**. Vercel publica el cambio en uno o dos minutos.

Si carga de nuevo un mes que ya existe, ese mes se reemplaza. En **Configuración** puede quitar un mes, cambiar la clave (también descarga un `dataset.json` nuevo para subir) y ver el historial de cargas.

## Seguridad

- `data/dataset.json` está cifrado con AES-GCM de 256 bits. La llave sale de la clave con PBKDF2-SHA256 (600.000 iteraciones), y el contenido se comprime antes de cifrar. El descifrado ocurre solo en el navegador.
- Los Excel originales nunca se suben: `data-raw/` está en `.gitignore`.
- Si se olvida la clave, nadie puede recuperar los datos. Hay que regenerarlos con `npm run seed`.
- Vercel envía el dataset sin caché y con cabeceras que bloquean el embebido de la página.

## Despliegue en Vercel

1. En vercel.com entre a **Add New › Project** e importe el repositorio `DashboardEleganzaAcademia`.
2. La configuración se toma de `vercel.json`: build `npm run build`, salida `dist`. No hay variables de entorno.
3. Pulse **Deploy**. Cada commit en `main` vuelve a publicar.

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
