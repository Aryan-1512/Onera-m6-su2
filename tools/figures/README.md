# README figures

Renders the images in `images/` straight from the SU2 results with PyVista (VTK, the engine ParaView is built on), so every figure can be regenerated.

```
pip install pyvista vtk numpy
python tools/figures/render_m6.py case/
```

Run it from the repository root after the simulation has written its `.vtu` files into `case/`.
