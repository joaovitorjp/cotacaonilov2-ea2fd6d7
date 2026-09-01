# Nilo Quoter

Quero criar um sistema de cotação simples com layout semelhante ao da planilha que enviei (com opções na parte superior e planilha central). O sistema deve usar lovable como banco de dados e seguir o fluxo abaixo (utilize o design já feito e apenas ajuste):

Layout Principal

Cabeçalho: título “Nilo Atacadista”.

Quatro botões principais no topo:

Importar Lista

Carregar Lista

Gerar Link Cotação (só habilitado quando houver lista carregada).

Cotações Finalizadas

Área central: uma planilha editável onde serão exibidas as listas carregadas.

Botão flutuante no canto inferior direito para encerrar a cotação (só aparece quando houver cotação em andamento).

Fluxo da Opção “Importar Lista”

O usuário poderá anexar um arquivo .xls com colunas no seguinte formato:

Coluna A: código interno do produto.

Coluna B: descrição do produto.

Coluna C: código de barras do produto.

Após importar, os dados serão salvos no banco lovable em uma tabela chamada listas.

Fluxo da Opção “Carregar Lista”

Exibir todas as listas já salvas no banco.

Ao selecionar uma lista, carregar seus produtos na planilha exibida na tela.

A planilha mostrará as 3 colunas iniciais (codigo_interno, descricao, codigo_barras) e todas as colunas de respostas de empresas que já participaram.

Fluxo da Opção “Gerar Link Cotação”

Disponível apenas quando uma lista estiver carregada.

O usuário informa o nome da empresa que responderá a cotação.

O sistema gera um link único (UUID) que abre uma página específica para essa empresa responder.

Página de Resposta da Empresa (via Link Gerado)

Exibe a mesma planilha com os produtos, porém sem as opções do topo.

Adiciona uma nova coluna ao lado da coluna de código de barras chamada “Preço [empresa]”.

A empresa poderá preencher os preços de cada produto.

Botão Enviar Resposta no final.

Ao enviar, os preços preenchidos serão salvos diretamente na lista principal do banco Supabase, adicionando uma nova coluna com os valores dessa empresa.

O nome da empresa aparece no topo da nova coluna.

Fluxo da Opção “Encerrar Cotação”

Botão flutuante no canto inferior direito da tela principal.

Quando clicado, altera o status da lista para “finalizada”.

A lista deixa de aparecer nas listas abertas e passa a aparecer em Cotações Finalizadas.

Fluxo da Opção “Cotações Finalizadas”

Mostra todas as listas com status “finalizada”.

Ao selecionar, abre a planilha com todas as respostas já salvas.

Nenhuma edição é permitida nesse estado (apenas visualização).

Banco de Dados Lovable

listas → guarda os produtos e status da cotação.

links_cotacao → controla os links únicos gerados para empresas responderem.

respostas (opcional, caso queira separar das listas):

id (uuid) PK
lista_id (uuid) FK → listas.id
empresa (text)
resposta (jsonb) → [{ codigo_interno, preco }]
created_at (timestamp)

👉 Esse é o fluxo principal que deve ser implementado, com todas as telas, botões e integrações ao banco de dados lovable.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cotacaonilov2.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9333e97f-3e48-4994-8e42-a35466d60151).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
