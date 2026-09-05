/*
 * Config par défaut, committée dans le repo avec des placeholders.
 * Sur Vercel, ce fichier est régénéré au build par /build-config.js à partir
 * des variables d'environnement STRIPE_PUBLISHABLE_KEY et STRIPE_BUY_BUTTON_ID
 * définies dans les Settings > Environment Variables du projet Vercel.
 * En local (double-clic sur index.html, ou app desktop), ce fichier reste tel
 * quel : la valeur n'est pas secrète (une clé Stripe "publishable" est faite
 * pour être exposée côté client), c'est une histoire de config propre, pas de
 * sécurité.
 */
window.PITWALL_STRIPE_CONFIG = {
  publishableKey: 'REMPLACE_MOI_pk_live_ou_pk_test',
  buyButtonId: 'REMPLACE_MOI_buy_btn_xxx',
};
