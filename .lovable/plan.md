# Painel Admin — plano de etapas

Novo painel administrativo dentro do próprio sistema, com o mesmo visual (azul/verde/cinza, Roboto Condensed/Flex) das demais telas. Mesma tela de login dos usuários: quem entrar com **adriantmj49@gmail.com** passa a ver a opção "Admin"; os demais usuários não veem nada diferente.

## Etapa 1 — Acesso do administrador
- A conta adriantmj49@gmail.com já está marcada como administradora no banco; a senha continua a atual (`cotarme@admin356` só será redefinida se você confirmar).
- Login continua o mesmo para todos. Após entrar, o administrador ganha um item "Painel Admin" no menu.
- Quem não for administrador que tentar abrir o painel é devolvido para a tela inicial.

## Etapa 2 — Redes
- Tela para criar, renomear e excluir redes.
- Vincular e desvincular usuários a uma rede (inclusive em lote), com indicação de quantos usuários cada rede tem.

## Etapa 3 — Usuários
- Lista com busca e filtros (rede, situação, bloqueado, vencido).
- Ações por usuário: bloquear/desbloquear, definir rede, definir data de expiração do acesso, encerrar sessões, redefinir senha.
- Ações por rede: bloquear a rede inteira ou definir um prazo de acesso válido para todos os seus usuários.

## Etapa 4 — Bloqueio e prazo valendo de verdade
- Usuário bloqueado ou com prazo vencido é impedido de entrar e de gravar dados (regra aplicada no banco, não só na tela), com mensagem clara na tela de login.
- O prazo da rede vale para todos os usuários dela; o prazo individual, quando definido, tem prioridade.

## Etapa 5 — Árvore de dados por usuário
- Visualização em árvore de pastas: Usuário → Cotações → Itens/Respostas, além de Fornecedores, Links gerados, Chaves de acesso e Conversas do assistente.
- Ao clicar em qualquer nó, os dados reais são carregados do banco na hora (sem cópias nem dados de exemplo), com contagens e possibilidade de abrir o registro em detalhe.

## Etapa 6 — Registro de auditoria
- Toda ação do painel (bloqueio, vínculo de rede, mudança de prazo, exclusão) fica registrada com autor, data e detalhe, visível numa aba do painel.

## Etapa 7 — Fechamento
- Testes de ponta a ponta: entrar como administrador, bloquear um usuário de teste, conferir que ele não consegue entrar, desbloquear.
- Geração do pacote atualizado para upload no cPanel.

## Detalhes técnicos
- Rota `/admin` protegida por `ProtectedRoute` + verificação de papel `admin` em `user_roles` (já existente via `has_role`), com guarda também no banco via RLS.
- Reaproveitar as tabelas já existentes: `networks`, `profiles.network_id`, `user_roles`, `master_audit_logs`.
- Migração para adicionar em `profiles` (ou tabela `user_access`) os campos `blocked_at`, `blocked_reason`, `access_expires_at`, e em `networks.config` os campos de bloqueio/prazo da rede; função `public.is_user_active(uuid)` usada nas políticas de escrita das tabelas de dados.
- Políticas RLS adicionais: administrador pode ler (e, onde necessário, alterar) todas as linhas das tabelas de dados — sem afetar o isolamento por usuário já existente.
- Operações administrativas sensíveis (redefinir senha, encerrar sessões, exclusão em cascata) via edge function com service role, restrita a administradores.
- Componentes novos: `src/pages/AdminPanel.tsx` e `src/components/admin/*` (Usuários, Redes, Árvore de dados, Auditoria), usando os mesmos componentes de UI já adotados no sistema.
