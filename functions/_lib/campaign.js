// The timestamps are set at activation and shared by pricing and the storefront.
// Promo sitewide vigente. Antes: Cyber Day 25% (4 al 7-oct). Ahora: 50% por 24 horas,
// pedido por el usuario el 23-oct-2026, de 12:00 a 12:00 hora de Chile. En PayPal la aplica
// la venta "MITAD24H" de Payhip (Marketing → Run Sale).
export const CYBER = {
  enabled: true,
  name: 'Mitad de precio',
  percent: 50,
  badge: '−50% · 24 H',
  kicker: 'Mitad de precio · 24 horas',
  startsAt: '2026-10-23T15:00:00.000Z',
  endsAt: '2026-10-24T15:00:00.000Z',
};

export function cyberActive(now = new Date()) {
  const time = Number(now);
  return CYBER.enabled && time >= Date.parse(CYBER.startsAt) && time < Date.parse(CYBER.endsAt);
}

export function cyberPrice(amount) {
  return amount - Math.round(amount * CYBER.percent / 100);
}

export const USD_CENTS = {
  '0QEeV': 1299, xNaVU: 1598, '34vZU': 300, '3j8In': 1299, h32nW: 1598,
  '8Ljoq': 1999, QLfl6: 2999, Vo0Sq: 699, SQti3: 499,
  Nqvbs: 399, '5JbVN': 499, G5U1r: 1999, a8IWu: 2999,
  IiHTG: 5999, z6Bgp: 6999, '0xES9': 999, i5fkg: 999, JXKg8: 2999, '8zVP2': 1999, UVYyl: 2999, saPdL: 1999,
  '95wzC': 2499, // Full Pritti Studio: Pack SWAP Pro (US$19.99) + US$5
};

// Campaña anterior: swap completo gratis con cualquier compra (25-oct-2026).
// Se apaga al separar swap Free de swap Pro el 27-oct-2026. Las rutas estables se
// conservan para no romper los correos ni las descargas entregadas anteriormente.
// Las descargas son las del repo público icydonticy666/swap-releases (swap se actualiza solo).
const SWAP_RELEASE = 'https://github.com/icydonticy666/swap-releases/releases/download/v0.12.1/';
export const SWAP_GIFT = {
  enabled: false,
  startsAt: '2026-10-25T03:00:00.000Z',
  endsAt: '',
  version: '0.12.1',
  downloads: {
    windows: SWAP_RELEASE + 'swap-0.12.1-windows-instalador.exe',
    macSilicon: SWAP_RELEASE + 'swap-0.12.1-mac-apple-silicon.dmg',
    macIntel: SWAP_RELEASE + 'swap-0.12.1-mac-intel.dmg',
  },
};

export function swapGiftActive(now = new Date()) {
  const time = Number(now);
  return SWAP_GIFT.enabled && time >= Date.parse(SWAP_GIFT.startsAt) &&
    (!SWAP_GIFT.endsAt || time < Date.parse(SWAP_GIFT.endsAt));
}
