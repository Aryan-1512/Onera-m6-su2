from common import *
import sys; D=(sys.argv[1].rstrip('/')+'/') if len(sys.argv)>1 and not sys.argv[1] in ('top','iso','slices','stream','mesh') else 'case/'
s=read(D+'surface_flow.vtu').extract_surface()
f=read(D+'flow.vtu')
O='images/'; import os; os.makedirs(O,exist_ok=True)
cp=dict(scalars='Pressure_Coefficient',cmap='coolwarm',clim=[-1.3,1.3])
c=np.array([0.55,0.62,0.0])
# 1 Cp upper surface, top view
p=plotter(); p.add_mesh(s,**cp,scalar_bar_args=sbar('Pressure coefficient'),lighting=False)
title(p,'ONERA M6: pressure on the upper surface','Mach 0.84, 3.06° angle of attack. The sharp rise from blue to yellow is the lambda shock.')
cam(p,c+[0,0,5],c,up=(0,1,0),parallel=True); p.camera.parallel_scale=0.86
p.screenshot(O+'m6_cp_upper.png'); p.close()
# 2 Cp + isolines
s.set_active_scalars('Pressure_Coefficient')
iso=s.contour(isosurfaces=np.linspace(-1.3,1.0,30),scalars='Pressure_Coefficient')
iso=iso.clip(normal=(0,0,-1),origin=(0,0,0.0))   # keep upper-surface lines only (z>0)
p=plotter(); p.add_mesh(s,**cp,scalar_bar_args=sbar('Pressure coefficient'),lighting=False)
p.add_mesh(iso,color='#1d2733',line_width=2.5)
title(p,'ONERA M6: pressure isolines','Lines bunch together at shocks: two legs near the root merge into one toward the tip.')
cam(p,c+[0,0,5],c,up=(0,1,0),parallel=True); p.camera.parallel_scale=0.86
p.screenshot(O+'m6_cp_contours.png'); p.close()
# 3 Mach slice at y=0.4
sl=f.slice(normal=(0,1,0),origin=(0.5,0.4,0)).clip_box([-0.3,1.22,0.3,0.5,-0.3,0.6],invert=False)
p=plotter(); p.add_mesh(sl,scalars='Mach',cmap='coolwarm',clim=[0.6,1.4],scalar_bar_args=sbar('Mach number'),lighting=False)
title(p,'ONERA M6: Mach number on a cut at one third of the span','Red is faster than sound. The supersonic pocket above the wing ends in a near-vertical shock.')
sc=np.array([0.6,0.4,0.24]); cam(p,sc+[0,-5,0],sc,up=(0,0,1),parallel=True); p.camera.parallel_scale=0.56
p.screenshot(O+'m6_mach_slice.png'); p.close()
# 4 streamlines
f.set_active_vectors('Velocity')
seed=pv.Line((-0.4,0.05,0.03),(-0.4,1.25,0.03),resolution=40)
seed2=pv.Line((-0.4,0.05,-0.04),(-0.4,1.25,-0.04),resolution=40)
st=f.streamlines_from_source(seed.merge(seed2) if hasattr(seed,'merge') else seed,vectors='Velocity',max_length=3.0,integration_direction='forward')
tubes=st.tube(radius=0.004)
p=plotter(); p.add_mesh(s,color='#9aa6b2',smooth_shading=True)
p.add_mesh(tubes,scalars='Mach',cmap='coolwarm',clim=[0.6,1.4],scalar_bar_args=sbar('Mach number'))
title(p,'ONERA M6: streamlines coloured by Mach number','Air speeds up over the upper surface and slows sharply where it crosses the shock.')
cam(p,(-1.3,-1.6,1.5),(1.0,0.6,-0.05),up=(0,0,1)); p.camera.zoom(1.05)
p.screenshot(O+'m6_streamlines.png'); p.close()
print('done', os.listdir(O))
