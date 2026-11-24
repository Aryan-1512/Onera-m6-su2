"""Trace streamlines through an SU2 volume result (flow.vtu) for the animated flow page.

Usage:  python trace_streamlines.py flow.vtu docs/data/<name> X0 YMIN YMAX "Z1,Z2,..." NPERROW MAXLEN
        seeds rows of NPERROW points on the line x=X0, y in [YMIN, YMAX], one row per z value,
        and integrates each streamline downstream for at most MAXLEN metres.
Needs:  pip install vtk numpy
Writes: <name>.json and <name>.bin (per line 160 points of x, y, z, integration time, Mach)
"""
import sys, json
import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy as v2n

vtu, prefix, x0, ymin, ymax, zs, nrow, max_len = sys.argv[1:9]
x0, ymin, ymax, nrow, max_len = float(x0), float(ymin), float(ymax), int(nrow), float(max_len)
NPTS = 160
r = vtk.vtkXMLUnstructuredGridReader(); r.SetFileName(vtu); r.Update(); g = r.GetOutput()
g.GetPointData().SetActiveVectors('Velocity')
seeds = vtk.vtkAppendPolyData()
for z in map(float, zs.split(',')):
    ls = vtk.vtkLineSource(); ls.SetPoint1(x0, ymin, z); ls.SetPoint2(x0, ymax, z); ls.SetResolution(nrow - 1); ls.Update()
    seeds.AddInputData(ls.GetOutput())
seeds.Update()
st = vtk.vtkStreamTracer(); st.SetInputData(g); st.SetSourceData(seeds.GetOutput())
st.SetIntegratorTypeToRungeKutta45(); st.SetIntegrationDirectionToForward()
st.SetMaximumPropagation(max_len); st.SetInitialIntegrationStep(0.2); st.SetMaximumNumberOfSteps(20000); st.Update()
o = st.GetOutput()
P = v2n(o.GetPoints().GetData()); T = v2n(o.GetPointData().GetArray('IntegrationTime')); M = v2n(o.GetPointData().GetArray('Mach'))
lines = o.GetLines(); lines.InitTraversal(); ids = vtk.vtkIdList(); out = []
while lines.GetNextCell(ids):
    idx = np.array([ids.GetId(i) for i in range(ids.GetNumberOfIds())])
    if len(idx) < 10: continue
    p, t, m = P[idx], T[idx], M[idx]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    if s[-1] < 0.3 * max_len: continue          # drop streamlines that stalled
    ss = np.linspace(0, s[-1], NPTS)
    out.append(np.c_[[np.interp(ss, s, p[:, k]) for k in range(3)] + [np.interp(ss, s, t), np.interp(ss, s, m)]].T)
A = np.array(out, dtype=np.float32); A.tofile(prefix + '.bin')
json.dump({'nLines': int(A.shape[0]), 'nPts': NPTS, 'mach': [float(A[..., 4].min()), float(A[..., 4].max())],
           'tMax': float(A[..., 3].max())}, open(prefix + '.json', 'w'))
print(f'{prefix}: {A.shape[0]} streamlines')
