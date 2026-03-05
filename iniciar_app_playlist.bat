@echo off
cd /d "c:\Users\Em\Desktop\Apps\Proyectos Terminados\PlaylistApp 3 EDIT"
echo Launching Node server using specific executable (v22.13.1) in a new window...
start "Node Server - Playlist App" cmd /k ""C:\Users\Em\AppData\Local\nvm\v22.13.1\node.exe" server.js && pause"
echo Waiting a few seconds for the server to start...
timeout /t 5 /nobreak > nul
echo Opening Brave browser...
start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:3000
echo.
echo Main script finished launching tasks.
echo Check the 'Node Server - Playlist App' window for server status.
echo (You can close this window)
pause > nul