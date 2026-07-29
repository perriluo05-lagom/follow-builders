@echo off
cd /d "d:\Trae CN\program\follow-builders"
D:\Git\cmd\git.exe pull
D:\Git\cmd\git.exe add -A
D:\Git\cmd\git.exe commit -m "feat: add LLM integration for Chinese digest generation"
D:\Git\cmd\git.exe push
echo Done
