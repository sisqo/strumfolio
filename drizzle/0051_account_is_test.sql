-- Gli account di prova si possono marcare, e la lista degli account li nasconde finché
-- l'operatore non chiede di vederli.
--
-- È un filtro della vista e basta, per decisione del proprietario (2026-09-23): coupon, email
-- di cortesia, notifiche e tetti delle campagne trattano un account di prova come uno vero,
-- che è esattamente quello che serve a chi lo usa per provare.
--
-- Il riempimento marca solo `@strumfolio.test`, il dominio di `/qa`: `.test` è riservato
-- dall'RFC 2606, quindi nessuna persona reale può averlo. In produzione non tocca nessuna riga;
-- gli account di prova di lì li marca il proprietario a mano, scegliendoli lui.
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "is_test" boolean NOT NULL DEFAULT false;

UPDATE "accounts" SET "is_test" = true WHERE "owner_email" LIKE '%@strumfolio.test';
