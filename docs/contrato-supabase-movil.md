# Contrato Supabase de la app móvil

Fuente de verdad del esquema: `web_portal_impulsa360/supabase/migrations/` (baseline de producción del 2026-10-29 más migraciones posteriores). Este documento lista solo lo que la app lee o escribe; un cambio incompatible en cualquiera de estos puntos rompe los builds instalados.

## Tablas (acceso directo, protegido por RLS)

| Tabla | Operación | Columnas / filtro | Código |
|---|---|---|---|
| `activaciones` | `upsert` (`onConflict: 'id'`) | `CAMPOS_ACTIVACION_SUPABASE` + `usuario_id` | `lib/activationRecord.js`, `App.js` |
| `activaciones` | `select *` | `usuario_id = <propio o del impulsador>`, orden por `fecha_activacion` | `components/ControlActivadores.js`, `components/FormulariosPorImpulsador.js` |
| `activadores` | `select *` | `usuario_id = auth.uid()` | `App.js`, `components/AuthScreen.js` |
| `activador_roles` | `select rol` | `usuario_id = auth.uid()` | `App.js`, `components/AuthScreen.js` |
| `activador_plaza_temporal` | `select *` | propio, `cancelado_at is null` | `lib/plazasTemporales.js` |
| `notificaciones_destinatarios` | `select`, `update leida_at`, conteos | `usuario_id = auth.uid()` | `lib/notificaciones.js` |
| `notificaciones` | `select id, titulo, mensaje, created_at` | `id in (...)` | `lib/notificaciones.js` |
| `plazas` | `select id, nombre, nombre_normalizado, aliases` | `activa = true` y `es_ciudad_geografica = true` (política y grants por columna para `authenticated`) | `lib/catalogoUbicaciones.js` |

Columnas escritas en `activaciones`: `id`, `usuario_id`, `nombres_cliente`, `apellidos_cliente`, `ci_cliente`, `telefono_cliente`, `email_cliente`, `descargo_app`, `registro`, `cash_in`, `cash_out`, `p2p`, `qr_fisico`, `hubo_error`, `descripcion_error`, `tipo_error`, `foto_cash_in`, `tipo_tienda`, `rubro_comercio`, `rubro_comercio_otro`, `comercio_fuera_mercado`, `es_plaza_temporal`, `plaza_temporal`, `tipo_activacion`, `base_activacion`, `es_reactivacion`, `tamano_tienda`, `tipo_comercio`, `foto_url`, `fecha_activacion`, `latitud`, `longitud`, `reactivacion_comercio`, `respaldo`, `creditos`, `remesas`, `ciudad_activacion`, `zona_activacion`, `distrito_gps`, `region_gps`, `plaza`, `estado_sync`, `dispositivo`.

Las columnas `*_registro` (equipo, líder, plaza, facturador) no las envía la app: las llena el trigger `trg_snapshot_organizacion_activacion`.

## RPC

| Función | Uso | Código |
|---|---|---|
| `control_activadores_jerarquia(p_desde, p_hasta)` | Métricas por líder, equipo y activador. Fecha de referencia `America/La_Paz`. | `components/ControlActivadores.js` |
| `control_activaciones_detalle(p_activador_id, p_equipo_id, p_desde, p_hasta)` | Detalle de activaciones de un activador. | `components/ControlActivadores.js` |
| `validar_elegibilidad_reactivacion(p_ci, p_telefono, p_tipo_activacion, p_fecha_referencia, p_registro_id)` | Valida el periodo mínimo antes de guardar y sincronizar. | `lib/elegibilidadReactivacion.js` |
| `registrar_eventos_telemetria(p_eventos jsonb)` | Inserta de 1 a 20 eventos en `telemetria_eventos`. | `lib/telemetry.js` |

## Storage

- Bucket privado `fotos-activaciones`.
- Rutas: `activaciones/<usuario_id>/<registro_id>/principal.jpg` y `.../cash-in.jpg`. Se mantienen rutas históricas para lectura.
- Políticas: propietario (`select`, `insert`, `update`) y lectura por equipo mediante `puede_leer_foto_activacion_equipo`.

## Realtime

- Canal `rt-notificaciones-<usuario_id>` sobre `notificaciones_destinatarios`, filtro `usuario_id`.
- A 2026-10-29 la publicación `supabase_realtime` de producción está vacía: la suscripción no recibe eventos hasta que se agregue la tabla.

## Invariante de identidad

`activadores.usuario_id = auth.uid()` para todo usuario móvil. Las políticas RLS, las RPC y las rutas de Storage dependen de ello.
