# Histórico do novo ambiente

O pacote gerado começa com `20260915010000_clean_install.sql`.
Após a primeira instalação real, congele os arquivos-fonte dessa base na revisão
de release. Registre alterações posteriores aqui como `YYYYMMDDHHMMSS_descricao.sql`,
com timestamp superior ao da base. O preparador inclui esses arquivos na ordem.

Não copie a cadeia legada de `supabase/migrations` para esta pasta e não altere
migrations já aplicadas. O banco antigo usa sua própria cadeia; atualizações que
precisem atingir ambos os ambientes exigem revisão e ensaio em cada cadeia.
