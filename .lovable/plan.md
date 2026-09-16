# Planilha com experiência próxima ao Excel

## Objetivo

Evoluir a planilha atual sem remover as regras de cotação já existentes. A entrega será feita em etapas utilizáveis, começando pela edição e segurança dos dados e avançando até fórmulas e recursos visuais.

## Etapa 1 — Edição segura e salvamento

- Permitir editar diretamente código, descrição, código de barras e preços de qualquer fornecedor.
- Abrir uma confirmação antes da primeira alteração em preços que vieram da resposta original de um fornecedor; a autorização valerá durante aquela sessão de edição.
- Manter edição imediata para fornecedores adicionados manualmente.
- Permitir iniciar a digitação apenas selecionando a célula, além do duplo clique atual.
- Completar atalhos esperados: Delete/Backspace para limpar, Enter/Tab para confirmar e avançar, Escape para cancelar, Ctrl/Cmd+C, V e Z.
- Fazer colagem em várias células funcionar também em produtos e fornecedores autorizados, normalizando valores em BRL.
- Adicionar salvamento automático com pequeno atraso após alterações, indicador “Salvando/Salvo/Erro” e manter o botão Salvar para gravação imediata.
- Preservar o histórico de Desfazer para alterações ainda não salvas e alterações persistidas durante a sessão.

## Etapa 2 — Aparência e interação de planilha

- Criar faixa superior compacta com menus de edição, formatação, dados e visualização.
- Exibir caixa de referência da célula selecionada e barra de conteúdo/fórmula.
- Adotar cabeçalhos visuais de coluna no estilo A, B, C sem ocultar os títulos de negócio.
- Melhorar seleção de linhas, colunas e intervalos, inclusive seleção total pelo canto superior esquerdo.
- Manter cabeçalhos e colunas essenciais fixos durante a rolagem.
- Ajustar densidade, bordas, estados de foco e barras de rolagem para leitura semelhante a uma planilha desktop.
- Manter a experiência funcional em telas menores, com a barra de ferramentas rolável horizontalmente.

## Etapa 3 — Produtividade e tratamento de dados

- Adicionar recortar, duplicar, limpar conteúdo, preencher para baixo/direita e aplicar valor a um intervalo selecionado.
- Implementar localizar e substituir nos campos de produto e preços.
- Evoluir a ordenação para três estados: crescente, decrescente e sem ordenação.
- Adicionar filtros por texto, faixa de preço, células vazias e fornecedor vencedor, mantendo o filtro por estado atual.
- Incluir congelamento visual de linhas/colunas e comandos de ajuste automático de largura/altura.
- Manter formatação, ordem, tamanhos e filtros isolados por cotação.

## Etapa 4 — Fórmulas avançadas

- Aceitar fórmulas iniciadas por `=` em células calculáveis e em novas colunas personalizadas.
- Suportar referências como `A1`, intervalos como `A1:A20` e operadores aritméticos.
- Implementar funções em português e equivalentes em inglês: SOMA/SUM, MÉDIA/AVERAGE, MÍNIMO/MIN, MÁXIMO/MAX, SE/IF, CONT.SE/COUNTIF e SOMASE/SUMIF.
- Exibir o resultado na célula e a expressão na barra de fórmulas.
- Detectar referências inválidas, divisão por zero e referências circulares, mostrando erro na célula sem impedir o restante da planilha.
- Recalcular dependências após edição, colagem, exclusão ou desfazer.

## Etapa 5 — Persistência e validação

- Salvar fórmulas e preferências de visualização separadamente dos dados originais da cotação, por usuário e cotação.
- Garantir que PDFs, análises, vencedores e exportações usem os valores calculados corretos sem perder os dados recebidos dos fornecedores.
- Validar cotações abertas e finalizadas, fornecedores manuais e respostas originais, MT/GO, preços com vírgula e listas extensas.
- Testar teclado, mouse, colagem do Excel, salvamento automático, falhas de conexão, confirmação de edição e restauração após recarregar a página.

## Detalhes técnicos

- Separar a tabela atual em módulos menores para grade, barra de ferramentas, edição, seleção, persistência e fórmulas.
- Usar um mecanismo consolidado de alterações para impedir gravações concorrentes e preservar o Desfazer.
- O salvamento automático será feito em fila, com atraso e nova tentativa, sem gravar a cada tecla isoladamente.
- A edição de resposta original só será enviada ao banco depois da confirmação explícita; nenhuma confirmação será exigida para dados manuais.
- Mudanças estruturais no banco serão aditivas, com acesso restrito ao proprietário da cotação e ao administrador.

## Critérios de aceite

- É possível editar qualquer preço com a proteção definida, colar intervalos e navegar somente pelo teclado.
- O usuário sempre sabe se as mudanças estão salvas e ainda pode usar o botão Salvar.
- A planilha mantém regras atuais de menor preço, segundo ganhador, tipo de preço, acréscimo, estados e moeda.
- Fórmulas persistem, recalculam corretamente e não produzem erros silenciosos.
- Ao recarregar a página, dados e preferências da cotação continuam disponíveis.