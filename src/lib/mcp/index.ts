import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCotacoes from "./tools/list-cotacoes";
import getCotacao from "./tools/get-cotacao";
import listFornecedores from "./tools/list-fornecedores";
import listRespostas from "./tools/list-respostas";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "cotacoes-nilo-mcp",
  title: "COTARME MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas de leitura para o sistema COTARME. Use `list_cotacoes` para ver cotações do usuário, `get_cotacao` para detalhes de uma cotação, `list_fornecedores` para os fornecedores cadastrados e `list_respostas` para respostas de fornecedores a uma cotação. Todos os dados são escopados ao usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCotacoes, getCotacao, listFornecedores, listRespostas],
});
