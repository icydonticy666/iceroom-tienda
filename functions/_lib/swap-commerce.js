import { PRODUCTS, priceOf, sellableInClp } from './catalog.js';
import { USD_CENTS } from './campaign.js';

// Plan → variable de Pages con el ID de Payhip y precio en USD (centavos) que debe tener.
// fullstack: FULL STACK (31-oct-2026), swap Pro + plantillas FL y Ableton + los 4 Pritti a US$29.99.
const PLANS = {
  pro: ['SWAP_PRO_PRODUCT_KEY', 999],
  bundle: ['SWAP_PACK_PRODUCT_KEY', 1999],
  'bundle-ableton': ['SWAP_PACK_ABLETON_PRODUCT_KEY', 1999],
  fullstack: ['SWAP_FULLSTACK_PRODUCT_KEY', 2999],
  // studio: Pritti Studio (QLfl6) con swap Pro agregado al bundle el 5-nov-2026, US$29.99.
  studio: ['SWAP_STUDIO_PRODUCT_KEY', 2999],
  // studio-upgrade: Full Pritti Studio (95wzC), el upgrade desde el Pack SWAP Pro, US$24.99.
  'studio-upgrade': ['SWAP_UPGRADE_PRODUCT_KEY', 2499],
  // personalizada: Plantilla personalizada FL + Ableton + SWAP Pro (6Txiw), US$44.99.
  personalizada: ['SWAP_PERSONALIZADA_PRODUCT_KEY', 4499],
};

export function swapProductReady(env = {}, product) {
  // Productos nuevos que esperan su plan de precio en Payhip: no se venden hasta que su variable valga 1.
  if (product?.readyEnv && String(env[product.readyEnv] || '').trim() !== '1') return false;
  if (!product?.swapAccess) return true;
  const [variable, usd] = PLANS[product.swapPlan] || [];
  // trim(): un secreto cargado por consola puede llegar con salto de línea al final.
  return Boolean(variable && String(env.SWAP_PRO_DELIVERY_READY || '').trim() === '1' &&
    !product.testOnly && product.swapAccess === 'pro' && String(env[variable] || '').trim() === product.key &&
    USD_CENTS[product.key] === usd);
}

// IDs de Payhip verificados, no alias inventados ni productos de otros packs.
// Se habilita solo después de comprobar producto, entrega y activación Pro.
export function swapCommerce(env = {}, now = new Date()) {
  const plans = {
    pro: { name: 'SWAP Pro', usd: 999, variable: 'SWAP_PRO_PRODUCT_KEY' },
    bundle: { name: 'Plantilla FL + SWAP Pro', usd: 1999, variable: 'SWAP_PACK_PRODUCT_KEY' },
  };
  return Object.fromEntries(Object.entries(plans).map(([plan, info]) => {
    const key = String(env[info.variable] || '').trim();
    const product = PRODUCTS[key];
    const ready = Boolean(product?.swapAccess === 'pro' && product.swapPlan === plan && swapProductReady(env, product));
    return [plan, {
      name: info.name, usd: info.usd, ready,
      productKey: ready ? key : null,
      clp: ready && sellableInClp(product) ? priceOf(product, now) : null,
      paypalUrl: ready ? '/api/paypal-checkout?product=' + encodeURIComponent(key) : null,
    }];
  }));
}
