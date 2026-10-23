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
  IiHTG: 5999, z6Bgp: 6999,
};
