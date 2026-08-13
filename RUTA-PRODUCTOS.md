# iceroom — Ruta óptima para subir todos los productos

Meta: dejar todos los productos **vendiéndose en Payhip** y **conectados en la web**
(https://iceroom-tienda.pages.dev), cada uno con su imagen.

## Reparto de trabajo (para CADA producto)
- **TÚ:** subes el **archivo (.zip)** y la **imagen de portada** en Payhip
  (diálogo nativo — el harness me impide subir archivos locales).
- **YO:** creo el producto (título, precio, descripción, tipo), tomo el link
  `payhip.com/b/XXX`, conecto el botón en la web, pongo la imagen en la card,
  y **redeployo** (1 comando). También armo los .zip si me das la ruta local.

## Reglas fijas
- Software / plugins / proyectos → siempre **.zip** (Payhip solo acepta zip para software).
- Payhip gratis = **máx 5 GB por archivo**. Si se pasa, se parte en varios
  (Payhip permite varios archivos por producto).
- Imagen de portada: **cuadrada 1500×1500** (o 16:10 = 1600×1000). Mín 1000px. JPG/PNG, <5MB.
- Si los archivos están en tu PC → **dame la ruta y yo te armo el .zip**; tú solo subes.

## Orden óptimo (de lo simple a lo complejo)

### ✅ 0. Pritti Vocals — HECHO
- Publicado · $2.99 · gratis 1 semana (cupón GRATIS24) · en la web.
- **Falta:** imagen **1500×1500** → me la pasas y la conecto (Payhip + card).

### 1. Plantilla de Grabación — FL Studio · $21
- Archivo: proyecto FL en **.zip** (FLP + presets + readme).
- Imagen: `img/tienda/plantilla-fl.jpg` (ya existe → reusar como portada).
- Tipo Payhip: **Digital Product**.

### 2. Plantilla de Grabación — Ableton Live · $21
- Archivo: proyecto Ableton en **.zip** (ALS/racks + readme).
- Imagen: `img/tienda/plantilla-ableton.jpg` (reusar).
- Tipo: **Digital Product**.

### 3. Starter Pack — GRATIS
- Archivo: samples en **.zip** (10 kicks, 10 snares, 5 808s).
- Imagen: falta (o glyph "FREE"). Si tienes una, 1500×1500.
- Tipo: **Digital Product** (precio 0 o "pay what you want" con mín 0).

### 4. Masterclass: Mezcla Pro · $53
- Archivo: videos del curso (~5 GB) → **partir en 2 zips**
  (`Masterclass-P1.zip`, `Masterclass-P2.zip`, ~2.5 GB c/u) + un PDF/readme.
  *(Así no rozamos el límite de 5 GB por archivo.)*
- Imagen: `img/tienda/MasterClass.jpg` (reusar).
- Tipo: **Digital Product** (sin login; entrega los zips).
- Nota: one-time ahora → **suscripción** cuando migres de host (sesiones semanales).

### 5. The Ultimate Bundle · $74
- No lleva archivo propio: es un **Bundle** de Payhip que combina #1, #2 y #4.
- Requiere que 1, 2 y 4 ya existan.
- Imagen: `img/tienda/bundle.jpg` (reusar).
- Tipo: **Bundle**.

### ⏸️ Quedan "Próximamente" (sin archivo aún)
- FL Studio Mixing Template 2026 ($32)
- Daddy Issues DrumPack
- Last Night Baby Drumkit
→ Cuando tengas el archivo, mismo proceso; los activo en la web.

## Al terminar
- Web con **todos los botones activos** (adiós "Pronto en tienda").
- Cada producto con su **imagen** en la card + en Payhip.
- **Redeploy final** → todo vendiendo.

## Para arrancar YA (tu lista de recolección)
1. Imagen de **Pritti** (1500×1500).
2. **.zip** de Plantilla FL  +  **.zip** de Plantilla Ableton.
3. **.zip** del Starter Pack.
4. Videos del curso (para partirlos en 2 zips) — o su ruta local si los tienes en el PC.
Con eso vamos en orden: 1 → 2 → 3 → 4 → 5.
