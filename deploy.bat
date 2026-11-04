@echo off
echo Study Buddy - Deploy to Vercel
echo.
echo Backend: Supabase (already hosted) - no separate server deploy needed.
echo.

if not exist .env (
  echo ERROR: .env file missing. Copy .env.example and add your Supabase keys.
  exit /b 1
)

echo Step 1: Log in to Vercel (browser opens once)...
call npx vercel login
if errorlevel 1 exit /b 1

echo.
echo Step 2: Building...
call npm run build
if errorlevel 1 exit /b 1

echo.
echo Step 3: Deploying to production...
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
)
call npx vercel deploy --prod --yes

echo.
echo DONE. Copy your live URL above.
echo.
echo IMPORTANT - Supabase setup (one time):
echo   1. Supabase Dashboard - Authentication - URL Configuration
echo   2. Site URL = your Vercel URL (e.g. https://study-tracker-xxx.vercel.app)
echo   3. Redirect URLs = add your Vercel URL and http://localhost:5173
echo   4. Vercel Dashboard - Project Settings - Environment Variables:
echo      VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same as .env)
echo   5. Google Cloud Console - add your Vercel URL to Authorized JavaScript origins
echo.
pause
