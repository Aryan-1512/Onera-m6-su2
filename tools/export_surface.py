"""Convert an SU2 surface result (surface_flow.vtu) into the compact files
the web viewer in docs/ reads.

Usage:  python export_surface.py path/to/surface_flow.vtu docs/data/<name>
Needs:  pip install vtk numpy
Writes: <name>.json (sizes, bounds, value ranges) and <name>.bin
        (float32 xyz | uint32 triangles | float32 Cp | float32 Mach)
"""
import sys, json
import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy as v2n

vtu, prefix = sys.argv[1], sys.argv[2]
r = vtk.vtkXMLUnstructuredGridReader(); r.SetFileName(vtu); r.Update(); g = r.GetOutput()
P = v2n(g.GetPoints().GetData()).astype(np.float32)
tris = v2n(g.GetCells().GetConnectivityArray()).astype(np.uint32).reshape(-1, 3)
cp = v2n(g.GetPointData().GetArray('Pressure_Coefficient')).astype(np.float32)
mach = v2n(g.GetPointData().GetArray('Mach')).astype(np.float32)
open(prefix + '.bin', 'wb').write(P.tobytes() + tris.tobytes() + cp.tobytes() + mach.tobytes())
json.dump({'nVerts': len(P), 'nTris': len(tris), 'bounds': [P.min(0).tolist(), P.max(0).tolist()],
           'fields': {'cp': [float(cp.min()), float(cp.max())], 'mach': [float(mach.min()), float(mach.max())]}},
          open(prefix + '.json', 'w'), indent=1)
print(f'{prefix}: {len(P)} points, {len(tris)} triangles')
