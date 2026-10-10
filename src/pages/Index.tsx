import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import SpreadsheetTable from '@/components/SpreadsheetTable';
import ImportListaPanel from '@/components/ImportListaPanel';
import CarregarListaPanel from '@/components/CarregarListaPanel';
import GerarLinkPanel from '@/components/GerarLinkPanel';
import FornecedoresPanel from '@/components/FornecedoresPanel';
import MixProdutosPanel from '@/components/MixProdutosPanel';
import AnalisePrecosPanel from '@/components/AnalisePrecosPanel';
import Dashboard from '@/components/Dashboard';
import PerfilPanel from '@/components/PerfilPanel';
import { useAvatar } from '@/hooks/useAvatar';
import HeaderAvatarButton from '@/components/HeaderAvatarButton';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import AccessStatusBadge from '@/components/AccessStatusBadge';
import adrLogo from '@/assets/adr-logo.jpeg';
import { useBranding } from '@/hooks/useBranding';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ProfileGate from '@/components/ProfileGate';
import { condicoesFromLink, getPrecoUF, ufsDaResposta, ordenarUFs, ufNome } from '@/lib/estados';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUserRole } from '@/hooks/useUserRole';
import { LogOut, Menu, X, Home, Upload, FolderOpen, Link2, CheckSquare, Users, BarChart3, Table, User as UserIcon, Package, Shield, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Lista {
  id: string;
  nome: string;
  status: string;
  produtos: { codigo_interno: string; descricao: string; codigo_barras: string }[];
  created_at: string;
  prazo?: string | null;
}

interface RespostaEmpresa {
  empresa: string;
  resposta: { codigo_interno: string; preco?: number | string; preco_mt?: number | string; preco_go?: number | string }[];
  created_at?: string;
}

const Index = () => {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const brand = useBranding();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [carregarOpen, setCarregarOpen] = useState(false);
  const [finalizadasOpen, setFinalizadasOpen] = useState(false);
  const [gerarLinkOpen, setGerarLinkOpen] = useState(false);
  const [fornecedoresOpen, setFornecedoresOpen] = useState(false);
  const [mixOpen, setMixOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const { avatarUrl } = useAvatar();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [currentLista, setCurrentLista] = useState<Lista | null>(null);
  const [respostas, setRespostas] = useState<RespostaEmpresa[]>([]);
  const [isFinalized, setIsFinalized] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [activeTab, setActiveTab] = useState<'planilha' | 'analise'>('planilha');

  // Confirmation dialog for encerrar
  const [showEncerrarDialog, setShowEncerrarDialog] = useState(false);
  const [encerrarStats, setEncerrarStats] = useState<{ total: number; responded: number; pending: string[] }>({ total: 0, responded: 0, pending: [] });

  const [tipoPrecoMap, setTipoPrecoMap] = useState<Record<string, string>>({});

  // Edição do prazo da cotação
  const [prazoDialogOpen, setPrazoDialogOpen] = useState(false);
  const [prazoData, setPrazoData] = useState('');
  const [prazoHora, setPrazoHora] = useState('23:59');
  const [savingPrazo, setSavingPrazo] = useState(false);

  const openPrazoDialog = () => {
    if (!currentLista) return;
    if (currentLista.prazo) {
      const d = new Date(currentLista.prazo);
      const pad = (n: number) => String(n).padStart(2, '0');
      setPrazoData(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setPrazoHora(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      setPrazoData('');
      setPrazoHora('23:59');
    }
    setPrazoDialogOpen(true);
  };

  const savePrazo = async (clear = false) => {
    if (!currentLista) return;
    if (!clear && !prazoData) {
      toast.error('Informe a data do prazo.');
      return;
    }
    setSavingPrazo(true);
    const novoPrazo = clear ? null : new Date(`${prazoData}T${prazoHora || '23:59'}:00`).toISOString();
    const { error } = await supabase
      .from('listas')
      .update({ prazo: novoPrazo })
      .eq('id', currentLista.id)
      .eq('user_id', user?.id ?? '');
    setSavingPrazo(false);
    if (error) {
      toast.error('Erro ao atualizar o prazo.');
      return;
    }
    setCurrentLista({ ...currentLista, prazo: novoPrazo });
    setPrazoDialogOpen(false);
    toast.success(clear ? 'Prazo removido.' : 'Prazo atualizado.');
  };

  const loadRespostas = useCallback(async (listaId: string) => {
    if (!user?.id) {
      setRespostas([]);
      return;
    }
    const { data } = await supabase
      .from('respostas')
      .select('empresa, resposta, created_at')
      .eq('user_id', user.id)
      .eq('lista_id', listaId);
    setRespostas((data ?? []).map((d: any) => ({ empresa: d.empresa, resposta: d.resposta as any[], created_at: d.created_at })));

    const { data: links } = await supabase
      .from('links_cotacao')
      .select('empresa, tipo_preco_mt, tipo_preco_go, frete_mt, frete_go, condicoes')
      .eq('user_id', user.id)
      .eq('lista_id', listaId);
    const map: Record<string, string> = {};
    (links ?? []).forEach((l: any) => {
      const cond = condicoesFromLink(l);
      Object.entries(cond).forEach(([uf, c]) => {
        map[`${l.empresa}_${uf}`] = c.tipo;
        map[`${l.empresa}_${uf}_FRETE`] = c.frete;
      });
    });
    setTipoPrecoMap(map);
  }, [user?.id]);


  // 1. REALTIME: Subscribe to new responses when a lista is open
  useEffect(() => {
    if (!currentLista || showDashboard) return;

    const channel = supabase
      .channel(`respostas-${currentLista.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'respostas',
          filter: `lista_id=eq.${currentLista.id}`,
        },
        (payload: any) => {
          const empresa = payload.new?.empresa || 'Fornecedor';
          toast.success(`📩 Nova resposta recebida de "${empresa}"!`, { duration: 6000 });
          loadRespostas(currentLista.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'respostas',
          filter: `lista_id=eq.${currentLista.id}`,
        },
        (payload: any) => {
          const empresa = payload.new?.empresa || 'Fornecedor';
          toast.info(`🔄 Resposta atualizada por "${empresa}"`, { duration: 4000 });
          loadRespostas(currentLista.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentLista?.id, showDashboard, loadRespostas]);

  const handleListaSelected = async (lista: Lista, finalized = false) => {
    setCurrentLista(lista);
    setIsFinalized(finalized);
    setShowDashboard(false);
    setActiveTab('planilha');
    await loadRespostas(lista.id);
  };

  const handleBackToDashboard = () => {
    setCurrentLista(null);
    setRespostas([]);
    setIsFinalized(false);
    setShowDashboard(true);
    setActiveTab('planilha');
  };

  // 4. CONFIRMATION: Load stats before showing dialog
  const handleEncerrarClick = async () => {
    if (!currentLista) return;
    const { data: links } = await supabase
      .from('links_cotacao')
      .select('empresa, respondido')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', currentLista.id);

    const allLinks = links ?? [];
    const responded = allLinks.filter(l => l.respondido).length;
    const pending = allLinks.filter(l => !l.respondido).map(l => l.empresa);

    setEncerrarStats({ total: allLinks.length, responded, pending });
    setShowEncerrarDialog(true);
  };

  const handleEncerrarConfirm = async () => {
    if (!currentLista) return;
    const { error } = await supabase
      .from('listas')
      .update({ status: 'finalizada' })
      .eq('id', currentLista.id)
      .eq('user_id', user?.id ?? '');

    if (error) {
      toast.error('Erro ao encerrar cotação.');
    } else {
      toast.success(`Cotação "${currentLista.nome}" encerrada.`);
      handleBackToDashboard();
    }
    setShowEncerrarDialog(false);
  };

  const handleExport = async (lista: Lista) => {
    const [{ data }, { data: mk }, { data: tps }] = await Promise.all([
      supabase.from('respostas').select('empresa, resposta').eq('user_id', user?.id ?? '').eq('lista_id', lista.id),
      supabase.from('price_markups').select('empresa, markup_percent').eq('lista_id', lista.id).eq('user_id', user?.id ?? ''),
      (supabase as any).from('price_types').select('empresa, estado, tipo').eq('lista_id', lista.id),
    ]);

    const markups: Record<string, number> = {};
    (mk ?? []).forEach((m: any) => { markups[m.empresa] = Number(m.markup_percent) || 0; });
    const tipos: Record<string, string> = {};
    (tps ?? []).forEach((t: any) => { tipos[`${t.empresa}_${t.estado}`] = t.tipo; });
    const tipoLabel = (emp: string, uf: string) => {
      const t = tipos[`${emp}_${uf}`] ?? (uf === 'GO' ? 'NOTA' : 'IPI_ST');
      return t === 'NOTA' ? 'PREÇO NOTA' : 'IPI + ST';
    };

    const resps: RespostaEmpresa[] = (data ?? [])
      .map((d: any) => ({ empresa: d.empresa, resposta: (d.resposta as any[]) ?? [] }));

    const ufs = ordenarUFs(resps.flatMap(r => ufsDaResposta(r.resposta as any[])));
    const byEmpPorUf: Record<string, Record<string, Record<string, number>>> = {};
    for (const uf of ufs) {
      byEmpPorUf[uf] = {};
      for (const r of resps) {
        byEmpPorUf[uf][r.empresa] = {};
        for (const item of r.resposta as any[]) {
          if (!item?.codigo_interno && item?.codigo_interno !== 0) continue;
          const v = parsePrecoNum(getPrecoUF(item, uf));
          if (v !== null && v > 0) byEmpPorUf[uf][r.empresa][String(item.codigo_interno)] = aplicarMarkup(v, markups[r.empresa]);
        }
      }
    }
    const empresasPorUf: Record<string, string[]> = {};
    ufs.forEach(uf => {
      empresasPorUf[uf] = resps.map(r => r.empresa).filter(e => Object.keys(byEmpPorUf[uf][e]).length > 0);
    });
    const ufsAtivas = ufs.filter(uf => empresasPorUf[uf].length > 0);

    const C = {
      navy: 'FF0F3D66', blue: 'FF1F5F99', soft: 'FFEAF1F8', zebra: 'FFF7F9FB', border: 'FFD5DDE6',
      text: 'FF1F2937', muted: 'FF64748B', green: 'FF166534', greenBg: 'FFDCFCE7', white: 'FFFFFFFF',
    };
    const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
    const thin = { style: 'thin' as const, color: { argb: C.border } };
    const money = '"R$" #,##0.00;-"R$" #,##0.00;"-"';
    const font = (o: any = {}) => ({ name: 'Arial', size: 10, color: { argb: C.text }, ...o });

    const wb = new ExcelJS.Workbook();
    wb.creator = getBrand().nome || 'COTARME';
    wb.created = new Date();
    const ws = wb.addWorksheet('Cotação', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 6, showGridLines: false }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      headerFooter: { oddFooter: `&L${lista.nome}&RPágina &P de &N` },
    });

    const fixedCols = ['Código Interno', 'Descrição do Produto', 'Código de Barras'];
    // Por UF: fornecedores + "Menor preço" + "Vencedor"
    let col = fixedCols.length + 1;
    const ufLayout: Record<string, { start: number; empCols: number[]; minCol: number; winCol: number }> = {};
    ufsAtivas.forEach(uf => {
      const empCols = empresasPorUf[uf].map((_, i) => col + i);
      const minCol = col + empresasPorUf[uf].length;
      ufLayout[uf] = { start: col, empCols, minCol, winCol: minCol + 1 };
      col = minCol + 2;
    });
    const totalCols = Math.max(col - 1, fixedCols.length);
    const HEAD = 4, SUB = 5, TIPO = 6, FIRST = 7;

    // Título
    ws.mergeCells(1, 1, 1, totalCols);
    const t = ws.getCell(1, 1);
    t.value = `${(getBrand().nome || 'COTARME').toUpperCase()} • MAPA DE COTAÇÃO`;
    t.font = font({ size: 15, bold: true, color: { argb: C.white } });
    t.fill = fill(C.navy);
    t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 28;

    ws.mergeCells(2, 1, 2, totalCols);
    const s = ws.getCell(2, 1);
    s.value = `Cotação: ${lista.nome}   |   Status: ${lista.status === 'finalizada' ? 'Finalizada' : 'Aberta'}   |   Produtos: ${lista.produtos.length}   |   ${ufsAtivas.map(uf => `${uf}: ${empresasPorUf[uf].length} fornecedor(es)`).join('   ')}   |   Gerado em ${new Date().toLocaleString('pt-BR')}`;
    s.font = font({ size: 10, color: { argb: C.navy } });
    s.fill = fill(C.soft);
    s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 20;

    const ajustes = Object.entries(markups).filter(([, v]) => v);
    ws.mergeCells(3, 1, 3, totalCols);
    const n = ws.getCell(3, 1);
    n.value = `Preços finais já com ajustes aplicados na planilha (edições, cobertura de concorrentes${ajustes.length ? ' e acréscimos: ' + ajustes.map(([e, v]) => `${e} ${v > 0 ? '+' : ''}${v.toFixed(1)}%`).join(', ') : ''}). Verde = menor preço do estado.`;
    n.font = font({ size: 9, italic: true, color: { argb: C.muted } });
    n.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
    ws.getRow(3).height = 18;

    fixedCols.forEach((label, i) => {
      ws.mergeCells(HEAD, i + 1, TIPO, i + 1);
      const c = ws.getCell(HEAD, i + 1);
      c.value = label;
      c.font = font({ bold: true, color: { argb: C.white } });
      c.fill = fill(C.navy);
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    ufsAtivas.forEach(uf => {
      const L = ufLayout[uf];
      ws.mergeCells(HEAD, L.start, HEAD, L.winCol);
      const g = ws.getCell(HEAD, L.start);
      g.value = `${ufNome(uf).toUpperCase()} (${uf})`;
      g.font = font({ size: 11, bold: true, color: { argb: C.white } });
      g.fill = fill(C.navy);
      g.alignment = { vertical: 'middle', horizontal: 'center' };
      empresasPorUf[uf].forEach((emp, i) => {
        const c = ws.getCell(SUB, L.empCols[i]);
        c.value = markups[emp] ? `${emp} (${markups[emp] > 0 ? '+' : ''}${markups[emp].toFixed(1)}%)` : emp;
        c.font = font({ bold: true, color: { argb: C.white } });
        c.fill = fill(C.blue);
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        const tp = ws.getCell(TIPO, L.empCols[i]);
        tp.value = tipoLabel(emp, uf);
        tp.font = font({ size: 8, color: { argb: C.navy } });
        tp.fill = fill(C.soft);
        tp.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      [[L.minCol, 'MENOR PREÇO'], [L.winCol, 'VENCEDOR']].forEach(([cc, label]) => {
        ws.mergeCells(SUB, cc as number, TIPO, cc as number);
        const c = ws.getCell(SUB, cc as number);
        c.value = label;
        c.font = font({ bold: true, color: { argb: C.green } });
        c.fill = fill(C.greenBg);
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    });
    ws.getRow(HEAD).height = 22;
    ws.getRow(SUB).height = 32;
    ws.getRow(TIPO).height = 16;

    lista.produtos.forEach((prod, rIdx) => {
      const r = FIRST + rIdx;
      const row = ws.getRow(r);
      row.height = 18;
      const zebra = rIdx % 2 === 1;
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(r, c);
        cell.font = font();
        if (zebra) cell.fill = fill(C.zebra);
      }
      ws.getCell(r, 1).value = prod.codigo_interno ?? '';
      ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getCell(r, 2).value = prod.descricao ?? '';
      ws.getCell(r, 2).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      ws.getCell(r, 3).value = prod.codigo_barras ?? '';
      ws.getCell(r, 3).numFmt = '@';
      ws.getCell(r, 3).alignment = { vertical: 'middle', horizontal: 'center' };

      ufsAtivas.forEach(uf => {
        const L = ufLayout[uf];
        const precos: { col: number; v: number; emp: string }[] = [];
        empresasPorUf[uf].forEach((emp, i) => {
          const v = byEmpPorUf[uf][emp][String(prod.codigo_interno)];
          const cell = ws.getCell(r, L.empCols[i]);
          cell.numFmt = money;
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          if (v !== undefined) { cell.value = v; precos.push({ col: L.empCols[i], v, emp }); }
        });
        const minC = ws.getCell(r, L.minCol);
        const winC = ws.getCell(r, L.winCol);
        minC.numFmt = money;
        minC.alignment = { vertical: 'middle', horizontal: 'right' };
        winC.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        if (precos.length) {
          const min = Math.min(...precos.map(p => p.v));
          const winners = precos.filter(p => p.v === min);
          minC.value = min;
          minC.font = font({ bold: true, color: { argb: C.green } });
          winC.value = winners.map(w => w.emp).join(' / ');
          winC.font = font({ size: 9, bold: true, color: { argb: C.green } });
          if (precos.length >= 2) winners.forEach(w => {
            const cell = ws.getCell(r, w.col);
            cell.font = font({ bold: true, color: { argb: C.green } });
            cell.fill = fill(C.greenBg);
          });
        } else {
          winC.value = '-';
          winC.font = font({ color: { argb: C.muted } });
        }
      });
    });

    const lastRow = FIRST + lista.produtos.length - 1;
    // Linha de totais
    const totRow = lastRow + 1;
    ws.mergeCells(totRow, 1, totRow, 3);
    const tl = ws.getCell(totRow, 1);
    tl.value = 'TOTAL (soma dos preços cotados)';
    tl.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    for (let c = 1; c <= totalCols; c++) {
      const cell = ws.getCell(totRow, c);
      cell.fill = fill(C.soft);
      cell.font = font({ bold: true, color: { argb: C.navy } });
      cell.border = { top: { style: 'medium', color: { argb: C.navy } }, bottom: thin, left: thin, right: thin };
    }
    if (lista.produtos.length) ufsAtivas.forEach(uf => {
      const L = ufLayout[uf];
      [...L.empCols, L.minCol].forEach(cc => {
        const letter = ws.getColumn(cc).letter;
        const cell = ws.getCell(totRow, cc);
        cell.value = { formula: `SUM(${letter}${FIRST}:${letter}${lastRow})` };
        cell.numFmt = money;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      });
    });
    ws.getRow(totRow).height = 20;

    for (let r = HEAD; r <= Math.max(lastRow, TIPO); r++) {
      for (let c = 1; c <= totalCols; c++) ws.getCell(r, c).border = { top: thin, left: thin, bottom: thin, right: thin };
    }
    ufsAtivas.forEach(uf => {
      const L = ufLayout[uf];
      for (let r = HEAD; r <= totRow; r++) {
        const a = ws.getCell(r, L.start);
        a.border = { ...a.border, left: { style: 'medium', color: { argb: C.navy } } };
        const b = ws.getCell(r, L.winCol);
        b.border = { ...b.border, right: { style: 'medium', color: { argb: C.navy } } };
      }
    });

    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = Math.min(60, Math.max(36, ...lista.produtos.map(p => String(p.descricao ?? '').length * 0.9)));
    ws.getColumn(3).width = 17;
    ufsAtivas.forEach(uf => {
      const L = ufLayout[uf];
      L.empCols.forEach(cc => { ws.getColumn(cc).width = 15; });
      ws.getColumn(L.minCol).width = 14;
      ws.getColumn(L.winCol).width = 22;
    });

    if (lista.produtos.length) ws.autoFilter = { from: { row: TIPO, column: 1 }, to: { row: lastRow, column: totalCols } };
    ws.pageSetup.printTitlesRow = `${HEAD}:${TIPO}`;

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lista.nome}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Planilha exportada!');
  };

  const handleDownloadResultados = async (lista: Lista, formato: 'ciss' | 'consinco' = 'ciss', empresaFiltro?: string) => {
    const { data } = await supabase
      .from('respostas')
      .select('empresa, resposta')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', lista.id);

    const resps: RespostaEmpresa[] = (data ?? []).map((d: any) => ({
      empresa: d.empresa,
      resposta: d.resposta as any[],
    }));

    // Código interno por empresa + estado (MT/GO com colunas dedicadas; demais UFs usam fallback genérico)
    const codigoConsincoPorEmpresa: Record<string, string> = {};
    const codigoConsincoPorEmpresaEstado: Record<string, string> = {};
    if (formato === 'consinco') {
      const { data: forns } = await supabase
        .from('fornecedores')
        .select('nome, codigo_interno_consinco, codigo_interno_consinco_mt, codigo_interno_consinco_go, codigo_interno, codigo_estado')
        .eq('user_id', user?.id ?? '');
      (forns ?? []).forEach((f: any) => {
        const key = String(f.nome).trim().toLowerCase();
        const codMt = f.codigo_interno_consinco_mt || '';
        const codGo = f.codigo_interno_consinco_go || '';
        if (codMt) codigoConsincoPorEmpresaEstado[`${key}|MT`] = codMt;
        if (codGo) codigoConsincoPorEmpresaEstado[`${key}|GO`] = codGo;
        const legado = f.codigo_interno_consinco || f.codigo_interno || '';
        if (legado) {
          const est = String(f.codigo_estado || '').toUpperCase();
          if (est && !codigoConsincoPorEmpresaEstado[`${key}|${est}`]) {
            codigoConsincoPorEmpresaEstado[`${key}|${est}`] = legado;
          }
        }
        const generico = codMt || codGo || legado;
        if (generico && !codigoConsincoPorEmpresa[key]) codigoConsincoPorEmpresa[key] = generico;
      });
    }


    const { data: mkCsv } = await supabase.from('price_markups').select('empresa, markup_percent').eq('lista_id', lista.id).eq('user_id', user?.id ?? '');
    const markupsCsv: Record<string, number> = {};
    (mkCsv ?? []).forEach((m: any) => { markupsCsv[m.empresa] = Number(m.markup_percent) || 0; });
    const parsePrice = (raw: any, empresa?: string): number => {
      const n = parsePrecoNum(raw);
      return n === null ? NaN : aplicarMarkup(n, empresa ? markupsCsv[empresa] : 0);
    };

    const ufs = ordenarUFs(resps.flatMap(r => ufsDaResposta(r.resposta as any[])));

    let totalArquivos = 0;

    for (const uf of ufs) {
      const winnersBySupplier: Record<string, { codigo_barras: string; preco: number }[]> = {};

      for (const prod of lista.produtos) {
        let lowestPrice = Infinity;
        let winnerEmpresa: string | null = null;

        for (const resp of resps) {
          const item = resp.resposta.find((i: any) => i.codigo_interno === prod.codigo_interno);
          if (!item) continue;
          const raw = getPrecoUF(item, uf);
          const num = parsePrice(raw, resp.empresa);
          if (!isNaN(num) && num > 0 && num < lowestPrice) {
            lowestPrice = num;
            winnerEmpresa = resp.empresa;
          }
        }

        if (winnerEmpresa && lowestPrice !== Infinity) {
          if (!winnersBySupplier[winnerEmpresa]) winnersBySupplier[winnerEmpresa] = [];
          winnersBySupplier[winnerEmpresa].push({ codigo_barras: prod.codigo_barras, preco: lowestPrice });
        }
      }

      const suppliers = Object.keys(winnersBySupplier).filter(
        e => !empresaFiltro || e.trim().toLowerCase() === empresaFiltro.trim().toLowerCase()
      );
      for (const empresa of suppliers) {
        const items = winnersBySupplier[empresa];
        const csvLines = items.map(item => {
          if (formato === 'consinco') {
            const empKey = empresa.trim().toLowerCase();
            const codFornecedor =
              codigoConsincoPorEmpresaEstado[`${empKey}|${uf}`] ??
              codigoConsincoPorEmpresa[empKey] ??
              '';
            const preco = item.preco.toFixed(2);
            // A;B;C;D;E;F;G;H;I;J;K
            return `${codFornecedor};;;${item.codigo_barras};;1;${preco};0;0;0;0`;
          }
          const precoFormatted = item.preco.toFixed(2).replace('.', ',');
          return `${item.codigo_barras};1;${precoFormatted}`;
        });
        const csvContent = csvLines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${lista.nome}_${uf}_${empresa}_${formato.toUpperCase()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        totalArquivos++;
      }
    }

    if (totalArquivos === 0) {
      toast.error('Nenhum preço ganhador encontrado.');
      return;
    }
    toast.success(`${totalArquivos} arquivo(s) CSV ${formato.toUpperCase()} baixado(s) (separados por estado).`);
  };


  const handleDashboardNavigate = (view: 'importar' | 'carregar' | 'finalizadas') => {
    if (view === 'importar') setImportOpen(true);
    else if (view === 'carregar') setCarregarOpen(true);
    else if (view === 'finalizadas') setFinalizadasOpen(true);
  };

  // Check if deadline passed
  const isExpired = currentLista?.prazo ? new Date(currentLista.prazo) < new Date() : false;

  const navItems: { label: string; icon: any; action: () => void; disabled?: boolean; badge?: number }[] = [
    { label: 'Início', icon: Home, action: handleBackToDashboard },
    { label: 'Importar', icon: Upload, action: () => { setImportOpen(true); setMobileMenuOpen(false); } },
    { label: 'Abertas', icon: FolderOpen, action: () => { setCarregarOpen(true); setMobileMenuOpen(false); } },
    { label: 'Gerar Link', icon: Link2, action: () => { setGerarLinkOpen(true); setMobileMenuOpen(false); }, disabled: !currentLista || isFinalized },
    { label: 'Finalizadas', icon: CheckSquare, action: () => { setFinalizadasOpen(true); setMobileMenuOpen(false); } },
    { label: 'Fornecedores', icon: Users, action: () => { setFornecedoresOpen(true); setMobileMenuOpen(false); } },
    { label: 'Mix de Produtos', icon: Package, action: () => { setMixOpen(true); setMobileMenuOpen(false); } },
    { label: 'Perfil', icon: UserIcon, action: () => { setPerfilOpen(true); setMobileMenuOpen(false); } },
  ];

  if (isAdmin) {
    navItems.splice(navItems.length - 1, 0, {
      label: 'Admin',
      icon: Shield,
      action: () => { setMobileMenuOpen(false); navigate('/admin'); },
    });
  }

  const primaryLabels = ['Importar', 'Abertas', 'Gerar Link', 'Finalizadas'];
  const primaryItems = navItems.filter(i => primaryLabels.includes(i.label));
  const secondaryItems = navItems.filter(i => !primaryLabels.includes(i.label) && i.label !== 'Início' && i.label !== 'Perfil');


  return (
    <ProfileGate>
      <div className="flex flex-col h-screen bg-[#F8FAFC]">
        {/* Modern Header */}
        <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={handleBackToDashboard} className="p-1 rounded-xl" title={brand.nome}>
              <img src={brand.logo} alt={brand.nome} className="h-9 w-9 rounded-lg object-contain" />
            </button>
            <div>
              <h1 className="text-lg font-display font-bold text-slate-900 tracking-tight cursor-pointer" onClick={handleBackToDashboard}>
                {brand.nome}
              </h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Gestão de Cotações</p>
            </div>
          </div>

          {/* Desktop nav - Refined */}
          <div className="hidden lg:flex items-center gap-2 min-w-0">
            {primaryItems.map(item => (
              <Button
                key={item.label}
                variant={item.label === 'Gerar Link' ? 'default' : 'ghost'}
                size="sm"
                onClick={item.action}
                disabled={item.disabled}
                className={`relative shrink-0 text-xs font-bold rounded-xl h-9 ${
                  item.label === 'Gerar Link'
                    ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                } ${item.disabled ? 'opacity-30' : ''}`}
              >
                <item.icon className="w-3.5 h-3.5 mr-2" />
                {item.label}
                {!!item.badge && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </Button>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="shrink-0 text-xs font-bold rounded-xl h-9 text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                  Mais
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Outras opções</DropdownMenuLabel>
                {secondaryItems.map(item => (
                  <DropdownMenuItem
                    key={item.label}
                    onClick={item.action}
                    disabled={item.disabled}
                    className="gap-2 cursor-pointer"
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2 cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="w-4 h-4" />
                  Sair da Conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <AccessStatusBadge />
            <LanguageSwitcher variant="subtle" className="shrink-0" />
            <HeaderAvatarButton onClick={() => setPerfilOpen(true)} />
          </div>

          {/* Mobile menu toggle */}
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            <LanguageSwitcher variant="subtle" className="shrink-0" />
            <HeaderAvatarButton onClick={() => { setPerfilOpen(true); setMobileMenuOpen(false); }} />
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="w-9 h-9 rounded-xl shrink-0">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

        </header>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1 shrink-0 animate-in slide-in-from-top duration-200">
          {navItems.map(item => (
            <button
              key={item.label}
              onClick={() => { item.action(); setMobileMenuOpen(false); }}
              disabled={item.disabled}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-left transition-all ${
                item.disabled
                  ? 'opacity-30 cursor-not-allowed text-slate-400'
                  : 'text-slate-600 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              {item.label === 'Perfil' && avatarUrl ? (
                <img src={avatarUrl} alt="Foto de perfil" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <item.icon className="w-4 h-4" />
              )}

              {item.label}
              {!!item.badge && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => { signOut(); setMobileMenuOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-left text-red-600 hover:bg-red-50 active:bg-red-100 mt-2 border-t border-slate-100 pt-3"
          >
            <LogOut className="w-4 h-4" />
            Sair da Conta
          </button>
        </div>
      )}

      {/* Lista info bar with tabs - Refined */}
      {currentLista && !showDashboard && (
        <div className="shrink-0 border-b border-slate-200 bg-white">
          <div className="px-4 sm:px-8 py-3 flex items-center gap-3 flex-wrap">
            <button 
              onClick={handleBackToDashboard} 
              className="text-slate-400 hover:text-primary transition-colors p-1.5 hover:bg-slate-50 rounded-lg"
              title="Voltar ao início"
            >
              <Home className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-900 leading-none mb-0.5">{currentLista.nome}</span>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {currentLista.produtos.length} itens • {respostas.length} respostas
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isFinalized && (
                <span className="text-[9px] font-black tracking-widest uppercase bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md">
                  FINALIZADA
                </span>
              )}
              {!isFinalized ? (
                <button
                  onClick={openPrazoDialog}
                  title="Editar prazo de expiração"
                  className={`text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-md transition-colors hover:opacity-80 ${
                    !currentLista.prazo
                      ? 'bg-slate-100 text-slate-500'
                      : isExpired ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {!currentLista.prazo
                    ? 'DEFINIR PRAZO'
                    : isExpired
                      ? `EXPIRADA (${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })})`
                      : `Prazo: ${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </button>
              ) : currentLista.prazo ? (
                <span className="text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-md bg-blue-50 text-blue-600">
                  {`Prazo: ${new Date(currentLista.prazo).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </span>
              ) : null}
              {!isFinalized && respostas.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-[10px] font-bold border-slate-200 hover:bg-slate-50 rounded-lg px-3" 
                  onClick={() => loadRespostas(currentLista.id)}
                >
                  Sincronizar
                </Button>
              )}
            </div>
          </div>

          {/* Tabs - Modern Minimalist */}
          {respostas.length > 0 && (
            <div className="flex px-4 sm:px-8 gap-6 border-t border-slate-100">
              <button
                onClick={() => setActiveTab('planilha')}
                className={`flex items-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'planilha' 
                    ? 'text-primary' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                Planilha
                {activeTab === 'planilha' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
              </button>
              <button
                onClick={() => setActiveTab('analise')}
                className={`flex items-center gap-2 py-3 text-[11px] font-black uppercase tracking-widest transition-all relative ${
                  activeTab === 'analise' 
                    ? 'text-primary' 
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Análise
                {activeTab === 'analise' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {showDashboard ? (
        <Dashboard onNavigate={handleDashboardNavigate} />
      ) : activeTab === 'planilha' ? (
        <SpreadsheetTable
          produtos={currentLista?.produtos ?? []}
          respostas={respostas}
          tipoPrecoMap={tipoPrecoMap}

          readOnly={false}
          highlightLowest={respostas.length > 1}
          listaId={currentLista?.id}
          onDeleteResposta={currentLista ? async (empresa: string) => {
            const { error } = await supabase
              .from('respostas')
              .delete()
              .eq('lista_id', currentLista.id)
              .eq('empresa', empresa)
              .eq('user_id', user?.id ?? '');
            if (error) {
              toast.error('Erro ao excluir dados do fornecedor.');
            } else {
              setRespostas(prev => prev.filter(r => r.empresa !== empresa));
              toast.success(`Dados de "${empresa}" excluídos com sucesso.`);
            }
          } : undefined}
          onSave={currentLista ? async (updatedProdutos, options) => {
            const { error } = await supabase
              .from('listas')
              .update({ produtos: updatedProdutos as any })
              .eq('id', currentLista.id)
              .eq('user_id', user?.id ?? '');
            if (error) {
              toast.error('Erro ao salvar alterações.');
              throw error;
            } else {
              setCurrentLista({ ...currentLista, produtos: updatedProdutos });
              if (!options?.silent) toast.success('Alterações salvas com sucesso!');
            }
          } : undefined}
          onAfterSave={currentLista ? () => loadRespostas(currentLista.id) : undefined}
          onAddEmpresa={currentLista ? (async (empresa: string, states: string[]) => {
            const marker = [{ __manual_states: states }] as any;
            const { error } = await supabase
              .from('respostas')
              .insert({ lista_id: currentLista.id, empresa, resposta: marker, user_id: user?.id });
            if (error) {
              toast.error('Erro ao adicionar fornecedor.');
            } else {
              await loadRespostas(currentLista.id);
              toast.success(`Coluna "${empresa}" adicionada em ${states.join(' e ')}!`);
            }
          }) as any : undefined}
        />
      ) : (
        <AnalisePrecosPanel
          produtos={currentLista?.produtos ?? []}
          respostas={respostas}
          listaNome={currentLista?.nome}
        />
      )}

      {/* Floating button - Modernized */}
      {currentLista && !isFinalized && !showDashboard && (
        <button
          onClick={handleEncerrarClick}
          className="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-xl shadow-slate-200 font-bold text-xs uppercase tracking-widest hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all z-50 flex items-center gap-2"
        >
          <CheckSquare className="w-4 h-4" />
          Encerrar Cotação
        </button>
      )}

      {/* 4. Encerrar Confirmation Dialog - Themed */}
      <AlertDialog open={showEncerrarDialog} onOpenChange={setShowEncerrarDialog}>
        <AlertDialogContent className="rounded-3xl border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bold text-slate-900">Encerrar cotação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p className="text-slate-600 text-sm">Deseja encerrar a cotação <strong>"{currentLista?.nome}"</strong>? Após encerrar, fornecedores não poderão mais enviar respostas.</p>
                
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Links gerados</span>
                    <span className="font-black text-slate-900">{encerrarStats.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold uppercase tracking-wider">Responderam</span>
                    <span className="font-black text-emerald-600">{encerrarStats.responded}</span>
                  </div>
                  {encerrarStats.pending.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/50">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Aguardando resposta de:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {encerrarStats.pending.map(emp => (
                          <span key={emp} className="text-[9px] font-black uppercase tracking-widest bg-slate-200/50 text-slate-600 px-2 py-1 rounded-md">
                            {emp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-slate-200 text-xs font-bold">Continuar Aberta</AlertDialogCancel>
            <AlertDialogAction onClick={handleEncerrarConfirm} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold">
              Encerrar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Panels */}
      <ImportListaPanel open={importOpen} onOpenChange={setImportOpen} onImported={() => {}} />
      <CarregarListaPanel
        open={carregarOpen}
        onOpenChange={setCarregarOpen}
        onListaSelected={lista => handleListaSelected(lista, false)}
        statusFilter="aberta"
        title="Listas Abertas"
      />
      <CarregarListaPanel
        open={finalizadasOpen}
        onOpenChange={setFinalizadasOpen}
        onListaSelected={lista => handleListaSelected(lista, true)}
        statusFilter="finalizada"
        title="Cotações Finalizadas"
        onExport={handleExport}
        onDownloadResultados={handleDownloadResultados}
      />
      <FornecedoresPanel open={fornecedoresOpen} onOpenChange={setFornecedoresOpen} />
      <MixProdutosPanel open={mixOpen} onOpenChange={setMixOpen} />
      <AlertDialog open={prazoDialogOpen} onOpenChange={setPrazoDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prazo de expiração</AlertDialogTitle>
            <AlertDialogDescription>
              Defina a data e o horário limite para os fornecedores responderem esta cotação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Data</label>
              <input
                type="date"
                value={prazoData}
                onChange={e => setPrazoData(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Horário</label>
              <input
                type="time"
                value={prazoHora}
                onChange={e => setPrazoHora(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingPrazo}>Cancelar</AlertDialogCancel>
            {currentLista?.prazo && (
              <Button variant="outline" disabled={savingPrazo} onClick={() => savePrazo(true)}>
                Remover prazo
              </Button>
            )}
            <Button disabled={savingPrazo} onClick={() => savePrazo(false)}>
              {savingPrazo ? 'Salvando...' : 'Salvar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {currentLista && (
        <GerarLinkPanel open={gerarLinkOpen} onOpenChange={setGerarLinkOpen} listaId={currentLista.id} />
      )}
      <PerfilPanel open={perfilOpen} onOpenChange={setPerfilOpen} />

    </div>
    </ProfileGate>
  );
};

export default Index;
