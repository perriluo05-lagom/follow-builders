@echo off
cd /d "d:\Trae CN\program\follow-builders"
del scripts\cleanup.bat
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "cleanup: remove last temporary script"
D:\Git\cmd\git.exe push
echo Final cleanup completed
pause
