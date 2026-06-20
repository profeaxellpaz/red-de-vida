// config.js — Conexión a Supabase (datos compartidos en la nube)
// La publishable key es PÚBLICA y segura para el navegador (la protección real
// la da Row Level Security + el inicio de sesión con la clave compartida).
const SUPABASE_URL = 'https://yhhatkyrwnnhpewbnqil.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W2LaRlFv1BWxf7cYKiID9g_xXNcjePQ';

// Usuario "del sistema" para la clave compartida (creado en Authentication → Users).
const ACCESO_EMAIL = 'acceso@reddevida.app';
