"""Genera data-raw/params_init.json: base de parámetros operativos por sede para el tablero.

Fuentes:
  - Plan_Financiero_2027_Eleganza_Academia.xlsx, hoja Sedes (capacidad, ocupación, llenado, deserción,
    CAC, gastos fijos 2027 por línea).
  - Extractos del Power BI (carpeta pbi/): estudiantes activos por sede (activos.txt), grupos y
    estudiantes por curso según mes de inicio (cohorts.txt), inscripciones por mes (insc_all.txt).
  - Decisiones de la reunión del 19-nov-2026 (notas de Gemini), cargadas como escenario vigente.

Uso: python3 tools/export_params.py <Plan.xlsx> <carpeta pbi> [salida]
"""
import json, sys, unicodedata, datetime
import openpyxl

XLSX = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/outputs/Plan_Financiero_2027_Eleganza_Academia.xlsx'
PBI = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/work/pbi'
OUT = sys.argv[3] if len(sys.argv) > 3 else 'data-raw/params_init.json'

CURSOS = [('MAN', 'Manicure'), ('CEJ', 'Cejas y pestañas'), ('BAR', 'Barbería'), ('MAQ', 'Maquillaje'),
          ('EST', 'Estilismo'), ('PEI', 'Peinados'), ('MAS', 'Masajes')]


def nrm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return ''.join(ch for ch in s if ch.isalnum())


wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
ws = wb['Sedes']
rows = list(ws.iter_rows(min_row=5, max_row=29, values_only=True))
hdr = list(rows[0])
col = {h: i for i, h in enumerate(hdr) if h}
sedes = {}
for r in rows[1:]:
    if not r[0] or str(r[0]).startswith('Total'):
        continue
    g = lambda h: r[col[h]]
    sedes[r[0]] = dict(
        cc=str(g('CC')), salones=int(g('Salones')), franjas=int(g('Capacidad franjas (grupos simult.)')),
        gruposProm=float(g('Grupos simult. prom. jun-oct 26')), gruposOct=float(g('Grupos simult. oct-26')),
        ocupHist=float(g('Ocupación base')), ocupPlan=float(g('Ocupación 2027 (escenario)')),
        llenado=float(g('Llenado base')), desercion=float(g('Deserción base')),
        inscMesHist=float(g('Inscripciones / mes hist. 2026')), cac=float(g('CAC 2027')),
        presupuesto=dict(personal=g('Personal 2027'), arriendo=g('Arriendo 2027'), servicios=g('Servicios 2027'),
                         mantenimiento=g('Mantenimiento 2027'), otros=g('Otros fijos 2027'), iva=g('Provisión IVA 2027')),
    )
nombres = list(sedes)
NN = {nrm(n): n for n in nombres}


def canon(raw):
    k = nrm(raw)
    for full, n in NN.items():
        if full.startswith(k) or k.startswith(full):
            return n
    return None


# estudiantes activos (Power BI, estado Activo, por mes de inscripción)
activos = {}
for line in open(f'{PBI}/activos.txt', encoding='utf8'):
    if line.startswith('#') or ':' not in line:
        continue
    name, vals = line.strip().split(':', 1)
    n = canon(name)
    if not n:
        continue
    v = [int(x) if x else 0 for x in vals.split(',')]
    activos[n] = v[0] + v[-1]  # total 2025 + total 2026

# cursos: grupos y estudiantes por familia, inicios jul-nov 2026 (abiertos) y dic-ene (programados)
cursos = {n: {} for n in nombres}
for line in open(f'{PBI}/cohorts.txt', encoding='utf8'):
    if line.startswith('#') or '|' not in line:
        continue
    left, vals = line.strip().split(':', 1)
    city, fam = left.split('|')
    n = canon(city)
    if not n:
        continue
    cells = vals.split(',')
    act_g = act_e = prog_g = 0
    for i, c in enumerate(cells):  # 0=jun 1=jul ... 5=nov 6=dic 7=ene
        if not c:
            continue
        gg, ee = (int(x) for x in c.split('/'))
        if 1 <= i <= 5:
            act_g += gg; act_e += ee
        elif i >= 6:
            prog_g += gg
    cursos[n][fam] = dict(grupos=act_g, estudiantes=act_e, programados=prog_g)

# apertura: primer mes con inscripciones (ene-2025 en adelante)
apertura = {}
for line in open(f'{PBI}/insc_all.txt', encoding='utf8'):
    if line.startswith('#') or ':' not in line:
        continue
    name, vals = line.strip().split(':', 1)
    n = canon(name)
    if not n:
        continue
    v = vals.split(',')
    meses = [(2025, m + 1, v[m]) for m in range(12)] + [(2026, m + 1, v[13 + m]) for m in range(10)]
    first = next(((y, m) for y, m, x in meses if x and int(x) > 0), None)
    apertura[n] = None if first == (2025, 1) else f'{first[0]}-{first[1]:02d}' if first else None

salones_posibles = {'Venecia': 6, 'Suba': 15}  # reunión 19-nov: Venecia 2 de 6 posibles; Suba 5 de 15
params = {'generales': dict(
    franjasSalon=14, cupo=16, topeOcupacion=0.9, incPrecioBase=0.05, incPrecio=0.042,
    tasaDescuento=0.12, mesesCapitalTrabajo=3, ocupExpansion=0.9, mesesMaduracion=12, plazoMaxPerdida=6,
    horizonteMeses=36, mesesRampa=4, inversionNuevaSede=100_000_000, corteOperativo='2026-11'), 'sedes': {}}

for n, d in sedes.items():
    nueva = bool(apertura.get(n)) and apertura[n] >= '2025-06'
    cs = cursos.get(n, {})
    p = dict(
        cc=d['cc'], salones=d['salones'], salonesPlan=d['salones'], salonesPosibles=salones_posibles.get(n, d['salones']),
        gruposActivos=round(d['gruposOct']), gruposProm=d['gruposProm'], estudiantesActivos=activos.get(n, 0),
        ocupHist=d['ocupHist'], ocupPlan=d['ocupPlan'], llenado=d['llenado'], desercion=d['desercion'],
        inscMesHist=d['inscMesHist'], cac=d['cac'], cacPlan=d['cac'], kit=True, incPrecio=None,
        cursos={k: cs.get(k, dict(grupos=0, estudiantes=0, programados=0)) for k, _ in CURSOS},
        presupuesto={k: round(float(v or 0)) for k, v in d['presupuesto'].items()},
        apertura=apertura.get(n), nueva=nueva, evaluar=nueva,
        inversion=params['generales']['inversionNuevaSede'] if nueva else 0, nota='')
    p['presupuestoPlan'] = dict(p['presupuesto'])
    params['sedes'][n] = p

# ---- decisiones de la reunión 19-nov-2026
S = params['sedes']
b = S['Barrancabermeja']
b['salonesPlan'] = 2
b['ocupPlan'] = round(b['gruposProm'] / (2 * 14), 4)  # mismos grupos en 2 salones: 36% -> ~73%
b['presupuesto']['arriendo'] = round(b['presupuestoPlan']['arriendo'] / 2)
b['presupuesto']['servicios'] = round(b['presupuestoPlan']['servicios'] / 2)
b['presupuesto']['personal'] = round(b['presupuestoPlan']['personal'] * 2 / 3)  # 3 personas -> 2
b['evaluar'] = True; b['inversion'] = 0
b['nota'] = ('Acordado 19-nov: entregar 2 de 4 salones, media renta, medios servicios y una persona menos '
             '(nómina de 3 personas). Los mismos grupos en 2 salones llevan la ocupación de 36% a ~73%.')
s = S['Sincelejo']
s['kit'] = False; s['incPrecio'] = 0.0; s['ocupPlan'] = 0.60; s['evaluar'] = True
s['nota'] = 'Acordado 19-nov: sin kit y sin aumento de precio para subir la ocupación de 30% a 60% (ocupación promedio de la empresa).'
for n in ('Venecia', 'Zipaquirá'):
    S[n]['ocupPlan'] = 0.60
    S[n]['nota'] = ('Acordado 19-nov: proyectar con ocupación promedio de 60%. '
                    + ('Jefferson revisa habilitar 3 salones adicionales (hoy 2 de 6 posibles).' if n == 'Venecia' else 'Sede nueva (apertura oct-2026).'))
S['Suba']['nota'] = 'Reunión 19-nov: 5 de 15 salones posibles habilitados; el arriendo pesa 21% de los ingresos (promedio empresa 12%). Sin decisión aún.'
S['Itagüí']['nota'] = 'Reunión 19-nov: Jhonatan Castro analiza gastos y rendimiento de la sede.'

params['tareas'] = [
    dict(id=1, resp='Daniel Cardona', tarea='Revisar datos históricos de recuperación para el mejor y peor escenario de tiempo al punto de equilibrio de las sedes nuevas', estado='Pendiente'),
    dict(id=2, resp='Daniel Cardona', tarea='Corregir el supuesto de enero: estudiantes activos por temporada en lugar de alta deserción', estado='Pendiente'),
    dict(id=3, resp='Daniel Cardona', tarea='Incluir en la proyección de Barrancabermeja media renta, medios servicios y una persona menos tras entregar dos salones', estado='En tablero'),
    dict(id=4, resp='Daniel Cardona', tarea='Proyección separada de Barrancabermeja y ciudades seleccionadas: inversión, punto de equilibrio, TIR y VPN', estado='En tablero'),
    dict(id=5, resp='Daniel Cardona', tarea='Escenario sin aumento y sin kit mejorando la capacidad en Barrancabermeja y Sincelejo', estado='En tablero'),
    dict(id=6, resp='Daniel Cardona', tarea='Ajustar Barrancabermeja, Sincelejo, Venecia y Zipaquirá con ocupación y recortes para la decisión 2027', estado='En tablero'),
    dict(id=7, resp='Daniel Cardona', tarea='Enviar la presentación actualizada al grupo de WhatsApp y proponer la reunión de la próxima semana', estado='Pendiente'),
    dict(id=8, resp='Jhonatan Castro', tarea='Analizar gastos y rendimiento de la sede Itagüí', estado='Pendiente'),
    dict(id=9, resp='Jefferson Gómez', tarea='Revisar si se pueden habilitar 3 salones adicionales en Venecia', estado='Pendiente'),
]
# ---- cursos: precio y duración (hoja Cursos) e inscritos por mes y curso (Power BI)
wc = wb['Cursos']
fam = {'Manicure': 'MAN', 'Maquillaje': 'MAQ', 'Barbería': 'BAR', 'Cejas y pestañas': 'CEJ', 'Estilismo': 'EST', 'Peinados': 'PEI', 'Masajes': 'MAS'}
info = {}
for r in wc.iter_rows(min_row=6, max_row=12, values_only=True):
    if r[0] in fam:
        info[fam[r[0]]] = dict(nombre=r[0], precio=float(r[1]), pagos=int(r[2]), duracion=float(r[13]), cupo=int(r[4]))
params['cursosInfo'] = {k: info[k] for k, _ in CURSOS}
meses_coh = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']
insc = {k: {n: {c: dict(grupos=0, inscritos=0) for c, _ in CURSOS} for n in nombres} for k in meses_coh}
for line in open(f'{PBI}/cohorts.txt', encoding='utf8'):
    if line.startswith('#') or '|' not in line:
        continue
    left, vals = line.strip().split(':', 1)
    city, fm = left.split('|')
    n = canon(city)
    if not n or fm not in dict(CURSOS):
        continue
    for i, c in enumerate(vals.split(',')[:6]):
        if c:
            g, e = (int(x) for x in c.split('/'))
            insc[meses_coh[i]][n][fm] = dict(grupos=g, inscritos=e)
params['inscritosMes'] = insc
tot = {}
for line in open(f'{PBI}/insc_all.txt', encoding='utf8'):
    if line.startswith('#') or ':' not in line:
        continue
    name, vals = line.strip().split(':', 1)
    n = canon(name)
    if not n:
        continue
    v = vals.split(',')
    for m in range(11):
        x = v[13 + m]
        tot.setdefault(f'2026-{m + 1:02d}', {})[n] = int(x) if x else 0
params['inscripcionesTotal'] = tot

params['generado'] = datetime.datetime.now().isoformat(timespec='seconds')
params['version'] = 1
json.dump(params, open(OUT, 'w'), ensure_ascii=False, indent=1)
print('sedes', len(S), 'activos', sum(p['estudiantesActivos'] for p in S.values()),
      'franjas', sum(p['salones'] for p in S.values()) * 14, 'grupos oct', sum(p['gruposActivos'] for p in S.values()))
for n, p in S.items():
    print(f"{n:18s} sal {p['salones']}/{p['salonesPosibles']} gr {p['gruposActivos']:3d} est {p['estudiantesActivos']:4d} "
          f"cursos {sum(c['grupos'] for c in p['cursos'].values()):3d} ap {p['apertura']} nueva {p['nueva']}")
