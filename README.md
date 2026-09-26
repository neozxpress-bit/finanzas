# Finanzas

App web instalable (PWA) para registrar gastos e ingresos, inspirada en "Gestor de Gastos".

- Los datos se guardan solo en el dispositivo (IndexedDB); nada se envía a ningún servidor.
- Importa copias `.mmbackup` o `MyFinance.db` de Gestor de Gastos desde **Más → Importar**.
- Funciona sin conexión una vez abierta.

## Instalar en iPhone
Abre el sitio en Safari → botón Compartir → **Añadir a pantalla de inicio**.

## Desarrollo local
```bash
python3 -m http.server 5173
```
