# Rendimiento del backend — 12 de septiembre de 2026

Se optimizaron el host de terminales, su protocolo y tareas de disco del proceso principal. No se modificó el código del renderer. Los resultados siguientes corresponden a componentes del backend, no al consumo total de Electron o de los agentes ejecutados dentro de las terminales.

## Cambios

- **Logs de terminal:** escrituras asíncronas agrupadas por tamaño/tiempo (64 KiB / 25 ms), ordenadas por sesión. Se conservan la rotación de 8 MiB a los últimos 2 MiB y los bytes originales. Los reinicios ordenan el borrado entre la salida vieja y la nueva; el cierre espera los trabajos pendientes antes de eliminar archivos. Un error de disco se registra y libera la presión para no bloquear el terminal.
- **Control de flujo:** el disco y el emulador interno solicitan pausa al acumular aproximadamente 1 MiB y la liberan al bajar a 256 KiB. La conexión cuenta también los bytes pendientes del lote y respeta la señal de saturación del socket. El PTY solo se reanuda cuando todos los consumidores están listos. Estos umbrales limitan las colas de salida; no representan un límite de RAM total por sesión.
- **Recuperación:** las sesiones guardadas recuperan su scrollback del disco al solicitar una captura o sus líneas, en lugar de analizar todos los logs al iniciar. Solicitudes simultáneas comparten la recuperación. Un reinicio invalida lecturas anteriores y usa un emulador nuevo para evitar texto atrasado del proceso anterior. No se descargan de memoria las sesiones activas ni se reduce la cantidad de scrollback configurada.
- **Protocolo:** los fragmentos se acumulan sin volver a copiar todo lo recibido en cada lectura. Los mensajes completos tienen una ruta directa. El payload que recibe cada consumidor tiene almacenamiento propio.
- **Estadísticas:** consultas simultáneas comparten una muestra, con caché de un segundo y sin sondeo adicional en reposo. La tabla de hijos se construye una vez por muestra, en vez de una vez por sesión. Las consultas del tamaño de logs y de `/proc` son asíncronas con concurrencia limitada.
- **Git:** lecturas de archivos asíncronas y acotadas, concurrencia limitada y timeout para consultas. Los comandos que restauran archivos no reciben ese timeout. Los archivos demasiado grandes se descartan antes de leerlos para contar líneas.
- **Cliente del host:** los temporizadores se cancelan al responder y las solicitudes pendientes se rechazan al desconectar explícitamente.

## Mediciones reproducibles

Windows x64, Node v22.12.0. Código original: commit `855907855a9a2cad2c3a170d9a3d30ad21e33ca4`. Mediana de cinco ejecuciones después de calentamiento; misma carga para ambas versiones. El script verifica las cantidades de datos procesados. Las pruebas de logs utilizan un directorio temporal, sin las sesiones del usuario.

| Carga sintética | Antes | Después | Reducción de tiempo |
|---|---:|---:|---:|
| Replay fragmentado, 1 sesión | 17,08 ms | 0,39 ms | 97,7 % |
| Replay fragmentado, 5 sesiones | 87,80 ms | 1,22 ms | 98,6 % |
| Replay fragmentado, 20 sesiones | 189,82 ms | 2,69 ms | 98,6 % |
| 10.000 mensajes pequeños completos | 9,75 ms | 9,76 ms | Sin diferencia relevante |
| Agrupar procesos: 100 muestras, 2.000 procesos, 20 raíces | 105,41 ms | 18,02 ms | 82,9 % |
| Ráfaga de logs, 1 sesión | 1,58 ms | 1,15 ms | 27,6 % |
| Ráfaga de logs, 5 sesiones | 5,94 ms | 1,93 ms | 67,5 % |
| Ráfaga de logs, 20 sesiones | 19,06 ms | 6,50 ms | 65,9 % |

Replay: 256 KiB por sesión en fragmentos de 1 KiB. Logs: 128 KiB por sesión en bloques de 1 KiB. En la ráfaga de logs de 20 sesiones, la demora hasta el primer turno del event loop pasó de 19,12 ms a 0,38 ms. El tiempo completo de logs incluye esperar a que las escrituras terminen. No se llama `fsync`; estas mediciones no representan durabilidad física del disco. La prueba de procesos mide la agrupación en JavaScript, no el coste de consultar PowerShell o `ps`.

No se midió una reducción porcentual de RAM o CPU de la aplicación completa. Los resultados varían con el equipo, el disco, la carga y el tamaño de las lecturas reales del socket. No deben presentarse como “98 % más rápida toda la app”. La ventaja del parser se concentra en mensajes grandes muy fragmentados.

Para repetir:

```sh
node scripts/backend-bench.mjs 855907855a9a2cad2c3a170d9a3d30ad21e33ca4
npm test
npm run typecheck
npm run build
node scripts/backend-smoke.mjs
```

## Validación

- 234 pruebas pasaron, incluidas 25 nuevas de regresión.
- TypeScript y build de producción pasaron.
- Prueba nativa de Windows del host compilado: comando ejecutado por el shell, salida intensa con más de 1 MiB sin confirmar, continuación del terminal, cierre normal, persistencia de la salida final, recuperación al reiniciar y eliminación de la sesión de prueba.
- La prueba nativa usa `STEP_HOME` y `CLAUDE_CONFIG_DIR` temporales, un pipe independiente y procesos ocultos. No conecta al host instalado.
- Se añadió `.github/workflows/backend-checks.yml` para pruebas, tipos, compilación y prueba nativa en Windows, macOS y Linux. **No se ha ejecutado esa matriz remota; la validación nativa realizada aquí es Windows.**

## Límites y trabajo que sigue siendo candidato a medición

El cierre normal vacía los logs, pero una terminación forzada puede perder datos todavía en la cola asíncrona. El vaciado por tiempo está previsto a 25 ms; un disco lento o un event loop ocupado puede demorarlo. Las pruebas cubren fallos de escritura y liberación de pausas, pero no cortes de energía ni todos los fallos de hardware.

El lector del historial de Claude, el archivo de prompts y las escrituras de preferencias/estado todavía tienen trabajo síncrono. También permanece el coste de iniciar PowerShell/`ps` para obtener procesos. La carga del entorno del shell sigue en el arranque de macOS/Linux. Son candidatos para otra medición; no se modificaron esos ciclos de persistencia o arranque en este cambio.

No se reinició, actualizó ni publicó la instalación del usuario. Un host ya ejecutándose conserva su código anterior hasta que se reinicie; reiniciarlo termina sus procesos de terminal, por lo que debe hacerse después de guardar el trabajo en curso.
