# Activar la IA del asistente

Mientras la IA está apagada, el asistente funciona en **modo prueba** (gratis, sin
servidor). Estos pasos se hacen **recién cuando tengas el primer cliente que pague**.

## Lo que necesitás
- Cuenta de **Supabase** (gratis): supabase.com
- Cuenta en **console.anthropic.com** con tarjeta a tu nombre (pagos en dólares).

## 1. Límite de gasto en Anthropic (primero esto)
En console.anthropic.com buscá la sección de **límites de gasto** (Limits) y poné un
tope mensual para toda la cuenta (ej: USD 10 por cada cliente activo). Es la red de seguridad: aunque algo
falle, Anthropic no cobra más que eso.

## 2. Tablas en Supabase
Supabase → tu proyecto → **SQL Editor** → pegá `esquema.sql` → **Run**.
Después da de alta al cliente (cambiá la clave):

```sql
insert into distribuidores (id, nombre, clave_hash, ia_activa, limite_usd)
values ('martinez', 'Distribuidora Martínez', encode(sha256('LA-CLAVE'::bytea), 'hex'), true, 5);
```

`limite_usd` es el tope por mes **de ese cliente**: cuando lo alcanza, el chat sigue
en modo prueba hasta el mes siguiente.

## 3. Subir el servidor
Supabase → **Edge Functions** → crear función `asistente` → pegá `asistente/index.ts`.
En **Edge Functions → Secrets** agregá `ANTHROPIC_API_KEY` (la clave de la consola de
Anthropic). Nunca la pegues en el chat ni en el código.

## 4. Conectar el panel
Panel → **Asistente → Ajustes**:
- Usar IA: ✔
- Dirección del servidor: `https://TU-PROYECTO.supabase.co/functions/v1/asistente`
- Código del distribuidor: `martinez`
- Clave de acceso: la que pusiste en el paso 2

## Control del día a día (SQL Editor)
- Cuánto gastó cada cliente: `select * from uso_ia order by mes desc;`
- Subir el límite: `update distribuidores set limite_usd = 10 where id = 'martinez';`
- Apagar la IA (no pagó): `update distribuidores set ia_activa = false where id = 'martinez';`

Modelo: Claude Haiku 5.5 (el más barato, alcanza para esta tarea). Se puede cambiar
con el secret `MODELO`. El costo se calcula un poco por arriba del real, así que el
límite nunca se pasa.
