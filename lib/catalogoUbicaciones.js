import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { withTimeout } from './asyncTimeout';

const CACHE_KEY = 'catalogo_ubicaciones_v1';
const CACHE_VERSION = 1;
const QUERY_TIMEOUT_MS = 10000;

export const normalizarUbicacion = (valor = '') => String(valor ?? '')
  .trim()
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_/.-]+/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const esCiudadValida = (ciudad) => (
  ciudad
  && typeof ciudad === 'object'
  && typeof ciudad.id === 'string'
  && ciudad.id.trim().length > 0
  && typeof ciudad.nombre === 'string'
  && ciudad.nombre.trim().length > 0
  && typeof ciudad.nombre_normalizado === 'string'
  && ciudad.nombre_normalizado.trim().length > 0
  && Array.isArray(ciudad.aliases)
  && ciudad.aliases.every((alias) => typeof alias === 'string' && alias.trim().length > 0)
);

const validarCiudades = (ciudades) => {
  if (!Array.isArray(ciudades) || ciudades.length === 0 || !ciudades.every(esCiudadValida)) {
    return null;
  }
  const ids = new Set(ciudades.map((ciudad) => ciudad.id));
  if (ids.size !== ciudades.length) return null;
  const nombresOficiales = new Set(ciudades.map((ciudad) => normalizarUbicacion(ciudad.nombre)));
  return nombresOficiales.size === ciudades.length ? ciudades : null;
};

const validarCache = (cache) => {
  if (
    !cache
    || cache.version !== CACHE_VERSION
    || typeof cache.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(cache.updatedAt))
  ) return null;
  const ciudades = validarCiudades(cache.ciudades);
  return ciudades ? { ...cache, ciudades } : null;
};

export const leerCatalogoUbicacionesCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? validarCache(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

const persistirCatalogo = async (ciudades) => {
  const catalogo = {
    version: CACHE_VERSION,
    updatedAt: new Date().toISOString(),
    ciudades,
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(catalogo));
  return catalogo;
};

export const actualizarCatalogoUbicaciones = async () => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user?.id) {
    throw new Error('Se requiere una sesión autenticada para actualizar ciudades.');
  }

  const { data, error } = await withTimeout(
    supabase
      .from('plazas')
      .select('id,nombre,nombre_normalizado,aliases')
      .eq('activa', true)
      .eq('es_ciudad_geografica', true)
      .order('nombre'),
    QUERY_TIMEOUT_MS,
    'La actualización del catálogo de ciudades está tardando demasiado.'
  );
  if (error) throw error;
  const ciudades = validarCiudades(data);
  if (!ciudades) throw new Error('El catálogo remoto de ciudades está vacío o tiene un formato inválido.');
  return persistirCatalogo(ciudades);
};

export const obtenerCatalogoUbicaciones = async ({ isConnected } = {}) => {
  const cache = await leerCatalogoUbicacionesCache();
  if (isConnected === false) return cache;
  try {
    return await actualizarCatalogoUbicaciones();
  } catch (error) {
    if (cache) return cache;
    throw error;
  }
};

const sinPrefijoDepartamento = (region) => String(region ?? '')
  .replace(/^\s*departamento\s+del?\s+/i, '')
  .replace(/\s+department\s*$/i, '');

// Orden de confianza: el departamento es el último recurso porque puede llamarse
// igual que otra ciudad (Montero está en el "Departamento de Santa Cruz").
export const candidatosCiudadGps = (direccion = {}) => [
  direccion.city,
  direccion.subregion,
  sinPrefijoDepartamento(direccion.region),
].filter(Boolean);

export const resolverCiudadGps = (candidatos, ciudades) => {
  const valores = (Array.isArray(candidatos) ? candidatos : [candidatos])
    .map(normalizarUbicacion)
    .filter(Boolean);
  const catalogo = (validarCiudades(ciudades) || []).map((ciudad) => ({
    ciudad,
    nombres: [ciudad.nombre, ciudad.nombre_normalizado, ...ciudad.aliases].map(normalizarUbicacion),
  }));

  for (const valor of valores) {
    const coincidencias = catalogo.filter(({ nombres }) => nombres.includes(valor));
    if (coincidencias.length === 1) return coincidencias[0].ciudad;
  }
  return null;
};
