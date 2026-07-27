@echo off
cd /d "d:\Trae CN\program\follow-builders"
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "chore: update to Chinese-only, remove procedural summarization"
D:\Git\cmd\git.exe push
echo Deployment completed
pause
