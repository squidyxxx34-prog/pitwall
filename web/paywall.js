/*
 * PAYWALL — ne s'applique qu'à la version web hébergée.
 *
 * L'app desktop (Electron, gratuite et open-source) expose window.pitwallDesktop.isDesktop
 * via preload.js : ce fichier détecte ce flag et débloque immédiatement, sans jamais
 * afficher de mur de paiement dans l'app gratuite.
 *
 * Limite assumée (voir README) : sans backend, ce gating est côté client, donc
 * contournable par quelqu'un de déterminé. Suffisant pour un MVP, pas pour bloquer
 * un partage de lien organisé. À muscler avec une fonction serverless si besoin.
 *
 * Configuration : les valeurs Stripe viennent de window.PITWALL_STRIPE_CONFIG,
 * défini dans config.js. En local ce fichier contient des placeholders ; sur
 * Vercel il est régénéré au build depuis les Environment Variables du projet
 * (voir build-config.js et README).
 */

const STRIPE_CONFIG = window.PITWALL_STRIPE_CONFIG || {};
const STRIPE_PUBLISHABLE_KEY = STRIPE_CONFIG.publishableKey || 'REMPLACE_MOI_pk_live_ou_pk_test';
const STRIPE_BUY_BUTTON_ID = STRIPE_CONFIG.buyButtonId || 'REMPLACE_MOI_buy_btn_xxx';
const UNLOCK_STORAGE_KEY = 'pitwall_unlocked_v1';

function isDesktopApp(){
  return !!(window.pitwallDesktop && window.pitwallDesktop.isDesktop);
}

function isUnlocked(){
  return localStorage.getItem(UNLOCK_STORAGE_KEY) === '1';
}

function markUnlocked(){
  localStorage.setItem(UNLOCK_STORAGE_KEY, '1');
}

function consumeSuccessParam(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('unlocked') === '1'){
    markUnlocked();
    params.delete('unlocked');
    const clean = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', clean);
    return true;
  }
  return false;
}

function buildGateOverlay(){
  const overlay = document.createElement('div');
  overlay.id = 'paywallOverlay';
  overlay.innerHTML = `
    <div class="paywall-card">
      <div class="paywall-kicker">Accès Pitwall Web</div>
      <h2>Débloque le timing live</h2>
      <p>Accès unique à vie, sans abonnement. Le programme open-source pour PC reste gratuit —
      cet accès est pour ceux qui préfèrent la version web hébergée.</p>
      <div class="paywall-price">4,99&nbsp;€ <span>paiement unique</span></div>
      <div id="stripeButtonSlot" class="paywall-stripe-slot"></div>
      <p class="paywall-fine">Configuration Stripe manquante ? Vérifie <code>paywall.js</code> (clé publique + identifiant du bouton).</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function mountStripeButton(){
  if (STRIPE_PUBLISHABLE_KEY.startsWith('REMPLACE_MOI') || STRIPE_BUY_BUTTON_ID.startsWith('REMPLACE_MOI')){
    const slot = document.getElementById('stripeButtonSlot');
    slot.innerHTML = `<div class="paywall-missing-config">Stripe non configuré — renseigne ta clé publique et ton Buy Button ID dans paywall.js pour activer le paiement.</div>`;
    return;
  }
  if (!document.getElementById('stripeJsSdk')){
    const script = document.createElement('script');
    script.id = 'stripeJsSdk';
    script.src = 'https://js.stripe.com/v3/buy-button.js';
    document.head.appendChild(script);
  }
  const slot = document.getElementById('stripeButtonSlot');
  slot.innerHTML = `<stripe-buy-button
      buy-button-id="${STRIPE_BUY_BUTTON_ID}"
      publishable-key="${STRIPE_PUBLISHABLE_KEY}">
    </stripe-buy-button>`;
}

function initPaywall(){
  if (isDesktopApp()) return; // app gratuite : jamais de mur de paiement

  const justUnlocked = consumeSuccessParam();
  if (isUnlocked() || justUnlocked) return; // déjà payé sur ce navigateur

  buildGateOverlay();
  mountStripeButton();
}

initPaywall();
