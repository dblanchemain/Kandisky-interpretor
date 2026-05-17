# audio_server.spec
# Spec PyInstaller pour audio_server.py (kandisky-interpretor)
#
# Usage :
#   pyinstaller audio_server.spec
#
# Produit :
#   dist/audio_server          (Linux / macOS)
#   dist/audio_server.exe      (Windows)
#
# Copier ensuite dans :
#   resources/bin/linux/audio_server
#   resources/bin/mac/audio_server
#   resources/bin/win/audio_server.exe

import sys
import os
import ctypes.util
from PyInstaller.utils.hooks import collect_all, collect_data_files

datas         = []
binaries      = []
hiddenimports = []

# ── sounddevice ──────────────────────────────────────────────────────────────
import sounddevice as _sd
datas.append((_sd.__file__, '.'))

if sys.platform.startswith('linux'):
    for lib in ['portaudio', 'portaudio-2.0']:
        p = ctypes.util.find_library(lib)
        if p and os.path.isfile(p):
            binaries.append((p, '.'))
            break
else:
    sd_dir = os.path.dirname(_sd.__file__)
    sd_data = os.path.join(sd_dir, '_sounddevice_data')
    if os.path.isdir(sd_data):
        datas.append((sd_data, '_sounddevice_data'))

# ── soundfile ────────────────────────────────────────────────────────────────
import soundfile as _sf
datas.append((_sf.__file__, '.'))

if sys.platform.startswith('linux'):
    for lib in ['sndfile', 'sndfile-1.0']:
        p = ctypes.util.find_library(lib)
        if p and os.path.isfile(p):
            binaries.append((p, '.'))
            break
else:
    sf_dir = os.path.dirname(_sf.__file__)
    for sub in ['_soundfile_data', '_soundfile_binaries']:
        sf_data = os.path.join(sf_dir, sub)
        if os.path.isdir(sf_data):
            datas.append((sf_data, sub))

# ── numpy, pyrubberband, websockets ─────────────────────────────────────────
for pkg in ['numpy', 'pyrubberband', 'websockets']:
    d, b, h = collect_all(pkg)
    datas         += d
    binaries      += b
    hiddenimports += h

hiddenimports += [
    'sounddevice',
    'soundfile',
    'asyncio',
    'websockets.server',
    'websockets.legacy',
    'websockets.legacy.server',
    'ctypes',
    'ctypes.util',
]

a = Analysis(
    ['audio_server.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'PIL', 'cv2',
        'IPython', 'jupyter', 'notebook',
        'PyQt5', 'PyQt6', 'wx', 'gi',
        'numpy.core.tests', 'numpy.distutils.tests', 'numpy.f2py.tests',
        'numpy.fft.tests', 'numpy.lib.tests', 'numpy.linalg.tests',
        'numpy.ma.tests', 'numpy.matrixlib.tests', 'numpy.polynomial.tests',
        'numpy.random.tests', 'numpy.testing.tests', 'numpy.tests',
        'numpy.typing.tests', 'numpy.distutils',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='audio_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
