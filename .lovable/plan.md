# PDF fiel ao Comparativo do Mix

## Objetivo
Gerar o PDF com a mesma ordem visual e o mesmo conteúdo exibidos na aba Comparativo, ajustados automaticamente à largura das páginas.

## Alterações
- Manter no início os mesmos indicadores e análises exibidos na tela: classes, equilíbrio, escada de preço, variedade, gramaturas e produtos fora da faixa.
- Reproduzir a planilha lado a lado no PDF com três níveis de cabeçalho: classes, marcas e imagem representativa de cada marca.
- Exibir abaixo de cada marca os produtos na mesma sequência da tela, alternando descrição/código/gramatura e preço, com o menor preço em verde.
- Respeitar integralmente a busca, a gramatura selecionada e a ocultação de marcas sem produtos filtrados.
- Dividir automaticamente muitas marcas em blocos de colunas e muitas linhas em páginas, repetindo os cabeçalhos para preservar a leitura.
- Usar orientação paisagem e dimensões calculadas para caber com legibilidade, sem cortar textos ou imagens.

## Validação
- Verificar tipos e testes existentes.
- Gerar e inspecionar visualmente todas as páginas de um relatório de exemplo, confirmando ausência de cortes, sobreposições e páginas vazias.
