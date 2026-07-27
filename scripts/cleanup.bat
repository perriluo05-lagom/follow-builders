@echo off
cd /d "d:\Trae CN\program\follow-builders"
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "cleanup: remove temporary deployment scripts"
D:\Git\cmd\git.exe push
echo Cleanup completed
pause
