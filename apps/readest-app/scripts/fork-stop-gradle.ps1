# Fork helper: stop Gradle/Kotlin daemons left by a previous (possibly interrupted) build.
# They keep files under src-tauri/gen/android locked on Windows, so `rm -rf` fails.
Get-CimInstance Win32_Process -Filter "Name='java.exe'" |
  Where-Object { $_.CommandLine -like '*GradleDaemon*' -or $_.CommandLine -like '*KotlinCompileDaemon*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
