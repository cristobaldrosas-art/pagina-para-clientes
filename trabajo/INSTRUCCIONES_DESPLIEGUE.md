# Guía de Despliegue: VIP Motors (GitHub, Supabase y Render)

Esta guía te guiará paso a paso para subir tu catálogo de vehículos a internet de forma gratuita.

---

## Paso 1: Configurar la Base de Datos en Supabase

1. Entra a tu panel de [Supabase](https://supabase.com/) y abre tu proyecto.
2. En el menú lateral izquierdo, haz clic en **SQL Editor** (el icono de código `SQL`).
3. Haz clic en **New query** (Nueva consulta).
4. Pega el siguiente código SQL y presiona el botón **Run** (Ejecutar) abajo a la derecha:

```sql
-- 1. Crear la tabla de vehículos
create table vehicles (
  id text primary key,
  brand text not null,
  model text not null,
  year integer not null,
  mileage integer not null,
  fuel text not null,
  transmission text not null,
  price bigint not null,
  image text,
  status text not null default 'disponible',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habilitar la seguridad de filas (RLS)
alter table vehicles enable row level security;

-- 3. Crear política de lectura pública (cualquiera puede ver el stock)
create policy "Permitir lectura publica" 
on vehicles for select 
to anon 
using (true);

-- 4. Crear política de escritura pública/anon (para el panel administrador)
create policy "Permitir gestion completa anon"
on vehicles for all 
to anon 
using (true);
```

*Nota: Una vez ejecutado con éxito, la base de datos estará lista para sincronizarse con la web.*

---

## Paso 2: Subir tu Código a GitHub

Ya hemos inicializado el repositorio Git local y guardado los archivos. Para subirlo a tu cuenta de GitHub, sigue estos pasos:

1. Ve a [GitHub](https://github.com/) e inicia sesión.
2. Haz clic en **New** (Nuevo) para crear un nuevo repositorio.
3. Ponle un nombre (ej. `catalogo-vehiculos`) y déjalo como **Público**.
4. **No** selecciones "Add a README file", "Add .gitignore" ni "Choose a license" (ya creamos estos archivos localmente). Haz clic en **Create repository**.
5. Copia la URL de tu repositorio (se verá como `https://github.com/TU_USUARIO/catalogo-vehiculos.git`).
6. Abre tu terminal (PowerShell o CMD) en la carpeta del proyecto y ejecuta los siguientes comandos:

```bash
# Vincular tu carpeta local con el repositorio de GitHub (reemplaza con tu URL)
git remote add origin https://github.com/TU_USUARIO/catalogo-vehiculos.git

# Renombrar la rama principal a main
git branch -M main

# Subir el código a GitHub (te pedirá iniciar sesión si es la primera vez)
git push -u origin main
```

### Método Alternativo 2: Subir archivos directamente en el navegador (Sin Consola)
Si no tienes Git instalado en tu computadora, puedes subir los archivos usando la página web de GitHub:
1. Crea el repositorio en GitHub siguiendo los pasos anteriores.
2. En la pantalla inicial que aparece tras crear el repositorio, busca el enlace que dice: **"uploading an existing file"** (subir un archivo existente).
3. Selecciona todos los archivos de tu carpeta del proyecto (`index.html`, `INSTRUCCIONES_DESPLIEGUE.md`, y las carpetas `css/`, `js/`, `assets/`) y arrástralos al recuadro de la página.
4. Presiona el botón verde **"Commit changes"** abajo. ¡Tus archivos estarán listos en GitHub!

---

## Paso 3: Desplegar en Render (Hosting Gratis)

Render conectará tu repositorio de GitHub y publicará tu web de forma 100% gratuita.

1. Ve a [Render](https://render.com/) e inicia sesión (puedes usar tu cuenta de GitHub para ingresar rápido).
2. En el panel principal, haz clic en el botón azul **New +** y selecciona **Static Site** (Sitio Estático).
3. Conecta tu cuenta de GitHub (si no lo has hecho) y selecciona el repositorio `catalogo-vehiculos` de la lista.
4. Rellena los datos de configuración:
   * **Name**: `catalogo-vip-motors` (o el nombre que quieras para tu URL).
   * **Branch**: `main`.
   * **Build Command**: *Déjalo vacío* (ya que es HTML/JS estático).
   * **Publish Directory**: *Escribe un punto* `.` (o déjalo en blanco para que use la raíz).
5. Haz clic en **Create Static Site** al final de la página.

¡Listo! Render compilará tu sitio en segundos y te dará una URL pública gratuita (por ejemplo, `https://catalogo-vip-motors.onrender.com`). Cada vez que hagas un cambio en tu código y lo subas a GitHub (`git push`), Render actualizará tu sitio web en internet automáticamente.
