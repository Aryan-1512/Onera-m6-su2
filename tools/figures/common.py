import pyvista as pv, numpy as np, vtk
pv.OFF_SCREEN=True
BG='#1d2733'; INK='#e7ebef'
W,H=1920,1080
def read(p):
    r=vtk.vtkXMLUnstructuredGridReader(); r.SetFileName(p); r.Update(); return pv.wrap(r.GetOutput())
def plotter():
    p=pv.Plotter(off_screen=True,window_size=(W,H)); p.set_background(BG); p.enable_anti_aliasing('ssaa')
    return p
def sbar(title):
    return dict(title=title,color=INK,title_font_size=26,label_font_size=22,vertical=True,position_x=0.88,position_y=0.18,height=0.62,width=0.045,fmt='%.1f',n_labels=5,font_family='arial')
def title(p,t,sub=None):
    p.add_text(t,position=(60,H-90),font_size=20,color=INK,font='arial')
    if sub: p.add_text(sub,position=(62,H-135),font_size=12,color='#9aa8b6',font='arial')
def cam(p,pos,focal,up=(0,0,1),zoom=1.0,parallel=False):
    p.camera_position=[pos,focal,up]
    if parallel: p.enable_parallel_projection()
    p.camera.zoom(zoom)

def hbar(title):
    return dict(title=title,color=INK,title_font_size=24,label_font_size=20,vertical=False,position_x=0.04,position_y=0.035,height=0.06,width=0.30,fmt='%.1f',n_labels=3,font_family='arial')
