// Exécuté par Vercel au build (voir vercel.json > buildCommand).
// Lit STRIPE_PUBLISHABLE_KEY et STRIPE_BUY_BUTTON_ID dans les Environment
// Variables du projet Vercel et régénère web/config.js avec les vraies
// valeurs, sans jamais les committer dans le repo git.

const fs = require('fs');
const path = require('path');

const key = process.env.STRIPE_PUBLISHABLE_KEY;
const buttonId = process.env.STRIPE_BUY_BUTTON_ID;

if (!key || !buttonId) {
  console.warn(
    '[build-config] STRIPE_PUBLISHABLE_KEY et/ou STRIPE_BUY_BUTTON_ID absents des ' +
    'Environment Variables Vercel — web/config.js gardera ses valeurs placeholder ' +
    'et le site affichera "Stripe non configuré" au lieu du bouton de paiement.'
  );
}

const content = `// Généré au build par build-config.js à partir des variables d'environnement Vercel. Ne pas éditer à la main.
window.PITWALL_STRIPE_CONFIG = {
  publishableKey: ${JSON.stringify(key || 'REMPLACE_MOI_pk_live_ou_pk_test')},
  buyButtonId: ${JSON.stringify(buttonId || 'REMPLACE_MOI_buy_btn_xxx')},
};
`;

fs.writeFileSync(path.join(__dirname, 'web', 'config.js'), content);
console.log('[build-config] web/config.js généré.');
