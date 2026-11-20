import openpyxl, json, sys
XL='/home/claude/outputs/Plan_Financiero_2027_Eleganza_Academia.xlsx'
wb=openpyxl.load_workbook(XL,data_only=True,read_only=True)
def blocks(sheet, start_row):
    out={}; cur=None
    for r in wb[sheet].iter_rows(min_row=start_row, values_only=True):
        a=r[0]
        if isinstance(a,str) and r[2] is None and all(v is None for v in r[1:14]):
            cur=a; out[cur]={}; continue
        if cur and isinstance(a,str) and a!='Total':
            out[cur][a]=[round(float(v or 0)) for v in r[2:14]]
    return out
CA=blocks('Calc_Ajuste',30); CK=blocks('Calc_SinKit',5)
keys={'ing':'Ingresos','cv':'Costo variable directo','bon':'Bonificaciones e impuestos','mc':'Margen de contribución','fij':'Gastos fijos de sede',
      'pau':'Pauta','con':'Contribución sede','corp':'Corporativo asignado','fin':'Financiero asignado','uai':'Utilidad antes de impuestos'}
ops={'nue':'Nuevos inscritos','act':'Estudiantes activos','ga':'Grupos activos'}
sedes=list(CA['Ingresos — BASE'].keys())
plan={'base':{}, 'ajustado':{}, 'sinkit':{}}
for s in sedes:
    for esc,src,suf in (('base',CA,'BASE'),('ajustado',CA,'AJUSTADO'),('sinkit',CK,'ESCENARIO 3')):
        d={}
        for k,lab in keys.items():
            nm=f'{lab} — {suf}'
            d[k]=src[nm][s] if nm in src else src[lab][s]
        for k,lab in ops.items():
            d[k]=CA[f'{lab} — {"AJUSTADO" if esc=="ajustado" else "BASE"}'][s]
        plan[esc][s]=d
# fixed cost breakdown (monthly 2027) from Sedes
sh=list(wb['Sedes'].iter_rows(min_row=5,max_row=30,values_only=True)); H={h:i for i,h in enumerate(sh[0]) if h}
fx_cols={'personal':'Personal 2027','arriendo':'Arriendo 2027','servicios':'Servicios 2027','mantenimiento':'Mantenimiento 2027','otros':'Otros fijos 2027','iva':'Provisión IVA 2027'}
missing=[c for c in fx_cols.values() if c not in H]; assert not missing, (missing, list(H)[:80])
fijos={}; cap={}
for r in sh[1:]:
    if r[0] in sedes:
        fijos[r[0]]={k:round(r[H[c]] or 0) for k,c in fx_cols.items()}
        cap[r[0]]={'salones':r[H['Salones']],'franjas':r[H['Capacidad franjas (grupos simult.)']],'ocupHist':r[H['Ocupación histórica']],'ocup2027':r[H['Ocupación 2027 (escenario)']],
                   'llenado':r[H['Llenado histórico']],'cac':round(r[H[[h for h in H if str(h).startswith('CAC')][0]]] or 0)}
# criticas
sc=list(wb['Sedes_Criticas'].iter_rows(min_row=1,max_row=34,values_only=True))
meta=sc[3][2]; crit={}
for r in sc[9:33]:
    if r[0] in sedes: crit[r[0]]={'critica':r[1]=='Sí','ocupBase':r[2],'ocupReq':r[9],'ocupAj':r[11],'inscMesReq':r[13],'inscMesHist':r[14],'accion':r[21]}
# grupos a abrir (Aperturas bloques 2 y 3) por sede y mes 2027
ap=list(wb['Aperturas'].iter_rows(values_only=True)); blk=None; grupos={'base':{},'ajustado':{}}
for r in ap:
    if isinstance(r[0],str) and r[0][:2] in ('1.','2.','3.','4.','5.'): blk=r[0][:2]
    if blk in ('2.','3.') and r[0] in sedes and isinstance(r[1],str):
        g=grupos['base' if blk=='2.' else 'ajustado'].setdefault(r[0],[0]*12)
        for m in range(12): g[m]+=int(round(r[5+m] or 0))
out={'generado':'2026-11-19','fuente':'Plan_Financiero_2027_Eleganza_Academia.xlsx','anio':2027,'meta':meta,'sedes':sedes,'plan':plan,'fijos':fijos,'capacidad':cap,'criticas':crit,'grupos':grupos}
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False)
tot=lambda esc,k: sum(sum(plan[esc][s][k]) for s in sedes)/1e6
print({e:(round(tot(e,'ing'),1),round(tot(e,'uai'),1)) for e in plan}, 'meta',meta, 'sedes',len(sedes), 'grupos',sum(sum(v) for v in grupos['base'].values()))
