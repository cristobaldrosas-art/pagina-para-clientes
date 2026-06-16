// Carga dinámica del archivo .env para compatibilidad con sitios estáticos
async function loadEnv() {
  try {
    const response = await fetch('.env');
    if (!response.ok) throw new Error('No se pudo cargar el archivo .env');
    const text = await response.text();
    
    const env = {};
    text.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value) {
          env[key.trim()] = value.trim();
        }
      }
    });

    window.SUPABASE_URL = env.SUPABASE_URL || "https://cvoevaesdbjpneulfecq.supabase.co";
    window.SUPABASE_KEY = env.SUPABASE_KEY || "sb_publishable_AyEd9HKI2r0STwK8PnpHNQ_WG1YWBt6";
  } catch (err) {
    console.warn("No se pudo leer el archivo .env en caliente (CORS o archivo no encontrado). Usando credenciales de respaldo local.", err);
    // Valores de respaldo predeterminados
    window.SUPABASE_URL = "https://cvoevaesdbjpneulfecq.supabase.co";
    window.SUPABASE_KEY = "sb_publishable_AyEd9HKI2r0STwK8PnpHNQ_WG1YWBt6";
  }
}

// Inicializar la promesa de carga de entorno
window.loadEnvPromise = loadEnv();
