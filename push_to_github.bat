@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM  push_to_github.bat
REM  Run this ONCE from inside the ai-project-manager-assistant folder.
REM  Requirements: git must be installed (https://git-scm.com)
REM ─────────────────────────────────────────────────────────────────────────

REM Set your GitHub token here before running (do not commit this file with a real token)
set GITHUB_TOKEN=YOUR_GITHUB_TOKEN_HERE
set GITHUB_USER=MadanMohan0537
set REPO_NAME=ai-project-manager-assistant

echo.
echo [1/4] Creating GitHub repository via API...
curl -s -X POST ^
  -H "Authorization: token %GITHUB_TOKEN%" ^
  -H "Accept: application/vnd.github.v3+json" ^
  https://api.github.com/user/repos ^
  -d "{\"name\":\"%REPO_NAME%\",\"description\":\"AI Project Manager: LangGraph agent that turns a plain-English project into a full risk-aware plan\",\"private\":false,\"auto_init\":false}"

echo.
echo [2/4] Initialising local git repo...
git init -b main
git config user.email "vishnu@antscorp.com"
git config user.name "MadanMohan0537"

echo.
echo [3/4] Staging and committing all files...
git add .
git commit -m "Initial commit: AI Project Manager Assistant (LangGraph + LangChain + GPT-4o-mini)"

echo.
echo [4/4] Pushing to GitHub...
git remote add origin https://%GITHUB_TOKEN%@github.com/%GITHUB_USER%/%REPO_NAME%.git
git push -u origin main

echo.
echo Done! View your repo at:
echo    https://github.com/%GITHUB_USER%/%REPO_NAME%
echo.
pause
