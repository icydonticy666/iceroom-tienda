// The timestamps are set at activation and shared by pricing and the storefront.
export const CYBER = {
  enabled: true,
  name: 'Cyber Day',
  percent: 25,
  startsAt: '2026-10-04T22:00:00.000Z',
  endsAt: '2026-10-07T22:00:00.000Z',
};

export function cyberActive(now = new Date()) {
  const time = Number(now);
  return CYBER.enabled && time >= Date.parse(CYBER.startsAt) && time < Date.parse(CYBER.endsAt);
}

export function cyberPrice(amount) {
  return amount - Math.round(amount * CYBER.percent / 100);
}

export const USD_CENTS = {
  '0QEeV': 1299, xNaVU: 1598, '34vZU': 300, '3j8In': 1299,
  '8Ljoq': 1999, QLfl6: 2999, Vo0Sq: 699, SQti3: 499,
  Nqvbs: 399, '5JbVN': 499, G5U1r: 1999, a8IWu: 2999,
  IiHTG: 5999, z6Bgp: 6999,
};
