@echo off
cd /d "d:\Trae CN\program\follow-builders"
D:\Git\cmd\git.exe pull
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "feat: add GitHub Actions cloud deployment for daily digest"
D:\Git\cmd\git.exe push
echo Deployment completed
