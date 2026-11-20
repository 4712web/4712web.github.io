-- Tablas para el asistente con IA (Supabase > SQL Editor > pegar y Run).
-- Cada distribuidora tiene su clave, si la IA está activa y su límite de gasto por mes.

create table if not exists distribuidores (
  id          text primary key,            -- ej: 'martinez'
  nombre      text not null,
  clave_hash  text not null,               -- sha256 de la clave de acceso (nunca la clave)
  ia_activa   boolean not null default false,  -- arranca APAGADA: se activa cuando paga
  limite_usd  numeric not null default 5       -- tope de gasto de IA por mes, en dólares
);

create table if not exists uso_ia (
  distribuidor text not null references distribuidores(id),
  mes          text not null,              -- '2026-11'
  usd          numeric not null default 0,
  mensajes     integer not null default 0,
  primary key (distribuidor, mes)
);

-- Nadie lee estas tablas desde el navegador: solo el servidor (service role).
alter table distribuidores enable row level security;
alter table uso_ia enable row level security;

-- Suma el gasto de un mensaje de forma atómica.
create or replace function sumar_uso(d text, m text, c numeric)
returns numeric language sql security definer as $$
  insert into uso_ia (distribuidor, mes, usd, mensajes) values (d, m, c, 1)
  on conflict (distribuidor, mes) do update
    set usd = uso_ia.usd + excluded.usd, mensajes = uso_ia.mensajes + 1
  returning usd;
$$;
revoke all on function sumar_uso(text, text, numeric) from public, anon, authenticated;

-- Alta de una distribuidora (cambiá la clave):
-- insert into distribuidores (id, nombre, clave_hash, ia_activa, limite_usd)
-- values ('martinez', 'Distribuidora Martínez', encode(sha256('LA-CLAVE'::bytea), 'hex'), false, 5);
--
-- Activar la IA cuando paga:     update distribuidores set ia_activa = true  where id = 'martinez';
-- Cambiar el límite del mes:     update distribuidores set limite_usd = 10   where id = 'martinez';
-- Ver cuánto gastó cada una:     select * from uso_ia order by mes desc;
