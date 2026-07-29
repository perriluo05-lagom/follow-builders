@echo off
cd /d "d:\Trae CN\program\follow-builders"
D:\Git\cmd\git.exe pull
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "fix: add marked dependency for GitHub Actions"
D:\Git\cmd\git.exe push
echo Fix deployed
