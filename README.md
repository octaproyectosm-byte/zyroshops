# Zyro Shops en Cloudflare Pages

- public/index.html -> la tienda y el panel del dueño
- functions/api/[[path]].js -> el servidor (guarda y lee productos en Workers KV)

En Cloudflare tenés que:
1. Crear un almacén KV y conectarlo al proyecto con el nombre exacto ZYRO.
2. Cargar tres variables secretas: ADMIN_USER, ADMIN_PASS y AUTH_SECRET.
3. Usar como carpeta de salida (build output directory): public. Sin comando de build.
