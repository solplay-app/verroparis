const n = (k, d) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
module.exports = {
  MARGIN: n('ODDS_MARGIN', 1.07),            // identique à l'app d'origine (cotes affichées = cote/1.07)
  COMMISSION: n('COMMISSION_RATE', 0.3),     // sur le bénéfice net des gains (comme avant)
  CASHBACK: n('CASHBACK_RATE', 0.3),         // sur la mise perdue (comme avant)
  MIN_STAKE: n('MIN_STAKE_FCFA', 100),
  MAX_STAKE: n('MAX_STAKE_FCFA', 200000),
  MAX_PAYOUT: n('MAX_PAYOUT_FCFA', 5000000),
  MAX_PICKS: n('MAX_PICKS', 15),
  MIN_WITHDRAW: n('MIN_WITHDRAW_FCFA', 1000),
  MAX_WITHDRAW: n('MAX_WITHDRAW_FCFA', 2000000),
  VOID_AFTER_HOURS: n('VOID_AFTER_HOURS', 72), // match sans résultat après ce délai → mise remboursée
};
