const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const CACHE_KEY = 'catalogo_ubicaciones_v1';
const catalogoFile = path.resolve('lib/catalogoUbicaciones.js');

const ciudad = (id, nombre, aliases = []) => ({
  id,
  nombre,
  nombre_normalizado: nombre.toLowerCase(),
  aliases,
});

const cargarCatalogo = ({ cache = null, respuesta = { data: [], error: null } } = {}) => {
  const persisted = new Map(cache ? [[CACHE_KEY, JSON.stringify(cache)]] : []);
  const writes = [];
  const asyncStorage = {
    getItem: async (key) => persisted.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push({ key, value });
      persisted.set(key, value);
    },
  };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'usuario-1' } } }, error: null }) },
    from: () => {
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        order: async () => respuesta,
      };
      return consulta;
    },
  };

  const transformed = babel.transformFileSync(catalogoFile, {
    babelrc: false,
    configFile: false,
    presets: [require.resolve('babel-preset-expo')],
  }).code;
  const compiled = new Module(catalogoFile, module);
  compiled.filename = catalogoFile;
  compiled.paths = Module._nodeModulePaths(path.dirname(catalogoFile));
  compiled.require = (request) => {
    if (request === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: asyncStorage };
    }
    if (request === './supabase') return { supabase };
    if (request === './asyncTimeout') return { withTimeout: (promesa) => promesa };
    return Module.prototype.require.call(compiled, request);
  };
  compiled._compile(transformed, catalogoFile);
  return { catalogo: compiled.exports, persisted, writes };
};

test('rechaza nombres oficiales equivalentes aunque tengan UUID distintos', async () => {
  const { catalogo, writes } = cargarCatalogo({
    respuesta: {
      data: [ciudad('1', 'Concepción'), ciudad('2', 'Concepcion')],
      error: null,
    },
  });

  await assert.rejects(
    catalogo.actualizarCatalogoUbicaciones(),
    /vacío o tiene un formato inválido/,
  );
  assert.equal(writes.length, 0);
});

test('conserva el último caché válido si la respuesta remota tiene nombres equivalentes', async () => {
  const cache = {
    version: 1,
    updatedAt: '2026-10-29T12:00:00.000Z',
    ciudades: [ciudad('cache-1', 'La Paz')],
  };
  const { catalogo, persisted, writes } = cargarCatalogo({
    cache,
    respuesta: {
      data: [ciudad('1', 'Potosí'), ciudad('2', 'Potosi')],
      error: null,
    },
  });

  const resultado = await catalogo.obtenerCatalogoUbicaciones({ isConnected: true });
  assert.deepEqual(resultado, cache);
  assert.equal(writes.length, 0);
  assert.equal(persisted.get(CACHE_KEY), JSON.stringify(cache));
});

test('mantiene aliases ambiguos y el resolver falla de forma segura', () => {
  const primera = ciudad('1', 'Ciudad Uno', ['Centro']);
  const segunda = ciudad('2', 'Ciudad Dos', ['Centro']);
  const { catalogo } = cargarCatalogo();

  assert.equal(catalogo.resolverCiudadGps('Centro', [primera, segunda]), null);
});

const CATALOGO_PROD = [
  ciudad('1', 'Camiri'),
  ciudad('2', 'Cochabamba'),
  ciudad('3', 'Concepcion', ['Concepción']),
  ciudad('4', 'El Alto'),
  ciudad('5', 'La Paz'),
  ciudad('6', 'Montero'),
  ciudad('7', 'Riberalta'),
  ciudad('8', 'San Ignacio', ['San Ignacio de Velasco']),
  ciudad('9', 'Santa Cruz de la Sierra', ['Santa Cruz']),
];

test('la ciudad gana al departamento aunque este coincida con otra ciudad', () => {
  const { catalogo } = cargarCatalogo();
  const casos = [
    ['Montero', 'Departamento de Santa Cruz', 'Montero'],
    ['Camiri', 'Departamento de Santa Cruz', 'Camiri'],
    ['Concepción', 'Departamento de Santa Cruz', 'Concepcion'],
    ['San Ignacio de Velasco', 'Departamento de Santa Cruz', 'San Ignacio'],
    ['El Alto', 'Departamento de La Paz', 'El Alto'],
    ['Riberalta', 'Departamento del Beni', 'Riberalta'],
    ['Santa Cruz de la Sierra', 'Santa Cruz Department', 'Santa Cruz de la Sierra'],
  ];

  for (const [city, region, esperada] of casos) {
    const candidatos = catalogo.candidatosCiudadGps({ city, region });
    assert.equal(catalogo.resolverCiudadGps(candidatos, CATALOGO_PROD)?.nombre, esperada);
  }
});

test('el departamento resuelve la ciudad solo si no hay coincidencia más específica', () => {
  const { catalogo } = cargarCatalogo();
  const resolver = (direccion) => catalogo.resolverCiudadGps(
    catalogo.candidatosCiudadGps(direccion),
    CATALOGO_PROD,
  )?.nombre ?? null;

  assert.equal(resolver({ city: 'Quillacollo', region: 'Departamento de Cochabamba' }), 'Cochabamba');
  assert.equal(resolver({ region: 'Departamento del Beni' }), null);
});

test('calles y barrios homónimos de otra ciudad no alteran la detección', () => {
  const { catalogo } = cargarCatalogo();
  const candidatos = catalogo.candidatosCiudadGps({
    city: 'Riberalta',
    district: 'Barrio La Paz',
    name: 'Avenida Santa Cruz',
    region: 'Departamento del Beni',
  });

  assert.equal(catalogo.resolverCiudadGps(candidatos, CATALOGO_PROD)?.nombre, 'Riberalta');
  assert.equal(catalogo.resolverCiudadGps('San Ignacio de Moxos', CATALOGO_PROD), null);
});

test('los slugs de versiones anteriores se convierten al nombre del catálogo', () => {
  const { catalogo } = cargarCatalogo();

  assert.equal(catalogo.resolverCiudadGps('santa_cruz', CATALOGO_PROD)?.nombre, 'Santa Cruz de la Sierra');
  assert.equal(catalogo.resolverCiudadGps('la_paz', CATALOGO_PROD)?.nombre, 'La Paz');
  assert.equal(catalogo.resolverCiudadGps('san_ignacio', CATALOGO_PROD)?.nombre, 'San Ignacio');
});
