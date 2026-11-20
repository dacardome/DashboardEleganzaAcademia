# Tablero financiero Eleganza Academia

Tablero web de una sola página con los resultados reales por sede de Eleganza Academia (CEINDER S.A.S., 24 sedes) frente al Plan Financiero 2027. Lo preparó Daniel Financiero · DiCi y usa su identidad visual. Se abre desde un link con una clave. Los datos van cifrados en el repositorio: sin la clave no se pueden leer.

## Qué muestra

| # | Sección | Contenido |
|---|---------|-----------|
| — | Resumen | Lectura automática del mes en prosa e indicadores: ingresos, margen de contribución, gastos fijos de sede, pauta sobre ventas, utilidad de gestión, punto de equilibrio con margen de seguridad, y sedes con utilidad (u ocupación de franjas cuando se elige una sede). |
| 01 | Estado de resultados de gestión | Real, % sobre ventas, plan del mes, variación contra el plan y contra el mes anterior. Los no recurrentes, las compras de activos y la utilidad neta para socios aparecen aparte. |
| 02 | Tendencia | Ingresos y utilidad por mes, real contra plan, y el acumulado 2027 contra el plan desde enero. |
| 03 | Sedes | Ranking de las 24 sedes con utilidad, margen y variación contra el plan. Al hacer clic en una sede, todo el tablero se filtra por ella. |
| 04 | Gastos | Categorías contra la referencia y las 15 cuentas de mayor gasto del mes. |
| 05 | Plan 2027 | Los tres escenarios (base, ajustado, sin kit y sin aumento) y el plan mensual con grupos (enteros), inscritos y estudiantes activos. |
| 06 | Sedes críticas | Ocupación base contra la ajustada, inscritos por mes requeridos frente a 2026 y la acción sugerida. |

Los filtros de la barra superior son **Sede**, **Mes** (meses reales y meses del plan) y **Comparar con** (escenario del plan).

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
