# Mix de Produtos

Nova área individual por usuário para registrar o mix atual da loja: categorias, marcas, produtos (descrição, código de barras, imagem e preço) e comparar categorias/marcas lado a lado, usando o mesmo visual de planilha já usado nas cotações.

## Onde fica

- Novo item **Mix de Produtos** no menu do topo (desktop e celular), ao lado de Fornecedores.
- Abre um painel em tela cheia, com o mesmo estilo dos outros painéis do sistema.

## Como o usuário usa

1. **Categorias**: cria categorias (ex.: AMACIANTES, SABÃO EM PÓ), renomeia e exclui.
2. **Marcas**: dentro de cada categoria, cadastra as marcas que possui (ex.: Downy, Comfort).
3. **Produtos**: dentro de cada marca, cadastra produtos com descrição, código de barras, preço e imagem.
   - A imagem pode ser colada direto (Ctrl+V), arrastada ou escolhida do computador; é reduzida antes de salvar.
4. **Comparativo**: escolhe uma categoria e vê uma planilha com os produtos organizados por marca lado a lado, com preço e miniatura da imagem. O menor preço da linha aparece destacado em verde, como nas cotações.
5. Busca por descrição ou código de barras, e filtro por categoria/marca.

Tudo fica salvo no banco e é privado de cada usuário.

## Layout da planilha

Reaproveita a aparência da planilha atual (cabeçalhos, linhas alternadas, destaque de menor preço, larguras ajustáveis, rolagem com cabeçalho fixo). A grade do comparativo terá:

- Colunas fixas de identificação: Produto (descrição), Código de barras, Imagem.
- Uma coluna por marca da categoria selecionada, com o preço do produto correspondente.
- Edição do preço direto na célula, salvando automaticamente.

## Detalhes técnicos

Três tabelas novas no banco, todas com `user_id`, RLS restrita ao dono e GRANTs para `authenticated`/`service_role`:

- `mix_categorias` (id, user_id, nome, created_at) — nome único por usuário.
- `mix_marcas` (id, user_id, categoria_id, nome) — único por categoria.
- `mix_produtos` (id, user_id, categoria_id, marca_id, descricao, codigo_barras, preco numeric, imagem_url text, created_at).

Imagens vão para um bucket de storage `mix-produtos` com caminho `<user_id>/<uuid>`, políticas de leitura/escrita apenas para o dono; a colagem converte o blob, redimensiona para no máximo 800px e faz upload.

Arquivos novos:
- `src/components/MixProdutosPanel.tsx` — painel principal com as abas Cadastro e Comparativo.
- `src/components/mix/MixComparativo.tsx` — grade comparativa no estilo planilha.
- `src/hooks/useMixProdutos.ts` — carregamento e gravação dos dados.
- `src/lib/mix-image.ts` — colar/redimensionar/enviar imagem.

Alterações: item de menu e montagem do painel em `src/pages/Index.tsx`; termos novos no dicionário de idiomas.

## Entrega

1. Banco e storage.
2. Cadastro de categorias, marcas e produtos com imagem.
3. Comparativo em formato de planilha com destaque de menor preço.
4. Tradução PT/EN/ES e verificação no navegador.
